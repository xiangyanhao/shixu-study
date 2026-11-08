import {mkdir,readFile,writeFile,rename,copyFile} from 'node:fs/promises';
import path from 'node:path';

export class PortableStore {
 constructor(directory){this.directory=path.resolve(directory);this.file=path.join(this.directory,'study.json');this.queue=Promise.resolve();}
 async read(){
  try{const doc=JSON.parse(await readFile(this.file,'utf8'));if(doc.format!=='shixu-portable'||doc.version!==1||!Number.isInteger(doc.revision)||!doc.state)throw Error('Invalid data');return doc;}
  catch(e){if(e.code==='ENOENT')return {format:'shixu-portable',version:1,revision:0,state:null,modelConfig:null};throw Error('无法读取 data/study.json，请保留该文件，并从备份恢复。');}
 }
 write(input){
  const action=async()=>{
   const current=await this.read();
   if(input.revision!==current.revision){const e=Error('学习数据已被另一页面更新，请刷新后继续。');e.status=409;throw e;}
   const s=input.state;
   if(!s||!Array.isArray(s.history)||!Array.isArray(s.wrong)||!Array.isArray(s.read)||(s.session!==null&&typeof s.session!=='object')){const e=Error('学习数据结构无效');e.status=400;throw e;}
   const m=input.modelConfig||{};
   const next={format:'shixu-portable',version:1,revision:current.revision+1,updatedAt:new Date().toISOString(),state:{history:s.history,wrong:s.wrong,read:s.read,session:s.session},modelConfig:{url:typeof m.url==='string'?m.url:'',model:typeof m.model==='string'?m.model:'',proxy:typeof m.proxy==='boolean'?m.proxy:true}};
   await mkdir(this.directory,{recursive:true});
   // Keep the previous valid document. Atomic replacement avoids partial JSON.
   if(current.revision)await copyFile(this.file,path.join(this.directory,'study.previous.json'));
   const temp=path.join(this.directory,'study.pending.json');
   await writeFile(temp,JSON.stringify(next,null,2),{encoding:'utf8',flush:true});await rename(temp,this.file);return next;
  };
  const result=this.queue.then(action);this.queue=result.catch(()=>{});return result;
 }
}
