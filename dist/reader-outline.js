const PDF_PAGE=/^PDF 第 (\d+) 页/;
const MAJOR=/^(?:[一二三四五六七八九十百]+、|附录$)/;
const SECTION=/^（[一二三四五六七八九十]+）/;
const MODULE=/^模块\s*\d+/;
const NUMBERED=/^\d+[.．]\s*/;
const SUBNUMBER=/^（\d+）/;
const TABLE=/^表\s*\d+/;
const TABLE_ROW=/^(?:必修|选择性必修|选修)$/;
const LEVEL=/^水平\s*\d+/;
const REQUIREMENT=/^【[^】]+】$/;

export function buildReaderOutline(headings,sourceType,sourceText=''){
 if(sourceType!=='curriculum'){
  const levels=[...new Set(headings.map(h=>h.level))].sort((a,b)=>a-b);
  return {entries:headings.map(h=>({...h,depth:levels.indexOf(h.level)})),pages:[]};
 }
 const entries=[],pages=[],levelContexts=[];
 let context='';
 for(const line of sourceText.split(/\r?\n/)){
  const category=line.match(/^\*\*水平\s*·\s*([^*]+)\*\*$/);
  if(category)context=category[1].trim();
  if(/^#{1,6}\s+水平\s*\d+/.test(line))levelContexts.push(context);
 }
 let levelIndex=0;
 let major=null,section=null,module=null,numbered=null,table=null,topic=null;
 for(const heading of headings){
  const h={...heading};
  const page=h.title.match(PDF_PAGE);
  if(page){pages.push({...h,page:Number(page[1])});continue;}
  if(!entries.length){h.depth=0;entries.push(h);continue;}
  if(MAJOR.test(h.title)){
   h.depth=1;major=1;section=module=numbered=table=topic=null;
  }else if(SECTION.test(h.title)){
   h.depth=major!=null?2:1;section=h.depth;module=numbered=table=topic=null;
  }else if(MODULE.test(h.title)){
   h.depth=(section??major??0)+1;module=h.depth;numbered=table=topic=null;
  }else if(TABLE.test(h.title)){
   h.depth=(section??major??0)+1;table=h.depth;module=numbered=topic=null;
  }else if(TABLE_ROW.test(h.title)&&table!=null){
   h.depth=table+1;
  }else if(NUMBERED.test(h.title)){
   h.depth=(section??major??0)+1;numbered=h.depth;module=table=topic=null;
  }else if(SUBNUMBER.test(h.title)){
   h.depth=(numbered??section??major??0)+1;
  }else if(REQUIREMENT.test(h.title)){
   h.depth=(module??numbered??section??major??0)+1;
  }else if(LEVEL.test(h.title)){
   h.depth=(table??topic??section??major??0)+1;
   const category=levelContexts[levelIndex++];
   if(category)h.label=`${category} · ${h.title}`;
  }else{
   h.depth=Math.min(heading.level-2,(section??major??0)+1);
   topic=h.depth;
  }
  entries.push(h);
 }
 return {entries,pages};
}
