import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,readdir,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {PortableStore} from '../portable-store.mjs';
import {createAppServer} from '../server.mjs';
const project=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const fresh=()=>({history:[],wrong:[],read:['curriculum-7'],session:null});
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',()=>r(`http://127.0.0.1:${s.address().port}`)));
const close=s=>new Promise(r=>{s.closeAllConnections();s.close(r);});
test('项目文件记录原子保存，重新实例化与复制data后可以恢复，不存Key',async()=>{
 const original=await mkdtemp(path.join(tmpdir(),'shixu-data-'));const moved=await mkdtemp(path.join(tmpdir(),'shixu-moved-'));
 const store=new PortableStore(original);assert.equal((await store.read()).revision,0);
 const first=await store.write({revision:0,state:fresh(),modelConfig:{url:'https://example.com/v1',model:'m',proxy:true,key:'MUST-NOT-PERSIST'}});assert.equal(first.revision,1);
 await store.write({revision:1,state:{...fresh(),read:['d1','d2']},modelConfig:{model:'m'}});
 const raw=await readFile(path.join(original,'study.json'),'utf8');assert.ok(!raw.includes('MUST-NOT-PERSIST'));assert.equal(JSON.parse(await readFile(path.join(original,'study.previous.json'),'utf8')).revision,1);
 await copyFile(path.join(original,'study.json'),path.join(moved,'study.json'));assert.deepEqual((await new PortableStore(moved).read()).state.read,['d1','d2']);
});
test('同版本并发写只接受一个，损坏文件不被静默重置',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'shixu-conflict-'));const store=new PortableStore(dir);
 const results=await Promise.allSettled([store.write({revision:0,state:fresh()}),store.write({revision:0,state:fresh()})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
 await writeFile(path.join(dir,'study.json'),'broken');await assert.rejects(store.read(),/无法读取/);await assert.rejects(store.write({revision:0,state:fresh()}),/无法读取/);assert.equal(await readFile(path.join(dir,'study.json'),'utf8'),'broken');
});
test('数据API保留状态、拒绝跨站修改并校验修订版本',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'shixu-api-'));const server=createAppServer({dataDir:dir});const origin=await listen(server);
 try{const initial=await (await fetch(origin+'/api/storage')).json();assert.equal(initial.state,null);
  const put=(revision,originHeader=origin)=>fetch(origin+'/api/storage',{method:'PUT',headers:{'Content-Type':'application/json',Origin:originHeader},body:JSON.stringify({revision,state:fresh(),modelConfig:{key:'not-on-disk',model:'test'}})});
  assert.equal((await put(0,'https://foreign.example')).status,403);assert.equal((await put(0)).status,200);assert.equal((await put(0)).status,409);
  const data=await (await fetch(origin+'/api/storage')).json();assert.equal(data.revision,1);assert.equal(data.modelConfig.key,undefined);assert.deepEqual(data.state.read,['curriculum-7']);
 }finally{await close(server);}
});
async function copyTree(source,destination){await mkdir(destination,{recursive:true});for(const entry of await readdir(source,{withFileTypes:true})){const a=path.join(source,entry.name),b=path.join(destination,entry.name);if(entry.isDirectory())await copyTree(a,b);else if(entry.isFile())await copyFile(a,b);}}
function runNode(script,args,cwd,env={}){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[script,...args],{cwd,env:{...process.env,...env},windowsHide:true});let out='';const timer=setTimeout(()=>{child.kill();reject(Error('Process timeout'));},15000);child.stdout.on('data',c=>out+=c);child.stderr.on('data',c=>out+=c);child.on('error',reject);child.on('close',code=>{clearTimeout(timer);resolve({code,out});});});}
test('完整项目换到中文空格路径：从无关cwd启动、复用服务、读取迁移数据',async()=>{
 const parent=await mkdtemp(path.join(tmpdir(),'shixu-relocate-'));const moved=path.join(parent,'中文 空格','study');await mkdir(moved,{recursive:true});
 for(const file of ['server.mjs','portable-store.mjs','credential-vault.mjs','model-proxy.mjs','launcher.mjs','build_content.py','package.json','启动学习台.cmd'])await copyFile(path.join(project,file),path.join(moved,file));
 for(const dir of ['dist','sources'])await copyTree(path.join(project,dir),path.join(moved,dir));
 const store=new PortableStore(path.join(moved,'data'));await store.write({revision:0,state:fresh(),modelConfig:{model:'moved-model',url:'https://example.com/v1',proxy:true}});
 // Reserve a starting port to exercise automatic port fallback.
 const blocker=createServer((req,res)=>{res.writeHead(404);res.end();});await listen(blocker);const port=blocker.address().port;
 const child=spawn(process.execPath,[path.join(moved,'launcher.mjs'),'--no-open'],{cwd:parent,env:{...process.env,SHIXU_PORT:String(port)},windowsHide:true});let out='';let address;
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Launcher timeout: '+out)),12000);child.stdout.on('data',c=>{out+=c;const match=out.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){address=match[0];clearTimeout(timer);resolve();}});child.stderr.on('data',c=>out+=c);child.on('exit',code=>{clearTimeout(timer);reject(Error('Launcher exited '+code+': '+out));});});
  assert.notEqual(address,`http://127.0.0.1:${port}`);assert.equal((await fetch(address)).status,200);assert.equal((await (await fetch(address+'/content.json')).json()).length,49);assert.equal((await (await fetch(address+'/api/storage')).json()).modelConfig.model,'moved-model');
  const reused=await runNode(path.join(moved,'launcher.mjs'),['--no-open'],parent,{SHIXU_PORT:String(port)});assert.equal(reused.code,0);assert.ok(reused.out.includes(address));
  if(process.platform==='win32'){
   const batch=await new Promise((resolve,reject)=>{const p=spawn('cmd.exe',['/d','/c','启动学习台.cmd','--no-open'],{cwd:moved,env:{...process.env,SHIXU_PORT:String(port)},windowsHide:true});let text='';const timer=setTimeout(()=>{p.kill();reject(Error('Windows launcher timeout: '+text));},10000);p.stdout.on('data',c=>text+=c);p.stderr.on('data',c=>text+=c);p.on('error',reject);p.on('close',code=>{clearTimeout(timer);resolve({code,text});});});assert.equal(batch.code,0,batch.text);assert.ok(batch.text.includes(address));
  }
  // Rebuild knowledge without access to the original parent materials or PyMuPDF.
  const rebuilt=await new Promise((resolve,reject)=>{const p=spawn('python',['-X','utf8','-S',path.join(moved,'build_content.py')],{cwd:parent,windowsHide:true});let text='';p.stdout.on('data',c=>text+=c);p.stderr.on('data',c=>text+=c);p.on('error',reject);p.on('close',code=>resolve({code,text}));});assert.equal(rebuilt.code,0,rebuilt.text);assert.ok(rebuilt.text.includes('49'));
 }finally{child.kill();await close(blocker);}
});
