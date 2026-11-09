import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderMarkdown} from '../dist/markdown.js';
import {buildReaderOutline} from '../dist/reader-outline.js';

const docs=JSON.parse(await readFile(new URL('../dist/content.json',import.meta.url),'utf8'));
function outline(id){
 const doc=docs.find(item=>item.id===id),display=doc.displayText||doc.text,headings=[];
 renderMarkdown(display,{onHeading:heading=>headings.push(heading)});
 return {headings,...buildReaderOutline(headings,doc.sourceType,display)};
}
const find=(entries,title)=>entries.find(entry=>entry.title===title);

test('全部资料的正文标题均有目录目标，课标页码从内容层级分离',()=>{
 for(const doc of docs){
  const {headings,entries,pages}=outline(doc.id);
  assert.deepEqual([...entries,...pages].map(item=>item.id).sort(),headings.map(item=>item.id).sort(),doc.title);
  assert.ok(entries.every(item=>Number.isInteger(item.depth)&&item.depth>=0&&item.depth<=5),doc.title);
  if(doc.sourceType==='curriculum')assert.ok(entries.every(item=>!item.title.startsWith('PDF 第')),doc.title);
  else assert.equal(pages.length,0,doc.title);
 }
});

test('跳级标题压缩缩进，篇章和课标编号按逻辑从属',()=>{
 const intro=outline('d26').entries;
 assert.equal(find(intro,'三个使用原则').depth,1);
 const book=outline('d27').entries;
 assert.equal(find(book,'第一章　考试地图：先知道分数从哪里来').depth,1);
 assert.equal(find(book,'1.1 科目三：一张卷子的结构').depth,2);
 const goals=outline('curriculum-7');
 assert.deepEqual(goals.pages.map(item=>item.page),[7,8,9,10]);
 assert.equal(find(goals.entries,'三、课程目标').depth,1);
 assert.equal(find(goals.entries,'（一）学科核心素养内涵').depth,2);
 assert.equal(find(goals.entries,'2. 计算思维').depth,3);
 assert.equal(find(goals.entries,'（二）目标要求').depth,2);
 const modules=outline('curriculum-14').entries;
 assert.equal(find(modules,'模块1 ：数据与计算').depth,3);
 assert.equal(find(modules,'【内容要求】').depth,4);
 assert.equal(find(modules,'（二）选择性必修课程'),undefined);
 const continued=outline('curriculum-20').entries;
 assert.equal(find(continued,'（二）选择性必修课程').depth,1);
 assert.equal(find(continued,'模块2 ：网络基础').depth,2);
 const structure=outline('curriculum-11').entries;
 assert.equal(find(structure,'必修').depth,4);
});

test('附录同名水平条目带所属素养名称，仍跳转到实际标题',()=>{
 const appendix=outline('curriculum-59').entries.filter(item=>/^水平\d/.test(item.title));
 assert.equal(appendix.length,13);
 assert.ok(appendix.some(item=>item.label==='信息意识 · 水平1'));
 assert.ok(appendix.some(item=>item.label==='计算思维 · 水平1'));
 assert.ok(appendix.some(item=>item.label==='数字化学习与创新 · 水平1'));
 assert.ok(appendix.some(item=>item.label==='信息社会责任 · 水平1'));
 assert.ok(appendix.every(item=>item.depth===3));
});
