import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {MODEL_REQUEST_TIMEOUT_MS,blueprint,subjectiveBlueprint,subjectiveTypes,assembleLocal,scoreChoice,normalizeEndpoint,requestModel,parseJSON,validateQuestions,validateGrades} from '../dist/core.js';
import {BANK,scaleRubric} from '../dist/bank.js';
import {POLICY} from '../dist/policies.js';
import {createAppServer} from '../server.mjs';
for(const subject of [1,2,3])test(`科目${subject}: 150分完整卷、题型数量、题目不重复`,()=>{
 const slots=blueprint(subject);assert.equal(slots.reduce((a,s)=>a+s.points,0),150);
 const expected={1:{choice:29,material:3,essay:1},2:{choice:21,judge:4,short:4,material:2},3:{choice:15,short:3,case:2,design:1}};
 for(const [type,count] of Object.entries(expected[subject]))assert.equal(slots.filter(s=>s.type===type).length,count);
 for(let i=0;i<10;i++){const qs=assembleLocal(BANK,slots).map(scaleRubric);assert.equal(new Set(qs.map(q=>q.id)).size,qs.length);for(const q of qs)if(q.type!=='choice')assert.equal(q.rubric.reduce((a,r)=>a+r.score,0),q.points);}
});
test('科目一选择题模块分布为4/8/4/9/2/2',()=>{const q=blueprint(1).filter(q=>q.type==='choice');assert.deepEqual([...new Set(q.map(q=>q.module))].map(m=>q.filter(q=>q.module===m).length),[4,8,4,9,2,2]);});
test('可去除简答和所有主观题，减量实际总分不伪装为150',()=>{assert.equal(blueprint(2,{short:false}).reduce((a,q)=>a+q.points,0),110);assert.equal(blueprint(3,{short:false}).reduce((a,q)=>a+q.points,0),120);assert.equal(blueprint(1,{subjective:false}).reduce((a,q)=>a+q.points,0),58);});
test('快速自测可选额外2道简答',()=>{assert.equal(blueprint(3,{mode:'quick',count:5,short:false}).length,5);assert.equal(blueprint(3,{mode:'quick',count:5,short:true}).length,7);});
test('综合难度在组卷前拆成具体标签，不把mixed交给模型',()=>{const levels=blueprint(3,{mode:'custom',count:8,short:false,difficulty:'mixed'}).map(q=>q.difficulty);assert.deepEqual(levels,['easy','medium','medium','hard','easy','medium','medium','hard']);});
test('生成题目单批模型调用上限为120秒',()=>{assert.equal(MODEL_REQUEST_TIMEOUT_MS,120000);});
test('主观题专项只使用本科适用题型、题量和分值',()=>{assert.deepEqual(subjectiveTypes(1).map(x=>x.type),['material','essay']);assert.deepEqual(subjectiveTypes(2).map(x=>x.type),['judge','short','material']);assert.deepEqual(subjectiveTypes(3).map(x=>x.type),['short','case','design']);for(const subject of [1,2,3]){const slots=subjectiveBlueprint(subject,{count:5});assert.equal(slots.length,5);assert.ok(slots.every(s=>s.subject===subject&&s.type!=='choice'&&s.points>0));}});
test('本地完整卷每个单选模块与蓝图一致',()=>{for(const n of [1,2,3]){const slots=blueprint(n);const qs=assembleLocal(BANK,slots);qs.forEach((q,i)=>{if(q.type==='choice')assert.equal(q.module,slots[i].module);});}});
test('每道本地选择题都有四个唯一选项和合法答案',()=>{for(const q of BANK.filter(q=>q.type==='choice')){assert.equal(new Set(q.options).size,4);assert.ok(q.answer>=0&&q.answer<=3);assert.ok(q.explanation.length>5);}});
test('题库不足会报错，不重复凑数',()=>assert.throws(()=>assembleLocal(BANK,blueprint(3,{mode:'custom',count:200,short:false})),/不足/));
test('客观评分区分未答和选项A（索引0）',()=>{const qs=[{id:'a',type:'choice',answer:0,points:2},{id:'b',type:'choice',answer:1,points:3},{id:'c',type:'short',points:10}];assert.deepEqual(scoreChoice(qs,{a:0}),{points:2,max:5,correct:1,answered:1,total:2});});
test('端点支持base和完整地址且拒绝不安全URL',()=>{assert.equal(normalizeEndpoint('https://example.com/v1/'),'https://example.com/v1/chat/completions');assert.equal(normalizeEndpoint('https://example.com/v1/chat/completions'),'https://example.com/v1/chat/completions');assert.equal(normalizeEndpoint('http://localhost:11434/v1'),'http://localhost:11434/v1/chat/completions');for(const v of ['javascript:alert(1)','http://example.com/v1','https://u:p@x.com','https://x.com/v1?api_key=secret'])assert.throws(()=>normalizeEndpoint(v));});
test('JSON允许代码块但拒绝截断与夹杂自然语言',()=>{assert.deepEqual(parseJSON('```json\n{"a":1}\n```'),{a:1});assert.throws(()=>parseJSON('{"questions":['));assert.throws(()=>parseJSON('当然可以 {"a":1}'));});
const doc={id:'d1',text:'负强化通过移除厌恶刺激增加行为发生概率。'};
const slot={index:1,subject:2,type:'choice',points:2,module:'学习心理',difficulty:'medium'};
const valid={subject:2,type:'choice',points:2,module:'学习心理',difficulty:'medium',stem:'负强化的核心含义是什么？',options:['移除厌恶刺激增加行为','减少行为','无关行为','完全遗忘'],answer:0,explanation:'负强化移除厌恶刺激，增加行为发生的概率。',sourceId:'d1',quote:'移除厌恶刺激增加行为'};
test('AI题目校验接受可查引文',()=>{const qs=validateQuestions({questions:[valid]},[slot],[doc]);assert.equal(qs.length,1);assert.equal(qs[0].origin,'AI 自编模拟');});
test('AI题目引文忽略空白标点和小幅差异，虚构情境不参与引文核验',()=>{const q={...valid,stem:'数学课上小陈遇到困难，教师撤去额外练习后其参与增加，这种做法应怎样判断？',quote:'负强化：通过移除厌恶刺激，增加行为发生的概率'};assert.equal(validateQuestions({questions:[q]},[slot],[doc]).length,1);});
test('无法核验的理论引文提供题目位置，供定点重新生成',()=>{const q={...valid,quote:'建构主义认为知识可以由教师直接灌输'};assert.throws(()=>validateQuestions({questions:[q]},[slot],[doc]),error=>error.code==='citation'&&error.questionIndex===0&&error.message.includes('第1题'));});
test('AI题目拒绝错题量、错分、错科目、重复、假引用、坏答案与重复选项',()=>{
 for(const change of [{points:3},{subject:1},{module:'课程'},{sourceId:'unknown'},{quote:'不存在的引文'},{answer:'A'},{options:['相同','相同','不同','其他']},{difficulty:'other'}])assert.throws(()=>validateQuestions({questions:[{...valid,...change}]},[slot],[doc]));
 assert.throws(()=>validateQuestions({questions:[]},[slot],[doc]));assert.throws(()=>validateQuestions({questions:[valid]},[slot],[doc],[valid]));
});
test('主观题量规必须严格合计满分',()=>{const s={...slot,type:'short',points:10};const q={...valid,type:'short',points:10,answer:'移除厌恶刺激增强目标行为。',rubric:[{point:'定义',score:10}]};assert.equal(validateQuestions({questions:[q]},[s],[doc]).length,1);assert.throws(()=>validateQuestions({questions:[{...q,rubric:[{point:'定义',score:11}]}]},[s],[doc]));});
test('评分拒绝超分、负分、重复ID、空白满分',()=>{const qs=[{id:'a',points:10}];assert.equal(validateGrades({grades:[{id:'a',score:4,feedback:'缺少对比'}]},qs,{a:'作答'})[0].score,4);for(const score of [-1,11,NaN])assert.throws(()=>validateGrades({grades:[{id:'a',score,feedback:'x'}]},qs,{a:'x'}));assert.throws(()=>validateGrades({grades:[{id:'a',score:10,feedback:'x'}]},qs,{a:''}));});
test('兼容接口真实构造Bearer鉴权、model/messages，且禁用重定向',async()=>{let captured;const text=await requestModel({url:'https://example.com/v1',key:'test-key',model:'test-model'},[{role:'system',content:POLICY}],{transport:async(url,init)=>{captured={url,init};return new Response(JSON.stringify({choices:[{message:{content:'连接成功'}}]}),{status:200});}});assert.equal(text,'连接成功');assert.equal(captured.url,'https://example.com/v1/chat/completions');assert.equal(captured.init.headers.Authorization,'Bearer test-key');assert.equal(captured.init.redirect,'error');const body=JSON.parse(captured.init.body);assert.equal(body.model,'test-model');assert.equal(body.messages[0].content,POLICY);assert.equal(body.stream,false);});
test('兼容接口处理HTTP错误、不暴露服务响应中的密钥',async()=>{await assert.rejects(requestModel({url:'https://x.com',key:'secret',model:'m'},[],{transport:async()=>new Response('secret',{status:401})}),e=>e.message.includes('401')&&!e.message.includes('secret'));await assert.rejects(requestModel({url:'https://x.com',key:'secret',model:'m'},[],{transport:async()=>new Response('{}')}),/未返回/);});
test('补充课标12章节、页码与PDF文件可独立分发',async()=>{const docs=JSON.parse(await readFile(new URL('../dist/content.json',import.meta.url),'utf8'));const standard=docs.filter(d=>d.sourceType==='curriculum');assert.equal(standard.length,12);assert.ok(standard.every(d=>d.version.includes('2025')&&d.startPage>=4&&d.endPage<=63&&d.pdfUrl.includes('#page=')));assert.ok(standard.some(d=>d.text.includes('计算思维')));assert.ok((await readFile(new URL('../dist/assets/curriculum-2025.pdf',import.meta.url))).length>1000000);assert.ok(POLICY.includes('不能混同'));});
test('课标阅读排版保留全部页码、分级标题并把表格分项展示',async()=>{
 const docs=JSON.parse(await readFile(new URL('../dist/content.json',import.meta.url),'utf8'));
 const standard=docs.filter(d=>d.sourceType==='curriculum');
 for(const doc of standard){
  assert.ok(doc.displayText?.startsWith('## '),doc.id);
  for(let page=doc.startPage;page<=doc.endPage;page++)assert.ok(doc.displayText.includes(`### PDF 第 ${page} 页`),`${doc.id}: ${page}`);
  assert.ok((doc.displayText.match(/^#{3,4} /gm)||[]).length>=2,doc.id);
  assert.doesNotMatch(doc.displayText,/普通高中信息科技课程标准（2017年版2025年修订）/);
 }
 const goals=standard.find(d=>d.id==='curriculum-7').displayText;
 for(const title of ['（一）学科核心素养内涵','1. 信息意识','2. 计算思维','3. 数字化学习与创新','4. 信息社会责任','（二）目标要求'])assert.ok(goals.includes(`#### ${title}`),title);
 const levels=standard.find(d=>d.id==='curriculum-40').displayText;
 assert.match(levels,/#### 水平1\n- 1-1\./);assert.match(levels,/#### 水平2\n- 2-1\./);
});
test('运行时职责明确公共科目情境不限于信息技术',()=>{assert.ok(POLICY.includes('科目一“综合素质”和科目二“教育知识与能力”是中学教师资格公共科目'));assert.ok(POLICY.includes('不得默认或全部设置为信息技术'));});
test('本机服务提供页面与资料，并拒绝跨域代理',async()=>{const server=createAppServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{const origin=`http://127.0.0.1:${server.address().port}`;const response=await fetch(origin);assert.equal(response.status,200);assert.ok((await response.text()).includes('师序'));const data=await fetch(origin+'/content.json');assert.equal((await data.json()).filter(d=>d.sourceType==='curriculum').length,12);assert.equal((await fetch(origin+'/api/chat',{method:'POST',headers:{Origin:'https://attacker.example','Content-Type':'application/json'},body:'{}'})).status,403);assert.equal((await fetch(origin+'/missing.js')).status,404);}finally{await new Promise(resolve=>server.close(resolve));}});
