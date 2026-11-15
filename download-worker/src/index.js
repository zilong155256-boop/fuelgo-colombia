// Sequential Durable Object allocation, with aggregate per-ad-ID counts.
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
 // A reduced Chrome UA may contain "Android 10; K" even when CH reports Android 11+.
 if(uaVersion&&Number(uaVersion[1])<=10&&!/^Android 10;\s*K\b/i.test(ua.slice(ua.indexOf("Android"))))return "old";
 if(!chVersion)return "unknown";
 const major=Number(chVersion[1]);
 if(!Number.isSafeInteger(major)||major===0)return "unknown";
 if(uaVersion&&Number(uaVersion[1])!==major&&!/Android 10;\s*K\b/i.test(ua))return "unknown";
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
  const disposition=(r.headers.get("content-disposition")||"").toLowerCase();
  const apkMime=mime.includes("application/vnd.android.package-archive")||mime.includes("application/octet-stream")||mime.includes("application/x-download");
  const apkName=/\.apk(?:[?#]|$)/i.test(r.url)||/filename\*?\s*=.*\.apk/i.test(disposition);
  return r.ok&&(apkMime||apkName)&&!mime.includes("text/html")&&!mime.includes("application/json");
 }catch{return false}finally{clearTimeout(timer)}
}
// Read existing Meta cookies only; never invent IDs or rewrite creation timestamps.
function metaMatchCookies(request){
 const raw=request.headers.get("Cookie")||"";
 const values={};
 for(const part of raw.split(";")){
  const at=part.indexOf("=");
  if(at<0)continue;
  const name=part.slice(0,at).trim();
  if(name!=="_fbc"&&name!=="_fbp")continue;
  const value=part.slice(at+1).trim();
  if(value.length>256||!/^fb\.\d{1,3}\.\d{13}\.[A-Za-z0-9_~.\-]+$/.test(value))continue;
  values[name]=value;
 }
 return values;
}
// Send only after explicit tracking consent. The event means a redirect was issued,
// not that an APK download or installation completed.
async function reportMetaAssignment(env,request,adId,linkId){
 const token=env.META_CAPI_TOKEN;
 if(!token)return {status:"not_configured"};
 const incoming=new URL(request.url);
 if(incoming.searchParams.get("meta_consent")!=="1")return {status:"not_consented"};
 const ua=request.headers.get("User-Agent")||"";
 const ip=request.headers.get("CF-Connecting-IP")||"";
 if(!ua||!ip)return {status:"missing_matching_data"};
 const event={
  event_name:"DownloadAssigned",
  event_time:Math.floor(Date.now()/1000),
  event_id:crypto.randomUUID(),
  action_source:"website",
  event_source_url:"https://fuelgo-colombia1.pages.dev/",
  user_data:{client_ip_address:ip,client_user_agent:ua},
  custom_data:{ad_id:adId,link_id:linkId}
 };
 const cookies=metaMatchCookies(request);
 if(cookies._fbc)event.user_data.fbc=cookies._fbc;
 if(cookies._fbp)event.user_data.fbp=cookies._fbp;
 const payload={data:[event]};
 if(env.META_TEST_EVENT_CODE)payload.test_event_code=env.META_TEST_EVENT_CODE;
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),3000);
 try{
  const response=await fetch("https://graph.facebook.com/v27.0/1907463533614212/events",{
   method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},
   body:JSON.stringify(payload),signal:controller.signal
  });
  if(!response.ok){
   let details={};
   try{
    const body=await response.json();const e=body&&body.error||{};
    details={metaCode:Number(e.code)||null,metaSubcode:Number(e.error_subcode)||null};
   }catch{}
   return {status:"failed",diagnostic:{kind:"meta_http",httpStatus:response.status,...details}};
  }
  let result;
  try{result=await response.json()}catch{return {status:"failed",diagnostic:{kind:"invalid_response",httpStatus:response.status}}}
  return result.events_received===1?{status:"sent"}:{status:"failed",diagnostic:{kind:"not_accepted",httpStatus:response.status}};
 }catch(e){return {status:"failed",diagnostic:{kind:e?.name==="AbortError"?"timeout":"network_error"}}}finally{clearTimeout(timer)}
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
 // Keep the most recent 200 aggregate event records, not visitors or personal data.
 // Existing historical counters are preserved; older individual events were never stored.
 async recordEvent(event,adId,linkId=null,sourceType="unknown"){
  const key="recent:events:v1";
  const prior=await this.state.storage.get(key);
  const events=Array.isArray(prior)?prior:[];
  events.unshift({at:new Date().toISOString(),event,adId,linkId,sourceType});
  if(events.length>200)events.length=200;
  await this.state.storage.put(key,events);
 }
 async handle(request){
  const path=new URL(request.url).pathname;
  if(path==="/__internal/stats"){
   if(request.method!=="GET")return new Response("Method not allowed",{status:405});
   const token=this.env.STATS_TOKEN||"";
   const received=request.headers.get("Authorization")||"";
   // A secret configured on the Worker is required; no public dashboard by default.
   if(!token||received!==("Bearer "+token))return new Response("Unauthorized",{status:401,headers:{"Cache-Control":"no-store"}});
   const counters=await this.state.storage.list({prefix:"count:"});
   const data={pageView:0,downloadClick:0,downloadAssigned:0,downloadComplete:null,allocationFailed:0,metaCapi:{sent:0,failed:0,notConsented:0,notConfigured:0,missingMatchingData:0},byAd:{},byLink:{},updatedAt:new Date().toISOString()};
   for(const [key,value] of counters){
    const name=key.slice(6),n=Number(value)||0;
    if(name==="page_view")data.pageView=n;
    else if(name==="download_click")data.downloadClick=n;
    else if(name==="allocation_succeeded")data.downloadAssigned=n;
    else if(name==="allocation_failed")data.allocationFailed=n;
    else if(name==="meta_capi:sent")data.metaCapi.sent=n;
    else if(name==="meta_capi:failed")data.metaCapi.failed=n;
    else if(name==="meta_capi:not_consented")data.metaCapi.notConsented=n;
    else if(name==="meta_capi:not_configured")data.metaCapi.notConfigured=n;
    else if(name==="meta_capi:missing_matching_data")data.metaCapi.missingMatchingData=n;
    else if(name.startsWith("ad:")){
     const m=name.match(/^ad:([A-Za-z0-9_-]{1,64}):(page_view|download_click|allocation_succeeded)$/);
     if(m){const row=data.byAd[m[1]]||(data.byAd[m[1]]={pageView:0,downloadClick:0,downloadAssigned:0});row[m[2]==="page_view"?"pageView":m[2]==="download_click"?"downloadClick":"downloadAssigned"]=n}
    }else if(name.startsWith("link:")){
     const m=name.match(/^link:([A-Za-z0-9_-]{1,48}):allocated$/);
     if(m)data.byLink[m[1]]=n;
    }
   }
   data.metaCapi.lastError=await this.state.storage.get("meta:last_error")||null;
   const recent=await this.state.storage.get("recent:events:v1");
   data.recentEvents=Array.isArray(recent)?recent:[];
   data.recentEventsLimit=200;
   return Response.json(data,{headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
  }
  if(path==="/__internal/metric"){
   if(request.method!=="POST")return new Response("Method not allowed",{status:405});
   if((request.headers.get("content-type")||"").split(";")[0].trim()!=="application/json")return new Response("Unsupported media type",{status:415});
   let payload;
   try{payload=await request.json()}catch{return new Response("Invalid JSON",{status:400})}
   if(!payload||!["PageView","DownloadClick"].includes(payload.event))return new Response("Invalid event",{status:400});
   const adId=typeof payload.ad_id==="string"&&/^[A-Za-z0-9_-]{1,64}$/.test(payload.ad_id)?payload.ad_id:"unattributed";
   const metric=payload.event==="PageView"?"page_view":"download_click";
   const sourceType=["ad_tag","google_search","other_referral","direct_or_shared"].includes(payload.source_type)?payload.source_type:"unknown";
   await this.count(metric);
   await this.count("ad:"+adId+":"+metric);
   await this.recordEvent(payload.event,adId,null,sourceType);
   return new Response(null,{status:204,headers:{"Cache-Control":"no-store"}});
  }
  if(request.method!=="GET")return deny("Método no permitido.",405);
  // Do not write redundant legacy button_click/eligible counts.
  const rawAdId=new URL(request.url).searchParams.get("ad_id")||"";
  const adId=/^[A-Za-z0-9_-]{1,64}$/.test(rawAdId)?rawAdId:"unattributed";
  const rawSource=new URL(request.url).searchParams.get("source_type");
  const sourceType=["ad_tag","google_search","other_referral","direct_or_shared"].includes(rawSource)?rawSource:"unknown";
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
   await this.count("ad:"+adId+":allocation_succeeded");
   await this.count("link:"+link.id+":allocated");
   await this.state.storage.put("latest_assignment",{id:link.id,ad_id:adId,at:new Date().toISOString(),result:"redirect_issued"});
   await this.recordEvent("DownloadAssigned",adId,link.id,sourceType);
   const metaResult=await reportMetaAssignment(this.env,request,adId,link.id);
   await this.count("meta_capi:"+metaResult.status);
   if(metaResult.status==="failed"&&metaResult.diagnostic){
    // Only status/error codes: no tokens, IPs, or raw API responses.
    await this.state.storage.put("meta:last_error",{...metaResult.diagnostic,at:new Date().toISOString()});
   }
   return new Response(null,{status:302,headers:{"Location":link.url,"Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex"}});
  }
  await this.count("allocation_failed");
  return deny(M.unavailable,503);
 }
}
export default {fetch(){return new Response("Not found",{status:404})}};
