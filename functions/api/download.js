// Unified download endpoint; the separate Durable Object must be configured in Pages.
function fail(message,status=503){
 const safe=message.replaceAll("&","&amp;").replaceAll("<","&lt;");
 return new Response('<!doctype html><html lang="es-CO"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FuelGo</title><style>body{background:#f1f8f3;color:#174c35;font:16px/1.5 system-ui;display:grid;place-items:center;min-height:100svh;margin:0;padding:20px}main{background:white;border-radius:18px;padding:24px;max-width:430px;text-align:center}a{color:#087845}</style></head><body><main><h1>FuelGo</h1><p>'+safe+'</p><a href="/">Volver al inicio</a></main></body></html>',{status,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"}});
}
export async function onRequestGet({request,env}){
 if(!env.FUELGO_ROUTER)return fail("No se pudo iniciar la descarga. Inténtalo de nuevo más tarde.");
 try{
  const id=env.FUELGO_ROUTER.idFromName("fuelgo-colombia-apk");
  const response=await env.FUELGO_ROUTER.get(id).fetch(request);
  const headers=new Headers(response.headers);
  headers.set("Cache-Control","no-store");
  headers.set("Referrer-Policy","no-referrer");
  return new Response(response.body,{status:response.status,headers});
 }catch{return fail("No se pudo iniciar la descarga. Inténtalo de nuevo más tarde.");}
}
export function onRequestPost(){return fail("Método no permitido.",405)}
