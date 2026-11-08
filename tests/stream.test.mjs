import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {readSSE,secretRedactor} from '../dist/model-stream.js';
import {requestModel} from '../dist/core.js';
import {createAppServer} from '../server.mjs';
import {requestProgress} from '../dist/chat-ui.js';
const enc=new TextEncoder(),config={url:'https://example.com/v1',model:'fixture',key:'fixture-key'};
function responseFrom(parts){return new Response(new ReadableStream({start(c){for(const part of parts)c.enqueue(typeof part==='string'?enc.encode(part):part);c.close();}}),{headers:{'Content-Type':'text/event-stream'}});}
const chunk=(content,extra={})=>'data: '+JSON.stringify({choices:[{delta:{content,...extra}}]})+'\n\n';
test('SSE解析支持逐字节UTF8分片、CRLF、注释、多行data和结束标记',async()=>{
 const raw=': heartbeat\r\nevent: delta\r\ndata: {"text":\r\ndata: "中文🙂"}\r\n\r\ndata: [DONE]\r\n\r\n';const bytes=enc.encode(raw);const events=[];
 for await(const event of readSSE(responseFrom([...bytes].map(b=>new Uint8Array([b]))).body))events.push(event);
 assert.deepEqual(events,[{name:'delta',data:'{"text":\n"中文🙂"}'},{name:'message',data:'[DONE]'}]);
});
test('流式请求按实际响应区分连接、推理、正文，推理文本不进入回答',async()=>{
 const phases=[],pieces=[];const answer=await requestModel(config,[],{stream:true,onProgress:p=>phases.push(p.phase),onDelta:t=>pieces.push(t),transport:async()=>responseFrom([chunk('',{reasoning_content:'不可显示的推理文本'}),chunk('第一段'),chunk('第二段'),'data: [DONE]\n\n'])});
 assert.equal(answer,'第一段第二段');assert.deepEqual(pieces,['第一段','第二段']);assert.ok(phases.indexOf('connecting')<phases.indexOf('connected'));assert.ok(phases.indexOf('reasoning')<phases.indexOf('receiving'));assert.equal(phases.at(-1),'completed');
});
test('不支持流式的兼容服务显示等待完整回答，不伪造思考状态',async()=>{
 const phases=[];const answer=await requestModel(config,[],{stream:true,onProgress:p=>phases.push(p.phase),transport:async()=>new Response(JSON.stringify({choices:[{message:{content:'完整回答'}}]}),{headers:{'Content-Type':'application/json'}})});
 assert.equal(answer,'完整回答');assert.ok(phases.includes('buffered'));assert.ok(!phases.includes('reasoning'));
 const ui=requestProgress({id:'x',phase:'connecting',started:Date.now()-15000});assert.ok(ui.includes('尚未收到服务确认'));assert.ok(!ui.includes('<strong>模型正在思考</strong>'));
});
test('HTTP拒绝和中途断流分别报告，保留部分正文',async()=>{
 await assert.rejects(requestModel(config,[],{stream:true,transport:async()=>new Response('{}',{status:401})}),e=>e.code==='http'&&e.message.includes('401'));
 let partial='';await assert.rejects(requestModel(config,[],{stream:true,onDelta:(_,text)=>partial=text,transport:async()=>responseFrom([chunk('已收到的内容')])}),e=>e.code==='interrupted');assert.equal(partial,'已收到的内容');
});
test('输出长度限制不冒充完成，最后一段正文仍保留',async()=>{
 let text='';const event='data: '+JSON.stringify({choices:[{delta:{content:'最后一段'},finish_reason:'length'}]})+'\n\n';
 await assert.rejects(requestModel(config,[],{stream:true,onDelta:(_,value)=>text=value,transport:async()=>responseFrom([event])}),e=>e.code==='incomplete');assert.equal(text,'最后一段');
});
function hangingTransport(first=''){return async(url,init)=>new Response(new ReadableStream({start(c){if(first)c.enqueue(enc.encode(first));init.signal.addEventListener('abort',()=>c.error(new DOMException('Aborted','AbortError')),{once:true});}}),{headers:{'Content-Type':'text/event-stream'}});}
test('连接超时、首次输出超时、生成停滞和主动停止可区分',async()=>{
 await assert.rejects(requestModel(config,[],{stream:true,timeouts:{connect:10,total:500},transport:async(url,init)=>new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}))}),e=>e.code==='connect-timeout');
 await assert.rejects(requestModel(config,[],{stream:true,timeouts:{first:10,total:500},transport:hangingTransport()}),e=>e.code==='first-output-timeout');
 let partial='';await assert.rejects(requestModel(config,[],{stream:true,timeouts:{idle:10,total:500},onDelta:(_,text)=>partial=text,transport:hangingTransport(chunk('保留内容'))}),e=>e.code==='output-timeout');assert.equal(partial,'保留内容');
 const controller=new AbortController();await assert.rejects(requestModel(config,[],{stream:true,signal:controller.signal,transport:hangingTransport(chunk('已生成')),onDelta:()=>controller.abort()}),e=>e.code==='cancelled');
});
test('API Key即使跨多个输出片段也被完整脱敏',()=>{
 const secret='sk-secret-fixture',r=secretRedactor(secret);let safe='';for(const c of `前文${secret}中间${secret}后文`)safe+=r.push(c);safe+=r.finish();assert.equal(safe,'前文[redacted]中间[redacted]后文');
});
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',()=>r(`http://127.0.0.1:${s.address().port}`)));
const close=s=>new Promise(r=>{s.closeAllConnections();s.close(r);});
test('真实代理流转发状态、过滤推理和跨帧密钥，停止时终止上游',async()=>{
 let cancelled=false;const secret='proxy-key-fixture';
 const model=createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;assert.equal(JSON.parse(raw).stream,true);assert.equal(req.headers.authorization,'Bearer '+secret);res.writeHead(200,{'Content-Type':'text/event-stream'});res.flushHeaders();res.write(chunk('',{reasoning_content:'private reasoning'}));await delay(20);if(res.destroyed)return;
  if(req.url.startsWith('/cancel')){res.on('close',()=>{cancelled=true;});res.write(chunk('部分回答'));return;}
  for(const piece of ['开始 ',secret.slice(0,5),secret.slice(5),' 结束'])res.write(chunk(piece));res.end('data: [DONE]\n\n');
 });const endpoint=await listen(model),app=createAppServer(),origin=await listen(app);
 try{
  const phases=[];const result=await requestModel({url:endpoint,model:'test',key:secret,proxy:true},[],{stream:true,onProgress:p=>phases.push(p.phase),transport:(url,init)=>fetch(origin+url,init)});
  assert.equal(result,'开始 [redacted] 结束');assert.ok(phases.includes('connected'));assert.ok(phases.includes('reasoning'));assert.ok(!result.includes('private reasoning'));
  const controller=new AbortController();await assert.rejects(requestModel({url:endpoint+'/cancel',model:'test',key:secret,proxy:true},[],{stream:true,signal:controller.signal,transport:(url,init)=>fetch(origin+url,init),onDelta:()=>controller.abort()}),e=>e.code==='cancelled');
  for(let i=0;i<30&&!cancelled;i++)await delay(10);assert.equal(cancelled,true);
 }finally{await close(app);await close(model);}
});
