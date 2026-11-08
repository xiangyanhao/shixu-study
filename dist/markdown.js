const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MODEL_LABELS={answer:'回答',summary:'总结',analysis:'分析',overview:'概览',strengths:'掌握较好',weaknesses:'薄弱环节',weak_points:'薄弱环节',recommendations:'复习建议',suggestions:'建议',next_steps:'下一步行动',actions:'行动建议',evidence:'依据',feedback:'反馈',score:'得分',reason:'原因',subjects:'分科建议',subject:'科目',module:'模块',priority:'优先级',limitations:'分析边界',sample_size:'样本量',question:'问题',example:'示例',examples:'示例'};
const modelLabel=key=>MODEL_LABELS[key]||String(key).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ').trim();
const modelScalar=value=>value==null?'暂无':typeof value==='boolean'?(value?'是':'否'):String(value);
function jsonMarkdown(value,depth=2){
 if(Array.isArray(value))return value.length?value.map((item,index)=>item&&typeof item==='object'?`${'#'.repeat(Math.min(4,depth))} 第 ${index+1} 项\n\n${jsonMarkdown(item,depth+1)}`:`- ${modelScalar(item)}`).join('\n\n'):'暂无内容';
 if(!value||typeof value!=='object')return modelScalar(value);
 return Object.entries(value).map(([key,item])=>{const label=modelLabel(key),heading='#'.repeat(Math.min(4,depth));return `${heading} ${label}\n\n${item&&typeof item==='object'?jsonMarkdown(item,depth+1):modelScalar(item)}`;}).join('\n\n');
}
export function formatModelOutput(text,{partial=false}={}){
 const original=String(text??'').trim();if(!original)return '';
 const fenced=original.match(/^```json\s*([\s\S]*?)\s*```$/i),candidate=(fenced?fenced[1]:original).trim(),looksJSON=/^[\[{]/.test(candidate);
 if(!looksJSON)return original;
 try{return jsonMarkdown(JSON.parse(candidate));}catch{return partial?'> 正在整理结构化回答…':'> 模型返回了无法解析的结构化内容，请重新生成。';}
}
function inline(text,options){
 const tokens=[];const hold=html=>`\0${tokens.push(html)-1}\0`;
 let value=text.replace(/\0/g,'').replace(/`([^`]+)`/g,(_,code)=>hold(`<code>${escapeHTML(code)}</code>`));
 value=value.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,(_,label,url)=>hold(`<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(label)} ↗</a>`));
 value=value.replace(/\[(d\d+|curriculum-\d+)\]/g,(whole,id)=>{const source=options.references?.find(d=>d.id===id);return source?hold(`<button type="button" class="source-citation" data-action="read" data-id="${escapeHTML(id)}" title="${escapeHTML(source.title)}">${escapeHTML(whole)}</button>`):whole;});
 value=escapeHTML(value).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/~~(.+?)~~/g,'<del>$1</del>').replace(/(^|[^*])\*([^*\n]+)\*/g,'$1<em>$2</em>');
 return value.replace(/\0(\d+)\0/g,(_,n)=>tokens[Number(n)]);
}
function cells(line){let raw=line.trim().replace(/^\|/,'').replace(/\|$/,''),values=[],part='',code=false;for(let i=0;i<raw.length;i++){const c=raw[i];if(c==='\\'&&raw[i+1]==='|'){part+='|';i++;}else if(c==='`'){code=!code;part+=c;}else if(c==='|'&&!code){values.push(part.trim());part='';}else part+=c;}values.push(part.trim());return values;}

export function renderMarkdown(text,options={}){
 const lines=String(text??'').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,'').split(/\r?\n/);
 const fmt=t=>inline(t,options);let out='',code=false,language='',codeLines=[],table=[],headingIndex=0,quoted=[],paragraph=[],lists=[];
 const closeParagraph=()=>{if(paragraph.length){out+=`<p>${paragraph.map(fmt).join('<br>')}</p>`;paragraph=[];}};
 const closeLists=(indent=-1)=>{while(lists.length&&lists.at(-1).indent>indent)out+=`</li></${lists.pop().type}>`;};
 const closeTable=()=>{
  if(!table.length)return;
  const header=table.length>1&&cells(table[1]).every(c=>/^:?-{3,}:?$/.test(c));
  out+='<div class="table-wrap"><table>';
  if(header)out+='<thead><tr>'+cells(table[0]).map(c=>`<th scope="col">${fmt(c)}</th>`).join('')+'</tr></thead>';
  out+='<tbody>'+table.slice(header?2:0).filter(l=>!cells(l).every(c=>/^:?-{3,}:?$/.test(c))).map(l=>'<tr>'+cells(l).map(c=>`<td>${fmt(c)}</td>`).join('')+'</tr>').join('')+'</tbody></table></div>';table=[];
 };
 const closeQuote=()=>{
  if(!quoted.length)return;let part=[],parts=[];
  const finish=()=>{if(part.length){parts.push(`<p>${part.map(fmt).join('<br>')}</p>`);part=[];}};
  for(const line of quoted){if(line.trim())part.push(line);else finish();}finish();
  if(parts.length)out+=`<blockquote>${parts.join('')}</blockquote>`;quoted=[];
 };
 const closeCode=()=>{
  const body=escapeHTML(codeLines.join('\n')+(codeLines.length?'\n':''));
  if(options.codeTools)out+=`<div class="code-block"><div class="code-toolbar"><span>${escapeHTML(language||'代码')}</span><button type="button" data-action="copy-code">复制代码</button></div><pre><code>${body}</code></pre></div>`;
  else out+=`<pre><code>${body}</code></pre>`;
  codeLines=[];language='';
 };
 for(let i=0;i<lines.length;i++){
  const line=lines[i],fence=line.match(/^ {0,3}```\s*([^`]*)$/);
  if(code){if(fence){closeCode();code=false;}else codeLines.push(line);continue;}
  const quote=line.match(/^ {0,3}>[ \t]?(.*)$/);
  if(quote){closeParagraph();closeLists();closeTable();quoted.push(quote[1]);continue;}closeQuote();
  if(fence){closeParagraph();closeLists();closeTable();code=true;language=fence[1].trim().slice(0,40);continue;}
  if(line.trim().startsWith('|')||(line.includes('|')&&lines[i+1]&&cells(lines[i+1]).every(c=>/^:?-{3,}:?$/.test(c)))||(table.length&&line.includes('|'))){closeParagraph();closeLists();table.push(line);continue;}closeTable();
  if(!line.trim()){closeParagraph();closeLists();continue;}
  const item=line.match(/^(\s*)([-+*]|\d+[.)])\s+(.+)$/);
  if(item){
   closeParagraph();const indent=item[1].replace(/\t/g,'  ').length,type=/\d/.test(item[2])?'ol':'ul';closeLists(indent);
   if(lists.length&&lists.at(-1).indent===indent&&lists.at(-1).type!==type)out+=`</li></${lists.pop().type}>`;
   if(lists.length&&lists.at(-1).indent===indent)out+='</li><li>';
   else{out+=`<${type}${type==='ol'&&parseInt(item[2])!==1?` start="${parseInt(item[2])}"`:''}><li>`;lists.push({type,indent});}
   out+=fmt(item[3]);continue;
  }
  if(lists.length&&/^\s+\S/.test(line)){out+='<br>'+fmt(line.trim());continue;}closeLists();
  const heading=line.match(/^(#{1,6})\s+(.+)/);
  if(heading){closeParagraph();const level=Math.min(4,heading[1].length);out+=`<h${level} id="${escapeHTML(options.headingPrefix||'heading')}-${++headingIndex}">${fmt(heading[2].replace(/\s*\{.*?\}/g,''))}</h${level}>`;continue;}
  if(/^\s*:::/.test(line))continue;
  if(/^\s*(?:---|\*\*\*|___)\s*$/.test(line)){closeParagraph();out+='<div class="rule"></div>';continue;}
  paragraph.push(line);
 }
 closeParagraph();closeLists();closeQuote();closeTable();if(code)closeCode();return out;
}
