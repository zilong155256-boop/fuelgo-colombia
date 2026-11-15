// First-party aggregate counters only: no identity, IP, user agent or cookie data saved.
export async function onRequestPost({request,env}){
 const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
 if(!env.FUELGO_ROUTER)return new Response(null,{status:503,headers});
 const url=new URL(request.url);
 const origin=request.headers.get("Origin");
 if(origin!==url.origin)return new Response(null,{status:403,headers});
 if(request.headers.get("Sec-Fetch-Site")==="cross-site")return new Response(null,{status:403,headers});
 if((request.headers.get("content-type")||"").split(";")[0].trim()!=="application/json")return new Response(null,{status:415,headers});
 const max=Number(request.headers.get("content-length")||0);
 if(max>512)return new Response(null,{status:413,headers});
 let payload;
 try{payload=await request.json()}catch{return new Response(null,{status:400,headers})}
 if(!payload||!["PageView","DownloadClick"].includes(payload.event))return new Response(null,{status:400,headers});
 const raw=typeof payload.ad_id==="string"?payload.ad_id:"";
 const ad_id=/^[A-Za-z0-9_-]{1,64}$/.test(raw)?raw:"unattributed";
 const source_type=["ad_tag","google_search","other_referral","direct_or_shared"].includes(payload.source_type)?payload.source_type:"unknown";
 try{
  const id=env.FUELGO_ROUTER.idFromName("fuelgo-colombia-apk");
  const upstream=new URL("/__internal/metric",request.url);
  const result=await env.FUELGO_ROUTER.get(id).fetch(new Request(upstream,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event:payload.event,ad_id,source_type})}));
  return new Response(null,{status:result.status,headers});
 }catch{return new Response(null,{status:503,headers})}
}
export function onRequestGet(){return new Response(null,{status:405})}
