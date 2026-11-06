export const SUBJECTS = {1:'综合素质',2:'教育知识与能力',3:'信息技术学科知识与教学能力',4:'面试准备'};
export const TYPES = {choice:'单项选择题',short:'简答题',material:'材料分析题',essay:'写作题',judge:'辨析题',case:'案例分析题',design:'教学设计题'};
export const BLUEPRINTS = {
  1:[['choice',29,2],['material',3,14],['essay',1,50]],
  2:[['choice',21,2],['judge',4,8],['short',4,10],['material',2,18]],
  3:[['choice',15,3],['short',3,10],['case',2,20],['design',1,35]]
};
export const MODULES={1:['职业理念','教育法律法规','教师职业道德','文化素养','信息处理','逻辑思维'],2:['教育基础','中学课程','中学教学','学习心理','发展心理','心理辅导','中学德育','班级管理'],3:['数据与编码','计算机系统','算法与程序','数据结构','数据库','网络','人工智能','信息安全','课程与素养','教学设计','教学实施','教学评价']};
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
    return {index:++i,subject,type,points,module:mod,difficulty};
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
export function validateQuestions(data,slots,docs,existing=[]){
  if(!Array.isArray(data.questions)||data.questions.length!==slots.length)throw Error('模型题量与蓝图不符');
  const seen=new Set(existing.map(q=>q.stem.replace(/\s/g,'')));
  return data.questions.map((q,i)=>{
    const s=slots[i];if(q.type!==s.type||q.subject!==s.subject||q.points!==s.points||q.module!==s.module)throw Error(`第${s.index}题题型、模块或分值不符`);
    if(!['easy','medium','hard'].includes(q.difficulty)||(s.difficulty!=='mixed'&&q.difficulty!==s.difficulty))throw Error('模型难度标签与要求不符');
    if(typeof q.stem!=='string'||q.stem.trim().length<8||typeof q.explanation!=='string'||q.explanation.length<8)throw Error('题干或解析不完整');
    const key=q.stem.replace(/\s/g,'');if(seen.has(key))throw Error('模型生成了重复题目');seen.add(key);
    const d=docs.find(d=>d.id===q.sourceId);if(!d||typeof q.quote!=='string'||q.quote.trim().length<4||!d.text.includes(q.quote))throw Error(`第${s.index}题缺少可核验的资料引文`);
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
export async function requestModel(config,messages,{signal,transport=fetch}={}){
  const endpoint=normalizeEndpoint(config.url);if(!config.model?.trim()||!config.key?.trim())throw Error('请先填写模型名称和 API Key');
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),120000);const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();
  try{
    const response=await transport(config.proxy?'/api/chat':endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(config.proxy?{}:{Authorization:`Bearer ${config.key}`})},body:JSON.stringify(config.proxy?{endpoint,key:config.key,body:{model:config.model,messages,stream:false}}:{model:config.model,messages,stream:false}),signal:controller.signal,redirect:'error'});
    if(!response.ok)throw Error(`模型服务返回 HTTP ${response.status}。请检查 URL、密钥、模型权限或额度。`);
    const data=await response.json();const content=data.choices?.[0]?.message?.content;if(typeof content!=='string'||!content.trim())throw Error('模型未返回文本内容（choices[0].message.content）');return content;
  }catch(e){if(e.name==='AbortError')throw Error(signal?.aborted?'已取消请求':'请求超过 120 秒，请重试');if(e instanceof TypeError)throw Error('无法连接模型。请检查网络与服务端 CORS；本机运行时可启用本地代理。');throw e;}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export function validateGrades(data,questions,answers){
  if(!Array.isArray(data.grades)||data.grades.length!==questions.length)throw Error('批改题量不符');const seen=new Set();
  return data.grades.map(g=>{const q=questions.find(q=>q.id===g.id);if(!q||seen.has(g.id)||!Number.isFinite(g.score)||g.score<0||g.score>q.points||typeof g.feedback!=='string'||(!String(answers[q.id]??'').trim()&&g.score!==0))throw Error('模型评分超出范围或格式错误');seen.add(g.id);return g;});
}
