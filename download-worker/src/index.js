// Server-only Android 11+ check and sequential Durable Object allocation.
// User-Agent and Client Hints are spoofable: this is best-effort, not cryptographic attestation.
const M={
 old:"Tu dispositivo necesita Android 11 o una versión superior para descargar esta aplicación.",
 other:"Esta aplicación está disponible únicamente para dispositivos Android.",
 unknown:"No pudimos verificar la versión de Android de tu dispositivo. Abre esta página en un navegador compatible e inténtalo de nuevo.",
 unavailable:"No se pudo iniciar la descarga. Inténtalo de nuevo más tarde."
};
function deny(message,status=403){
 const safe=message.replaceAll("&","&amp;").replaceAll("<","&lt;");
 return new Response('<!doctype html><html lang="es-CO"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FuelGo</title><style>body{margin:0;background:#f1f8f3;color:#164934;font:16px/1.5 system-ui;display:grid;place-items:center;min-height:100svh;padding:20px}main{background:white;border-radius:18px;padding:24px;max-width:430px;text-align:center}a{color:#087a4d}</style></head><body><main><h1>FuelGo</h1><p>'+safe+'</p><a href="/">Volver al inicio</a></main></body></html>',{status,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"}});
}
function classify(request){
 const ua=request.headers.get("User-Agent")||"";
 const platform=(request.headers.get("Sec-CH-UA-Platform")||"").replaceAll('"',"").trim().toLowerCase();
 const pv=(request.headers.get("Sec-CH-UA-Platform-Version")||"").replaceAll('"',"").trim();
 const uaAndroid=/\bAndroid\b/i.test(ua);
 if((platform&&platform!=="android")||/\biPhone\b|\biPad\b|\biPod\b|\bMacintosh\b|\bWindows NT\b|\bCrOS\b/i.test(ua))return "other";
 if(!uaAndroid&&platform!=="android")return "other";
 if(!uaAndroid||platform!=="android")return "unknown";
 const uaVersion=ua.match(/Android\s+(\d+)(?:[.;\s]|$)/i);
 const chVersion=pv.match(/^(\d+)(?:\.\d+){0,3}$/);
 if(uaVersion&&Number(uaVersion[1])<=10)return "old";
 if(!chVersion)return "unknown";
 const major=Number(chVersion[1]);
 if(!Number.isSafeInteger(major)||major===0)return "unknown";
 if(uaVersion&&Number(uaVersion[1])!==major)return "unknown";
 return major>=11?"eligible":"old";
}
function poolFrom(secret){
 let arr;try{arr=JSON.parse(secret||"[]")}catch{return []}
 if(!Array.isArray(arr))return [];
 const seen=new Set();
 return arr.filter(x=>{
  if(typeof x?.id!=="string"||!/^[-\w]{1,48}$/.test(x.id)||seen.has(x.id))return false;
  seen.add(x.id);
  if(x.enabled!==true||x.verified!==true)return false;
  try{const u=new URL(x.url);return u.protocol==="https:"&&!u.username&&!u.password}catch{return false}
 });
}
async function healthy(url){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),3500);
 try{
  const r=await fetch(url,{method:"HEAD",redirect:"follow",signal:controller.signal});
  const mime=(r.headers.get("content-type")||"").toLowerCase();
  return r.ok&&!mime.includes("text/html")&&!mime.includes("application/json");
 }catch{return false}finally{clearTimeout(timer)}
}
export class DownloadRouter {
 constructor(state,env){this.state=state;this.env=env;this.queue=Promise.resolve()}
 async fetch(request){
  let release;
  const next=new Promise(resolve=>release=resolve);
  const previous=this.queue;this.queue=next;await previous;
  try{return await this.handle(request)}finally{release()}
 }
 async count(name){
  const key="count:"+name;
  await this.state.storage.put(key,Number(await this.state.storage.get(key)||0)+1);
 }
 async handle(request){
  if(request.method!=="GET")return deny("Método no permitido.",405);
  const kind=classify(request);
  if(kind!=="eligible"){await this.count("rejected:"+kind);return deny(M[kind])}
  await this.count("eligible");
  const pool=poolFrom(this.env.DOWNLOAD_POOL);
  if(pool.length===0){await this.count("allocation_failed");return deny(M.unavailable,503)}
  const cursor=Number(await this.state.storage.get("round_robin_position")||0);
  for(let offset=0;offset<pool.length;offset++){
   const i=(cursor+offset)%pool.length;
   const link=pool[i];
   if(await this.state.storage.get("paused:"+link.id))continue;
   if(!await healthy(link.url)){
    await this.state.storage.put("paused:"+link.id,{reason:"health_check_failed",at:new Date().toISOString()});
    await this.count("link_health_failed");continue;
   }
   await this.state.storage.put("round_robin_position",(i+1)%pool.length);
   await this.count("allocation_succeeded");
   await this.count("link:"+link.id+":allocated");
   await this.state.storage.put("latest_assignment",{id:link.id,at:new Date().toISOString(),result:"redirect_issued"});
   return new Response(null,{status:302,headers:{"Location":link.url,"Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex"}});
  }
  await this.count("allocation_failed");
  return deny(M.unavailable,503);
 }
}
export default {fetch(){return new Response("Not found",{status:404})}};
