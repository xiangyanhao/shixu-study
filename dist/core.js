import {readSSE,modelEvents,streamError} from './model-stream.js';
export const MODEL_REQUEST_TIMEOUT_MS=120000;
export const SUBJECTS = {1:'综合素质',2:'教育知识与能力',3:'信息技术学科知识与教学能力',4:'面试准备'};
export const TYPES = {choice:'单项选择题',short:'简答题',material:'材料分析题',essay:'写作题',judge:'辨析题',case:'案例分析题',design:'教学设计题'};
export const BLUEPRINTS = {
  1:[['choice',29,2],['material',3,14],['essay',1,50]],
  2:[['choice',21,2],['judge',4,8],['short',4,10],['material',2,18]],
  3:[['choice',15,3],['short',3,10],['case',2,20],['design',1,35]]
};
export const MODULES={1:['职业理念','教育法律法规','教师职业道德','文化素养','信息处理','逻辑思维'],2:['教育基础','中学课程','中学教学','学习心理','发展心理','心理辅导','中学德育','班级管理'],3:['数据与编码','计算机系统','算法与程序','数据结构','数据库','网络','人工智能','信息安全','课程与素养','教学设计','教学实施','教学评价']};
export function subjectiveTypes(subject){return (BLUEPRINTS[Number(subject)]||[]).filter(([type])=>type!=='choice').map(([type,,points])=>({type,points}));}
export function subjectiveBlueprint(subject,{type='all',count=3,difficulty='mixed'}={}){
  subject=Number(subject);count=Number(count);const allowed=subjectiveTypes(subject).map(row=>row.type);if(!allowed.length)throw Error('该科目没有可用的主观题型');if(type!=='all'&&!allowed.includes(type))throw Error('无效的主观题型');if(!Number.isInteger(count)||count<1||count>5)throw Error('主观题专项题量应为 1 至 5 题');
  const templates=blueprint(subject).filter(slot=>slot.type!=='choice'&&(type==='all'||slot.type===type));
  return Array.from({length:count},(_,i)=>{const slot=templates[i%templates.length],level=difficulty==='mixed'?['easy','medium','medium','hard'][i%4]:difficulty;return {...slot,index:i+1,difficulty:level};});
}
const CHOICE1=['职业理念','教育法律法规','教师职业道德','文化素养','信息处理','逻辑思维'];
export function blueprint(subject,{mode='full',count=10,short=true,subjective=true,module='all',difficulty='mixed'}={}){
  subject=Number(subject); if(!BLUEPRINTS[subject])throw Error('无效科目');
  const rows=mode==='full'?BLUEPRINTS[subject]:[['choice',count,subject===3?3:2],...(short&&subjective?[['short',2,10]]:[])];
  let i=0;
  return rows.filter(([t])=>(short||t!=='short')&&(subjective||t==='choice')).flatMap(([type,n,points])=>Array.from({length:n},(_,j)=>{
    let mod=(mode==='full'||module==='all')?MODULES[subject][j%MODULES[subject].length]:module;
    if(mode==='full'&&subject===1&&type==='choice')mod=CHOICE1[j<4?0:j<12?1:j<16?2:j<25?3:j<27?4:5];
    if(mode==='full'&&subject===1&&type==='material')mod=['职业理念','教师职业道德','材料阅读'][j];
    if(type==='essay')mod='写作'; if(type==='design')mod='教学设计';if(type==='case')mod=['教学实施','教学评价'][j%2];
    const questionDifficulty=difficulty==='mixed'?['easy','medium','medium','hard'][i%4]:difficulty;
    return {index:++i,subject,type,points,module:mod,difficulty:questionDifficulty};
  }));
}
export function shuffle(items,rng=Math.random){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function assembleLocal(bank,slots){
  const used=new Set();return slots.map(slot=>{
    let pool=bank.filter(q=>q.subject===slot.subject&&q.type===slot.type&&!used.has(q.id));
    const matched=pool.filter(q=>q.module===slot.module);if(matched.length)pool=matched;
    if(!pool.length)throw Error(`本地${TYPES[slot.type]}题量不足，请减少题量或使用 AI 组卷。`);
    const q=shuffle(pool)[0];used.add(q.id);return {...q,points:slot.points,index:slot.index};
  });
}
export function parseJSON(text){
  if(typeof text!=='string')throw Error('模型返回内容为空');
  const clean=text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{return JSON.parse(clean);}catch{throw Error('模型未返回完整、有效的 JSON，请重试或更换支持较长输出的模型。');}
}
function citationText(value){return String(value??'').normalize('NFKC').replace(/[\s\u3000，。！？；：、“”‘’（）()《》〈〉【】\[\]…—·,.!?;:'"_-]/g,'');}
function citationMatches(quote,source){
  const q=citationText(quote),text=citationText(source);if(q.length<4)return false;if(text.includes(q))return true;
  if(q.length<8)return false;const pairs=new Set(Array.from({length:q.length-1},(_,i)=>q.slice(i,i+2)));let matched=0;for(const pair of pairs)if(text.includes(pair))matched++;return matched/pairs.size>=.75;
}
function questionError(message,code,questionIndex){const error=Error(message);error.code=code;error.questionIndex=questionIndex;return error;}
export function validateQuestions(data,slots,docs,existing=[]){
  if(!Array.isArray(data.questions)||data.questions.length!==slots.length)throw Error('模型题量与蓝图不符');
  const seen=new Set(existing.map(q=>q.stem.replace(/\s/g,'')));
  return data.questions.map((q,i)=>{
    const s=slots[i];if(q.type!==s.type||q.subject!==s.subject||q.points!==s.points||q.module!==s.module)throw Error(`第${s.index}题题型、模块或分值不符`);
    if(!['easy','medium','hard'].includes(q.difficulty)||q.difficulty!==s.difficulty)throw Error(`第${s.index}题难度标签不符：要求 ${s.difficulty}，模型返回 ${String(q.difficulty??'空值')}`);
    if(typeof q.stem!=='string'||q.stem.trim().length<8||typeof q.explanation!=='string'||q.explanation.length<8)throw Error('题干或解析不完整');
    const key=q.stem.replace(/\s/g,'');if(seen.has(key))throw Error('模型生成了重复题目');seen.add(key);
    const d=docs.find(d=>d.id===q.sourceId);if(!d||typeof q.quote!=='string'||!citationMatches(q.quote,d.text))throw questionError(`第${s.index}题缺少可核验的理论引文`, 'citation',i);
    if(s.type==='choice'){
      if(!Array.isArray(q.options)||q.options.length!==4||q.options.some(o=>typeof o!=='string'||!o.trim())||new Set(q.options.map(x=>x.trim())).size!==4||!Number.isInteger(q.answer)||q.answer<0||q.answer>3)throw Error('选择题选项或答案格式错误');
    }else{
      if(typeof q.answer!=='string'||!q.answer.trim()||!Array.isArray(q.rubric)||!q.rubric.length||q.rubric.some(r=>typeof r.point!=='string'||!r.point.trim()||!Number.isFinite(r.score)||r.score<=0)||Math.abs(q.rubric.reduce((a,r)=>a+r.score,0)-s.points)>.001)throw Error('主观题参考答案或量规分值不符');
    }
    return {...q,id:`ai-${Date.now()}-${s.index}`,index:s.index,origin:'AI 自编模拟'};
  });
}
export function scoreChoice(questions,answers){let points=0,max=0,correct=0,answered=0;for(const q of questions){if(q.type!=='choice')continue;max+=q.points;if(Number.isInteger(answers[q.id]))answered++;if(answers[q.id]===q.answer){correct++;points+=q.points;}}return {points,max,correct,answered,total:questions.filter(q=>q.type==='choice').length};}
export function normalizeEndpoint(value){
  let u;try{u=new URL(value.trim());}catch{throw Error('请输入完整的模型 URL');}
  if(u.username||u.password||u.search||u.hash)throw Error('URL 不应包含账号、密码、查询参数或片段');
  if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))throw Error('请使用 HTTPS；本机模型可使用 HTTP');
  u.pathname=u.pathname.replace(/\/+$/,'');if(!u.pathname.endsWith('/chat/completions'))u.pathname+='/chat/completions';return u.href;
}
export async function requestModel(config,messages,{signal,transport=fetch,stream=false,onProgress=()=>{},onDelta=()=>{},timeouts={}}={}){
  const endpoint=normalizeEndpoint(config.url);if(!config.model?.trim()||(!config.key?.trim()&&!(config.proxy&&config.useStoredKey)))throw Error('请先填写模型名称和 API Key');
  if(stream)return requestStream(config,endpoint,messages,{signal,transport,onProgress,onDelta,timeouts});
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),MODEL_REQUEST_TIMEOUT_MS);const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();
  try{
    const response=await transport(config.proxy?'/api/chat':endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(config.proxy?{}:{Authorization:`Bearer ${config.key}`})},body:JSON.stringify(config.proxy?{endpoint,...(config.useStoredKey?{useStoredKey:true}:{key:config.key}),body:{model:config.model,messages,stream:false}}:{model:config.model,messages,stream:false}),signal:controller.signal,redirect:'error'});
    if(!response.ok)throw Error(`模型服务返回 HTTP ${response.status}。请检查 URL、密钥、模型权限或额度。`);
    const data=await response.json();const content=data.choices?.[0]?.message?.content;if(typeof content!=='string'||!content.trim())throw Error('模型未返回文本内容（choices[0].message.content）');return content;
  }catch(e){if(e.name==='AbortError')throw Error(signal?.aborted?'已取消请求':'请求超过 120 秒，请重试');if(e instanceof TypeError)throw Error('无法连接模型。请检查网络与服务端 CORS；本机运行时可启用本地代理。');throw e;}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
async function requestStream(config,endpoint,messages,{signal,transport,onProgress,onDelta,timeouts}){
 const limits={connect:30000,first:90000,idle:60000,total:300000,...timeouts};
 const controller=new AbortController();let timer,code='connect-timeout',text='',finished=false;
 const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();
 const arm=(ms,reason)=>{clearTimeout(timer);code=reason;timer=setTimeout(()=>controller.abort(),ms);};
 const total=setTimeout(()=>{code='total-timeout';controller.abort();},limits.total);
 const progress=phase=>{if(phase==='reasoning'&&text)return;if(['connected','buffered','reasoning'].includes(phase))arm(limits.first,'first-output-timeout');if(phase==='connecting')arm(limits.connect,'connect-timeout');onProgress({phase});};
 const delta=value=>{if(!value)return;text+=value;arm(limits.idle,'output-timeout');onProgress({phase:'receiving'});onDelta(value,text);};
 try{
  arm(limits.connect,'connect-timeout');progress('connecting');
  const response=await transport(config.proxy?'/api/chat':endpoint,{method:'POST',headers:{'Content-Type':'application/json',Accept:'text/event-stream',...(config.proxy?{}:{Authorization:`Bearer ${config.key}`})},body:JSON.stringify(config.proxy?{endpoint,...(config.useStoredKey?{useStoredKey:true}:{key:config.key}),body:{model:config.model,messages,stream:true}}:{model:config.model,messages,stream:true}),signal:controller.signal,redirect:'error'});
  if(!response.ok)throw streamError('http',`服务返回 HTTP ${response.status}。${[401,403].includes(response.status)?'请检查密钥和模型权限。':response.status===429?'请求过于频繁或额度不足，请稍后重试。':'请检查服务地址及模型配置。'}`);
  if(response.headers.get('content-type')?.includes('text/event-stream')){
   if(!config.proxy)progress('connected');
   outer:for await(const event of readSSE(response.body))for(const item of modelEvents(event)){
    if(item.type==='status')progress(item.phase);
    if(item.type==='delta')delta(item.text);
    if(item.type==='failure')throw streamError(item.code,item.message);
    if(item.type==='done'){finished=true;break outer;}
   }
   if(!finished)throw streamError('interrupted','连接在回答完成前中断，已保留收到的内容。');
  }else{
   progress('buffered');const data=await response.json();const value=data.choices?.[0]?.message?.content;
   if(typeof value==='string')delta(value);finished=true;
  }
  if(!text.trim())throw streamError('empty','服务已响应，但没有返回回答正文。');onProgress({phase:'completed'});return text;
 }catch(e){
  if(signal?.aborted)throw streamError('cancelled','已停止生成，已保留收到的内容。');
  if(controller.signal.aborted){const messages={'connect-timeout':'连接超时：尚未收到模型服务确认，请检查网络、URL 或服务排队情况。','first-output-timeout':'服务已响应，但长时间没有收到新的正文或推理信号。','output-timeout':'回答接收中断：长时间没有收到新内容。','total-timeout':'本次请求耗时过长，已停止并保留收到的内容。'};throw streamError(code,messages[code]);}
  if(e instanceof TypeError)throw streamError('connection','连接失败或响应流中断。请检查网络、URL 与服务端 CORS；本地版可使用代理。');if(e instanceof SyntaxError)throw streamError('format','服务返回的数据格式无法解析，请检查模型 URL 是否指向兼容的聊天接口。');throw e;
 }finally{clearTimeout(timer);clearTimeout(total);signal?.removeEventListener('abort',abort);}
}
export function validateGrades(data,questions,answers){
  if(!Array.isArray(data.grades)||data.grades.length!==questions.length)throw Error('批改题量不符');const seen=new Set();
  return data.grades.map(g=>{const q=questions.find(q=>q.id===g.id);if(!q||seen.has(g.id)||!Number.isFinite(g.score)||g.score<0||g.score>q.points||typeof g.feedback!=='string'||(!String(answers[q.id]??'').trim()&&g.score!==0))throw Error('模型评分超出范围或格式错误');seen.add(g.id);return g;});
}
