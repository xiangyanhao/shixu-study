export const isSourceQuizHeading=title=>/(自测|真题级练习)/.test(title)&&!/(清单|办法|侧重)/.test(title);

function splitChoices(value){
 const match=/(^|[\s）)。])A(?:[.．、]\s*|\s+)([\s\S]*?)\s+B(?:[.．、]\s*|\s+)([\s\S]*?)\s+C(?:[.．、]\s*|\s+)([\s\S]*?)\s+D(?:[.．、]\s*|\s+)([\s\S]+)$/.exec(value);
 if(!match)return null;
 return {stem:(value.slice(0,match.index)+match[1]).trim(),choices:match.slice(2).map(choice=>choice.trim())};
}

export function formatSourceQuizMarkdown(source){
 const lines=String(source??'').split(/\r?\n/),result=[];
 let quizLevel=0,inDetails=false,inCode=false,question=false;
 for(let index=0;index<lines.length;index++){
  const line=lines[index];
  if(/^ {0,3}```/.test(line)){inCode=!inCode;result.push(line);continue;}
  if(inCode){result.push(line);continue;}
  const heading=line.match(/^(#{1,6})\s+(.+)/);
  if(heading){const level=heading[1].length;if(quizLevel&&level<=quizLevel)quizLevel=0;if(isSourceQuizHeading(heading[2]))quizLevel=level;question=false;}
  if(/^\s*<details(?:\s|>)/.test(line)){inDetails=true;question=false;}
  if(inDetails){result.push(line);if(line.includes('</details>'))inDetails=false;continue;}
  if(!quizLevel||heading){result.push(line);continue;}
  const item=line.match(/^(\d+[.)]\s+)(.+)$/);
  if(item){
   question=true;
   let combined=item[2],end=index;
   while(end+1<lines.length&&/^\s*[ABCD](?:[.．、]|\s+)/.test(lines[end+1]))combined+=' '+lines[++end].trim();
   const parsed=splitChoices(combined);
   result.push(item[1]+(parsed?.stem||item[2]));
   if(parsed){for(let i=0;i<4;i++)result.push(`   - ${'ABCD'[i]}. ${parsed.choices[i]}`);index=end;}
   continue;
  }
  if(question){
   const parsed=splitChoices(line);
   if(parsed&&!parsed.stem){for(let i=0;i<4;i++)result.push(`   - ${'ABCD'[i]}. ${parsed.choices[i]}`);continue;}
   const single=line.match(/^\s*([ABCD])(?:[.．、]\s*|\s+)(.+)$/);
   if(single){result.push(`   - ${single[1]}. ${single[2].trim()}`);continue;}
   if(line.trim())question=false;
  }
  result.push(line);
 }
 return result.join('\n');
}
