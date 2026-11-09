import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {formatModelOutput,renderMarkdown} from '../dist/markdown.js';

test('真实逐字稿模板：九个段落组成一个连续引用块，没有空引用框',async()=>{
 const docs=JSON.parse(await readFile(new URL('../dist/content.json',import.meta.url),'utf8'));
 const interview=docs.find(d=>d.subject===4&&d.text.includes('#### 逐字稿模板'));
 const excerpt=interview.text.split('#### 逐字稿模板')[1].split('#### 无生上课')[0];
 const html=renderMarkdown(excerpt);
 assert.equal((html.match(/<blockquote>/g)||[]).length,1);
 const quote=html.match(/<blockquote>(.*?)<\/blockquote>/s)[1];
 assert.equal((quote.match(/<p>/g)||[]).length,9);
 assert.ok(quote.includes('各位考官好')&&quote.includes('感谢各位考官'));
 assert.ok(!/<(?:blockquote|p)>\s*<\//.test(html));
});
test('引用空行分段，连续空标记不生成空段，正文终止当前引用',()=>{
 assert.equal(renderMarkdown('> **开场**\n> 第二行\n>\n>\n> 结尾\n\n正文\n> 新引用\n>'),'<blockquote><p><strong>开场</strong><br>第二行</p><p>结尾</p></blockquote><p>正文</p><blockquote><p>新引用</p></blockquote>');
 assert.equal(renderMarkdown('>\n>\n'), '');
});
test('引用中的HTML仍转义，代码块中的大于号不转成引用块',()=>{
 const html=renderMarkdown('> <script>alert(1)</script>\n\n```text\n> 原样代码\n```\n\n## 标题');
 assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
 assert.ok(html.includes('<pre><code>&gt; 原样代码\n</code></pre>'));
 assert.ok(html.endsWith('<h2 id="heading-1">标题</h2>'));
 assert.equal((html.match(/<blockquote>/g)||[]).length,1);
});
test('回答中的分层列表、表格表头、代码复制工具和真实资料引用',()=>{
 const html=renderMarkdown('## 解释\n\n1. 第一项\n   - 子项\n2. 第二项\n\n| 概念 | 说明 |\n| --- | --- |\n| A | **强调** |\n\n```python\nprint("hello")\n```\n\n依据 [curriculum-7]，未知 [d999]。',{codeTools:true,references:[{id:'curriculum-7',title:'核心素养'}]});
 assert.ok(html.includes('<ol><li>第一项<ul><li>子项</li></ul></li><li>第二项</li></ol>'));
 assert.ok(html.includes('<thead><tr><th scope="col">概念</th>'));assert.ok(html.includes('data-action="copy-code"'));assert.ok(html.includes('print(&quot;hello&quot;)'));assert.ok(html.includes('data-id="curriculum-7"'));assert.ok(!html.includes('data-id="d999"'));
});
test('代码内不误解析Markdown，模型HTML和危险链接不能执行',()=>{
 const html=renderMarkdown('`**literal**`\n\n<script>alert(1)</script>\n\n[坏链接](javascript:alert(1))\n\n[正常链接](https://example.com/?q="x")');
 assert.ok(html.includes('<code>**literal**</code>'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('href="javascript:'));assert.ok(html.includes('rel="noopener noreferrer"'));assert.ok(html.includes('&quot;x&quot;'));
});
test('模型JSON转换为可读Markdown，不向用户展示裸对象',()=>{const formatted=formatModelOutput('{"summary":"样本较少","weaknesses":["学习心理","教学评价"],"next_steps":[{"action":"完成专项练习","priority":"高"}]}');assert.ok(formatted.includes('总结'));assert.ok(formatted.includes('薄弱环节'));assert.ok(formatted.includes('下一步行动'));assert.ok(!formatted.includes('{"'));const html=renderMarkdown(formatted);assert.ok(html.includes('<h2'));assert.ok(html.includes('<li>'));});
test('未完成或损坏的模型JSON显示友好状态而非原文',()=>{assert.match(formatModelOutput('{"answer":',{partial:true}),/正在整理/);assert.match(formatModelOutput('{"answer":'),/无法解析/);assert.ok(!formatModelOutput('{"answer":').includes('{"answer"'));});
test('资料目录只收录正文实际标题，代码注释不占目录位置',async()=>{
 const docs=JSON.parse(await readFile(new URL('../dist/content.json',import.meta.url),'utf8'));
 for(const doc of docs){
  const headings=[];
  const html=renderMarkdown(doc.displayText||doc.text,{onHeading:heading=>headings.push(heading)});
  const renderedIds=[...html.matchAll(/<h[1-4] id="(heading-\d+)">/g)].map(match=>match[1]);
  assert.deepEqual(headings.map(heading=>heading.id),renderedIds,doc.title);
 }
 const book=docs.find(doc=>(doc.displayText||doc.text).includes('第三章　学科知识：AI 背景的“降维”与“补缺”'));
 assert.ok(book);
 const headings=[];
 renderMarkdown(book.displayText||book.text,{onHeading:heading=>headings.push(heading)});
 assert.ok(headings.some(heading=>heading.title.includes('第三章　学科知识')));
 assert.ok(headings.some(heading=>heading.title==='Python 高频语法'));
 assert.ok(!headings.some(heading=>heading.title==='输入输出'||heading.title==='分支'));
});
