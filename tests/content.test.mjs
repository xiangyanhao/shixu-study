import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('微型教材各篇标题出现在该篇第一章开头，不留在上一章结尾',async()=>{
 const docs=JSON.parse(await readFile(new URL('../dist/content.json',import.meta.url),'utf8'));
 const book=docs.filter(doc=>doc.path.endsWith('高中信息科技教资_科目三+面试_微型教材.md'));
 assert.equal(book.length,12);
 for(const [part,chapter] of [['第一篇','第一章'],['第二篇','第三章'],['第三篇','第四章'],['第四篇','第七章'],['第五篇','第九章']]){
  const doc=book.find(item=>item.title.startsWith(chapter));
  assert.ok(doc,chapter);
  assert.ok(doc.text.startsWith(`# ${part}`),`${part} 应位于 ${chapter} 开头`);
  assert.ok(doc.text.includes(`\n\n## ${chapter}`),`${chapter} 应位于篇标题之后`);
  assert.equal(book.filter(item=>item.text.includes(`# ${part}`)).length,1,`${part} 不应出现在其他章节`);
 }
});

test('课标补充按实际小节划分共用 PDF 页，前后主题不互相混入',async()=>{
 const docs=JSON.parse(await readFile(new URL('../dist/content.json',import.meta.url),'utf8'));
 const standard=new Map(docs.filter(doc=>doc.sourceType==='curriculum').map(doc=>[doc.id,doc]));
 for(const [beforeId,afterId,page,heading] of [
  ['curriculum-14','curriculum-20',20,'（二）选择性必修课程'],
  ['curriculum-20','curriculum-35',35,'（三）选修课程'],
  ['curriculum-44','curriculum-49',49,'（二）学业水平考试建议'],
  ['curriculum-49','curriculum-53',53,'（三）教材编写建议'],
 ]){
  const before=standard.get(beforeId),after=standard.get(afterId);
  assert.ok(before&&after);
  assert.ok(before.displayText.includes(`### PDF 第 ${page} 页`));
  const sharedPage=after.displayText.match(new RegExp(`### PDF 第 ${page} 页[^\\n]*\\n\\n([^\\n]+)`));
  assert.equal(sharedPage?.[1],`#### ${heading}`);
  assert.ok(!before.displayText.includes(`#### ${heading}`),`${beforeId} 混入 ${heading}`);
  assert.ok(!before.text.includes(heading),`${beforeId} 引文文本混入 ${heading}`);
  assert.ok(after.text.includes(heading),`${afterId} 缺少 ${heading}`);
 }
});
