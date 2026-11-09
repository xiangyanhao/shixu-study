import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {formatSourceQuizMarkdown} from '../dist/source-quiz.js';
import {renderMarkdown} from '../dist/markdown.js';

test('source quiz formats inline, wrapped and separate choices as readable cards',()=>{
 const source=`## 自测
1. 第一题（ ）A. 甲 B. 乙 C. 丙 D. 丁
2. 第二题（ ）
   A. 苹果 B. 香蕉
   C. 葡萄 D. 西瓜
3. 第三题（ ）
A 感知运动
B 前运算
C 具体运算
D 形式运算
<details><summary>参考答案</summary>
1. **A**
</details>
## 后续章节
1. 普通编号段落`;
 const formatted=formatSourceQuizMarkdown(source);
 const html=renderMarkdown(formatted,{sourceQuiz:true,allowDetails:true});
 assert.equal((formatted.match(/^   - [ABCD]\. /gm)||[]).length,12);
 assert.equal((html.match(/class="source-quiz-options"/g)||[]).length,3);
 assert.equal((html.match(/class="source-quiz-list"/g)||[]).length,1);
 assert.match(html,/<details class="source-details">/);
 assert.match(html,/<ol><li>普通编号段落/);
 assert.match(formatted,/1\. 第一题（ ）\n   - A\. 甲/);
});

test('source quiz changes display only and keeps real source answers intact',()=>{
 const docs=JSON.parse(fs.readFileSync(new URL('../dist/content.json',import.meta.url),'utf8'));
 const ids=['d7','d8','d9','d11','d15','d16','d19','d22'];
 for(const id of ids){
  const doc=docs.find(item=>item.id===id),source=doc.displayText||doc.text;
  const formatted=formatSourceQuizMarkdown(source);
  const html=renderMarkdown(formatted,{sourceQuiz:true,allowDetails:true});
  assert.match(html,/class="source-quiz-list"/,id);
  assert.match(html,/class="source-quiz-options"/,id);
  assert.match(html,/<details class="source-details">/,id);
  assert.equal(doc.displayText||doc.text,source,id);
 }
});

test('ordinary prose and model Markdown do not gain quiz styling',()=>{
 const source='## 默写与自测办法\n1. 每日复习\n## 自测清单\n1. 核对任务';
 assert.equal(formatSourceQuizMarkdown(source),source);
 assert.doesNotMatch(renderMarkdown(source,{sourceQuiz:true}),/source-quiz-/);
 assert.doesNotMatch(renderMarkdown('## 自测\n1. 问题'),/source-quiz-/);
});
