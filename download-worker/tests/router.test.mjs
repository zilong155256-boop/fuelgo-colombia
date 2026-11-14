import test from "node:test";
import assert from "node:assert/strict";
import {DownloadRouter} from "../src/index.js";

function state(){
 const data=new Map();
 return {data,storage:{
  get:async k=>data.get(k),
  put:async(k,v)=>{data.set(k,v)}
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
 assert.equal(st.data.get("count:eligible"),6);
 assert.equal(st.data.get("count:allocation_succeeded"),6);
 assert.equal(st.data.get("count:button_click"),6);
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
