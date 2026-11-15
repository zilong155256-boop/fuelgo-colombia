import test from "node:test";
import assert from "node:assert/strict";
import {DownloadRouter} from "../src/index.js";

function state(){
 const data=new Map();
 return {data,storage:{
  get:async k=>data.get(k),
  put:async(k,v)=>{data.set(k,v)},
  list:async({prefix}={})=>new Map([...data].filter(([k])=>!prefix||k.startsWith(prefix)))
 }};
}
function request(ua,platform,version){
 const h={"User-Agent":ua};
 if(platform!==null)h["Sec-CH-UA-Platform"]='"'+platform+'"';
 if(version!==null)h["Sec-CH-UA-Platform-Version"]='"'+version+'"';
 return new Request("https://fuelgo.example/api/download",{headers:h});
}
const android=n=>request("Mozilla/5.0 (Linux; Android "+n+"; Pixel) AppleWebKit/537.36 Chrome/122 Mobile Safari/537.36","Android",n+".0.0");
const reduced=n=>request("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/122 Mobile Safari/537.36","Android",n+".0.0");
const pool=JSON.stringify([{id:"a",url:"https://apk.example/a.apk",enabled:true,verified:true},{id:"b",url:"https://apk.example/b.apk",enabled:true,verified:true}]);
const originalFetch=globalThis.fetch;
globalThis.fetch=async url=>new Response(null,{status:200,headers:{"content-type":"application/vnd.android.package-archive"}});

test("all devices can request the shared rotation",async()=>{
 const st=state();const router=new DownloadRouter(st,{DOWNLOAD_POOL:pool});
 const requests=[android(10),request("Mozilla/5.0 (iPhone)","iOS","17.0.0"),request("Mozilla/5.0 (Windows NT 10.0)","Windows","10.0.0")];
 for(let i=0;i<requests.length;i++){
  const res=await router.fetch(requests[i]);
  assert.equal(res.status,302);
  assert.equal(res.headers.get("location"),i%2===0?"https://apk.example/a.apk":"https://apk.example/b.apk");
 }
 assert.equal(st.data.get("count:allocation_succeeded"),3);
});
test("eligible Android 11-16 rotates without link duplication errors",async()=>{
 const st=state();const router=new DownloadRouter(st,{DOWNLOAD_POOL:pool});
 const versions=[11,12,13,14,15,16];
 const responses=await Promise.all(versions.map(android).map(req=>router.fetch(req)));
 assert.deepEqual(responses.map(r=>r.status),[302,302,302,302,302,302]);
 assert.deepEqual(responses.map(r=>r.headers.get("location")),[
 "https://apk.example/a.apk","https://apk.example/b.apk","https://apk.example/a.apk",
 "https://apk.example/b.apk","https://apk.example/a.apk","https://apk.example/b.apk"]);
 assert.equal(st.data.get("count:allocation_succeeded"),6);
 assert.equal(st.data.has("count:eligible"),false);
 assert.equal(st.data.has("count:button_click"),false);
 assert.equal(st.data.get("round_robin_position"),0);
});
test("ad ID is counted only after a successful assignment",async()=>{
 const st=state();const router=new DownloadRouter(st,{DOWNLOAD_POOL:pool});
 const req=new Request("https://fuelgo.example/api/download?ad_id=123456",{headers:{"User-Agent":"Mozilla/5.0 (iPhone)"}});
 const res=await router.fetch(req);
 assert.equal(res.status,302);
 assert.equal(st.data.get("count:ad:123456:allocation_succeeded"),1);
 assert.equal(st.data.get("latest_assignment").ad_id,"123456");
});
test("unconfigured pool fails closed",async()=>{
 const st=state();const router=new DownloadRouter(st,{});
 assert.equal((await router.fetch(android(14))).status,503);
 assert.equal(st.data.get("count:allocation_failed"),1);
});
test("unhealthy link is paused; next healthy link is used",async()=>{
 globalThis.fetch=async url=>new Response(null,{status:url.includes("/a.apk")?503:200,headers:{"content-type":"application/octet-stream"}});
 try{
  const st=state();const router=new DownloadRouter(st,{DOWNLOAD_POOL:pool});
  const r=await router.fetch(android(14));
  assert.equal(r.status,302);
  assert.equal(r.headers.get("location"),"https://apk.example/b.apk");
  assert.equal(st.data.get("paused:a").reason,"health_check_failed");
  assert.equal(st.data.get("count:link_health_failed"),1);
 }finally{globalThis.fetch=originalFetch}
});

test("stats API rejects unauthenticated access",async()=>{
 const st=state();
 const router=new DownloadRouter(st,{DOWNLOAD_POOL:pool,STATS_TOKEN:"unit-test-secret-with-32-characters"});
 const r=await router.fetch(new Request("https://fuelgo.example/__internal/stats"));
 assert.equal(r.status,401);
});
test("first-party counters and ad-level stats are readable only with token",async()=>{
 const st=state();
 const router=new DownloadRouter(st,{DOWNLOAD_POOL:pool,STATS_TOKEN:"unit-test-secret-with-32-characters"});
 for(const event of ["PageView","DownloadClick"]){
  const r=await router.fetch(new Request("https://fuelgo.example/__internal/metric",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event,ad_id:"123456"})}));
  assert.equal(r.status,204);
 }
 const auth={"Authorization":"Bearer unit-test-secret-with-32-characters"};
 const r=await router.fetch(new Request("https://fuelgo.example/__internal/stats",{headers:auth}));
 assert.equal(r.status,200);
 const json=await r.json();
 assert.equal(json.pageView,1);
 assert.equal(json.downloadClick,1);
 assert.equal(json.downloadAssigned,0);
 assert.equal(json.downloadComplete,null);
 assert.deepEqual(json.byAd["123456"],{pageView:1,downloadClick:1,downloadAssigned:0});
});

test("no consent means no Meta CAPI event, even with a token",async()=>{
 const st=state();const calls=[];
 const prior=globalThis.fetch;
 globalThis.fetch=async(input,init)=>{
  calls.push({url:String(input),method:init?.method});
  return new Response(null,{status:200,headers:{"content-type":"application/vnd.android.package-archive"}});
 };
 try{
  const router=new DownloadRouter(st,{DOWNLOAD_POOL:pool,META_CAPI_TOKEN:"test-token"});
  const result=await router.fetch(new Request("https://fuelgo.example/api/download",{headers:{"CF-Connecting-IP":"192.0.2.5","User-Agent":"test-agent"}}));
  assert.equal(result.status,302);
  assert.equal(st.data.get("count:meta_capi:not_consented"),1);
  assert.equal(calls.filter(x=>x.url.includes("graph.facebook.com")).length,0);
 }finally{globalThis.fetch=prior}
});
test("consented successful assignment sends one DownloadAssigned server event",async()=>{
 const st=state();const posted=[];const prior=globalThis.fetch;
 globalThis.fetch=async(input,init)=>{
  if(String(input).includes("graph.facebook.com")){
   posted.push({url:String(input),headers:init.headers,payload:JSON.parse(init.body)});
   return Response.json({events_received:1});
  }
  return new Response(null,{status:200,headers:{"content-type":"application/vnd.android.package-archive"}});
 };
 try{
  const router=new DownloadRouter(st,{DOWNLOAD_POOL:pool,META_CAPI_TOKEN:"test-token",META_TEST_EVENT_CODE:"TESTONLY"});
  const result=await router.fetch(new Request("https://fuelgo.example/api/download?ad_id=ad123&meta_consent=1",{headers:{"CF-Connecting-IP":"192.0.2.5","User-Agent":"test-agent"}}));
  assert.equal(result.status,302);
  assert.equal(posted.length,1);
  assert.equal(new URL(posted[0].url).pathname,"/v27.0/1907463533614212/events");
  assert.equal(posted[0].payload.data[0].event_name,"DownloadAssigned");
  assert.equal(posted[0].payload.data[0].custom_data.ad_id,"ad123");
  assert.equal(posted[0].payload.test_event_code,"TESTONLY");
  assert.equal(posted[0].headers.Authorization,"Bearer test-token");
  assert.equal(st.data.get("count:meta_capi:sent"),1);
 }finally{globalThis.fetch=prior}
});

test("Meta API error records only sanitized codes without leaking credentials",async()=>{
 const st=state();const prior=globalThis.fetch;
 globalThis.fetch=async(input)=>{
  if(String(input).includes("graph.facebook.com")){
   return Response.json({error:{message:"sensitive error details",code:190,error_subcode:463}},{status:401});
  }
  return new Response(null,{status:200,headers:{"content-type":"application/vnd.android.package-archive"}});
 };
 try{
  const router=new DownloadRouter(st,{DOWNLOAD_POOL:pool,META_CAPI_TOKEN:"private-test-token",STATS_TOKEN:"unit-test-secret-with-32-characters"});
  const result=await router.fetch(new Request("https://fuelgo.example/api/download?meta_consent=1",{headers:{"CF-Connecting-IP":"192.0.2.6","User-Agent":"test-agent"}}));
  assert.equal(result.status,302);
  assert.equal(st.data.get("count:meta_capi:failed"),1);
  const stats=await router.fetch(new Request("https://fuelgo.example/__internal/stats",{headers:{"Authorization":"Bearer unit-test-secret-with-32-characters"}}));
  const data=await stats.json();
  assert.deepEqual({kind:data.metaCapi.lastError.kind,httpStatus:data.metaCapi.lastError.httpStatus,metaCode:data.metaCapi.lastError.metaCode,metaSubcode:data.metaCapi.lastError.metaSubcode},{kind:"meta_http",httpStatus:401,metaCode:190,metaSubcode:463});
  assert.equal(JSON.stringify(data).includes("private-test-token"),false);
  assert.equal(JSON.stringify(data).includes("sensitive error details"),false);
 }finally{globalThis.fetch=prior}
});
