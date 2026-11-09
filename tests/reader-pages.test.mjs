import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderMarkdown} from '../dist/markdown.js';
import {joinPdfPageContinuations} from '../dist/reader-pages.js';

const page=(id,number)=>`<h3 id="${id}">PDF 第 ${number} 页（正文第 ${number-3} 页）</h3>`;

test('跨页续句合为一个段落，页码保留可跳转的行内锚点',()=>{
 const input=`<p>前半句</p>${page('heading-2',9)}<p>后半句</p>${page('heading-3',10)}<p>结束。</p>`;
 const html=joinPdfPageContinuations(input);
 assert.equal((html.match(/<p>/g)||[]).length,1);
 assert.match(html,/前半句<span id="heading-2" class="pdf-page-inline"[^>]*>〔PDF 9〕<\/span>后半句/);
 assert.match(html,/后半句<span id="heading-3" class="pdf-page-inline"[^>]*>〔PDF 10〕<\/span>结束。/);
});

test('完整句后的页码和下一页的新条目保持分段',()=>{
 const ended=`<p>上一段结束。</p>${page('heading-2',9)}<p>下一段开始。</p>`;
 const numbered=`<p>本页说明</p>${page('heading-3',10)}<p>（1）下一项</p>`;
 assert.equal(joinPdfPageContinuations(ended),ended);
 assert.equal(joinPdfPageContinuations(numbered),numbered);
});

test('课标全文跨页处理不丢正文或页码目标',async()=>{
 const docs=JSON.parse(await readFile(new URL('../dist/content.json',import.meta.url),'utf8'));
 let joined=0;
 for(const doc of docs.filter(item=>item.sourceType==='curriculum')){
  const headings=[],original=renderMarkdown(doc.displayText,{onHeading:heading=>headings.push(heading)}),html=joinPdfPageContinuations(original);
  joined+=(html.match(/class="pdf-page-inline"/g)||[]).length;
  for(const heading of headings)assert.equal((html.match(new RegExp(`id="${heading.id}"`,'g'))||[]).length,1,`${doc.title}: ${heading.id}`);
  const strip=markup=>markup.replace(/<h3 id="heading-\d+">PDF 第 \d+ 页（正文第 \d+ 页）<\/h3>/g,'').replace(/<span id="heading-\d+" class="pdf-page-inline"[^>]*>〔PDF \d+〕<\/span>/g,'').replace(/<[^>]+>/g,'');
  assert.equal(strip(html),strip(original),doc.title);
 }
 assert.ok(joined>=20);
});
