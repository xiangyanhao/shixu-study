// Shared browser/server SSE decoder. UTF-8 and event boundaries may span chunks.
export async function* readSSE(body){
 if(!body)throw Error('服务没有返回响应流');
 const reader=body.getReader(),decoder=new TextDecoder();let buffer='',name='message',data=[],ended=false;
 const line=value=>{if(value===''){if(!data.length){name='message';return null;}const event={name,data:data.join('\n')};name='message';data=[];return event;}if(value.startsWith(':'))return null;const colon=value.indexOf(':'),field=colon<0?value:value.slice(0,colon);const text=colon<0?'':value.slice(colon+1).replace(/^ /,'');if(field==='event')name=text;if(field==='data')data.push(text);return null;};
 try{while(true){const chunk=await reader.read();if(chunk.done){ended=true;buffer+=decoder.decode();break;}buffer+=decoder.decode(chunk.value,{stream:true});let i;while((i=buffer.indexOf('\n'))>=0){const event=line(buffer.slice(0,i).replace(/\r$/,''));buffer=buffer.slice(i+1);if(event)yield event;}}if(buffer){const event=line(buffer.replace(/\r$/,''));if(event)yield event;}const final=line('');if(final)yield final;}
 finally{if(!ended)await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export function modelEvents(event){
 if(event.data.trim()==='[DONE]')return [{type:'done'}];
 let data;try{data=JSON.parse(event.data);}catch{throw Error('服务返回了无法解析的流式数据');}
 if(event.name==='status')return [{type:'status',phase:data.phase}];
 if(event.name==='delta')return [{type:'delta',text:data.text||''}];
 if(event.name==='complete')return [{type:'done'}];
 if(event.name==='error'||data.error){const error=Error(data.message||'模型服务返回错误');error.code=data.code||'service';throw error;}
 const choice=data.choices?.[0];if(!choice)return [];
 const delta=choice.delta||{},events=[];
 if(delta.reasoning_content||delta.reasoning||delta.thinking)events.push({type:'status',phase:'reasoning'});
 if(typeof delta.content==='string'&&delta.content)events.push({type:'delta',text:delta.content});
 if(typeof delta.refusal==='string'&&delta.refusal)events.push({type:'delta',text:delta.refusal});
 if(choice.finish_reason){if(choice.finish_reason!=='stop')events.push({type:'failure',code:'incomplete',message:choice.finish_reason==='length'?'回答达到服务输出长度限制，已保留已收到的内容。':'服务提前结束了回答，已保留已收到的内容。'});else events.push({type:'done'});}
 return events;
}
export function streamError(code,message){const error=Error(message);error.code=code;return error;}
// Keep only a possible secret prefix pending, so normal text stays responsive.
export function secretRedactor(secret){let pending='';return {push(text){pending+=text;pending=pending.split(secret).join('[redacted]');let keep=0;for(let n=1;n<Math.min(secret.length,pending.length+1);n++)if(pending.endsWith(secret.slice(0,n)))keep=n;const safe=pending.slice(0,pending.length-keep);pending=pending.slice(pending.length-keep);return safe;},finish(){const safe=pending;pending='';return safe;}};}
