// Read-only dashboard API. Worker validates STATS_TOKEN; never place the token in source.
export async function onRequestGet({request,env}){
 const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
 if(!env.FUELGO_ROUTER)return new Response("Statistics service unavailable",{status:503,headers});
 const auth=request.headers.get("Authorization")||"";
 if(!/^Bearer [\x21-\x7E]{20,256}$/.test(auth))return new Response("Authorization required",{status:401,headers});
 try{
  const id=env.FUELGO_ROUTER.idFromName("fuelgo-colombia-apk");
  const url=new URL("/__internal/stats",request.url);
  const result=await env.FUELGO_ROUTER.get(id).fetch(new Request(url,{headers:{Authorization:auth},method:"GET"}));
  return new Response(result.body,{status:result.status,headers:{"Content-Type":result.headers.get("Content-Type")||"text/plain; charset=utf-8",...headers}});
 }catch{return new Response("Statistics unavailable",{status:503,headers})}
}
export function onRequestPost(){return new Response("Method not allowed",{status:405})}
