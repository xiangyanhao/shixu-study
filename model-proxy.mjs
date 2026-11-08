import {normalizeEndpoint} from './dist/core.js';
import {readSSE,modelEvents,secretRedactor} from './dist/model-stream.js';

export async function streamModelProxy(req,res,input,vault,host){
 const endpoint=normalizeEndpoint(input.endpoint||'');if(new URL(endpoint).host===host)throw Error('Cannot proxy to this server');
 if(typeof input.body?.model!=='string'||!Array.isArray(input.body?.messages))throw Error('Invalid model request');
 const controller=new AbortController();let timeoutCode='connect-timeout',timer;
 const arm=(ms,code)=>{clearTimeout(timer);timeoutCode=code;timer=setTimeout(()=>controller.abort(),ms);};
 const disconnect=()=>{if(!res.writableEnded)controller.abort();};res.on('close',disconnect);
 res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.flushHeaders();
 const emit=async(name,data)=>{if(res.destroyed||res.writableEnded)return;if(!res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`))await new Promise(resolve=>{const done=()=>{res.removeListener('drain',done);res.removeListener('close',done);resolve();};res.once('drain',done);res.once('close',done);});};
 let lastPhase='',secret='';const status=async phase=>{if(phase!==lastPhase){lastPhase=phase;await emit('status',{phase});}};
 try{
  arm(30000,'connect-timeout');await status('preparing');
  const key=input.useStoredKey&&vault?await vault.get(endpoint):input.key;
  if(typeof key!=='string'||!key.trim()||key.length>2000||/[\r\n\0]/.test(key))throw Error('Invalid API Key');
  secret=key;const redactor=secretRedactor(key);await status('connecting');
  const upstream=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`,Accept:'text/event-stream'},body:JSON.stringify({model:input.body.model,messages:input.body.messages,stream:true}),signal:controller.signal,redirect:'error'});
  if(!upstream.ok){await emit('error',{code:'http',message:`模型服务返回 HTTP ${upstream.status}。${upstream.status===401||upstream.status===403?'请检查 API Key 和模型权限。':upstream.status===429?'请求过于频繁或额度不足，请稍后再试。':'请检查模型配置或稍后重试。'}`});return;}
  await status('connected');arm(90000,'first-output-timeout');
  let completed=false,hasContent=false;
  const delta=async text=>{if(!text)return;hasContent=true;arm(60000,'output-timeout');await status('receiving');const safe=redactor.push(text);if(safe)await emit('delta',{text:safe});};
  if(upstream.headers.get('content-type')?.includes('text/event-stream')){
   outer:for await(const event of readSSE(upstream.body))for(const item of modelEvents(event)){
    if(item.type==='status'&&item.phase==='reasoning'){arm(90000,'first-output-timeout');if(!hasContent)await status('reasoning');}
    if(item.type==='delta')await delta(item.text);
    if(item.type==='failure'){const error=Error(item.message);error.code=item.code;throw error;}
    if(item.type==='done'){completed=true;break outer;}
   }
  }else{
   // Some compatible services ignore stream:true and send a complete JSON body.
   await status('buffered');const data=await upstream.json();const content=data.choices?.[0]?.message?.content;
   if(typeof content!=='string'||!content.trim())throw Error('Empty response');await delta(content);completed=true;
  }
  const tail=redactor.finish();if(tail)await emit('delta',{text:tail});
  if(!completed){await emit('error',{code:'interrupted',message:'连接在回答完成前中断，已保留收到的内容。'});return;}
  if(!hasContent){await emit('error',{code:'empty',message:'服务已响应，但没有返回回答正文。'});return;}
  await emit('complete',{});
 }catch(e){
  if(!res.destroyed){const timed=controller.signal.aborted;const messages={'connect-timeout':'连接超时：30 秒内未收到模型服务确认，请检查网络、URL 或服务排队情况。','first-output-timeout':'服务已响应，但 90 秒内没有收到新的正文或推理信号。','output-timeout':'生成过程中超过 60 秒没有收到新内容，连接可能已中断。'};let message=timed?messages[timeoutCode]:e.code==='incomplete'?e.message:lastPhase==='preparing'?'本机密钥准备失败，请重新填写并保存 Key。':'无法完成模型请求。请检查服务地址、网络和已保存的密钥；已收到的正文会保留。';if(secret)message=message.split(secret).join('[redacted]');await emit('error',{code:timed?timeoutCode:e.code||'connection',message});}
 }finally{clearTimeout(timer);res.removeListener('close',disconnect);if(!res.destroyed)res.end();}
}
