import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {CredentialVault,systemCodec} from '../credential-vault.mjs';
import {createAppServer} from '../server.mjs';
import {requestModel} from '../dist/core.js';
const fixtureKey='fixture-key-not-a-real-credential';
function testCodec(){const key=randomBytes(32);return {supported:true,name:'test-aes256-gcm',async transform(op,value,endpoint){if(op==='protect'){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(endpoint));const bytes=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString('base64');}const bytes=Buffer.from(value,'base64'),decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));decipher.setAAD(Buffer.from(endpoint));decipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8');}};}
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',()=>r(`http://127.0.0.1:${s.address().port}`)));
const close=s=>new Promise(r=>{s.closeAllConnections();s.close(r);});

test('密钥加密落盘，重新实例化可解密，替换和删除生效',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'shixu-vault-')),codec=testCodec(),endpoint='https://example.com/v1';let vault=new CredentialVault(dir,{codec});
 await vault.put(endpoint,fixtureKey);const raw=await readFile(vault.file,'utf8');assert.ok(!raw.includes(fixtureKey));assert.equal((await vault.status(endpoint)).saved,true);assert.ok(!JSON.stringify(await vault.status(endpoint)).includes('ciphertext'));
 vault=new CredentialVault(dir,{codec});assert.equal(await vault.get(endpoint),fixtureKey);await assert.rejects(vault.get('https://other.example/v1'),/没有已保存/);
 await vault.put(endpoint,fixtureKey+'-replacement');assert.equal(await vault.get(endpoint),fixtureKey+'-replacement');await vault.remove(endpoint);assert.equal((await vault.status(endpoint)).saved,false);await assert.rejects(vault.get(endpoint),/没有已保存/);
});
test('Windows DPAPI真实加密，新的实例无需输入Key，绑定服务URL', {skip:process.platform!=='win32'||process.env.SHIXU_TEST_DPAPI!=='1'},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'shixu-native-vault-'));const key=randomBytes(24).toString('hex'),endpoint='https://example.com/v1';
 await new CredentialVault(dir).put(endpoint,key);assert.equal(await new CredentialVault(dir).get(endpoint),key);const raw=await readFile(path.join(dir,'credentials.json'),'utf8');assert.ok(!raw.includes(key));
 const doc=JSON.parse(raw);await assert.rejects(systemCodec.transform('unprotect',doc.records[0].ciphertext,'https://other.example/v1/chat/completions'));await new CredentialVault(dir).remove(endpoint);
});
test('代理从密文读取Key，刷新及服务重启不依赖浏览器，所有响应不暴露Key',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'shixu-key-api-')),codec=testCodec();let received=[];
 const model=createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;received.push({authorization:req.headers.authorization,body:JSON.parse(raw)});res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:'服务回显 '+fixtureKey}}]}));});const endpoint=await listen(model);
 let server=createAppServer({dataDir:dir,credentialVault:new CredentialVault(path.join(dir,'.local-secrets'),{codec})}),origin=await listen(server);
 try{
  const put=await fetch(origin+'/api/credentials',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint,key:fixtureKey})});assert.equal(put.status,200);assert.deepEqual(await put.json(),{saved:true});
  await close(server);server=createAppServer({dataDir:dir,credentialVault:new CredentialVault(path.join(dir,'.local-secrets'),{codec})});origin=await listen(server);
  const status=await (await fetch(origin+'/api/credentials?endpoint='+encodeURIComponent(endpoint))).json();assert.equal(status.saved,true);assert.deepEqual(Object.keys(status).sort(),['protection','saved','supported']);
  let browserBody;
  const result=await requestModel({url:endpoint,model:'test-model',key:'',proxy:true,useStoredKey:true},[{role:'user',content:'hello'}],{transport:(url,init)=>{browserBody=JSON.parse(init.body);return fetch(origin+url,init);}});
  assert.equal(result,'服务回显 [redacted]');assert.equal(browserBody.key,undefined);assert.equal(browserBody.useStoredKey,true);assert.equal(received[0].authorization,'Bearer '+fixtureKey);assert.ok(!JSON.stringify(received[0].body).includes(fixtureKey));
  const foreign=await fetch(origin+'/api/credentials',{method:'DELETE',headers:{Origin:'https://attacker.example','Content-Type':'application/json'},body:JSON.stringify({endpoint})});assert.equal(foreign.status,403);
  const wrong=await fetch(origin+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:endpoint+'/other/chat/completions',useStoredKey:true,body:{model:'test-model',messages:[]}})});assert.equal(wrong.status,502);assert.equal(received.length,1);
  assert.equal((await fetch(origin+'/.local-secrets/credentials.json')).status,404);assert.equal((await fetch(origin+'/api/credentials',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint})})).status,200);assert.equal((await (await fetch(origin+'/api/credentials?endpoint='+encodeURIComponent(endpoint))).json()).saved,false);
 }finally{await close(server);await close(model);}
});
test('便携包排除密文、临时文件和嵌套私密目录，同时保留学习数据',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'shixu-package-'));const project=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
 for(const dir of ['dist','sources','tests','scripts','data/.local-secrets','scripts/.local-secrets'])await mkdir(path.join(root,dir),{recursive:true});
 for(const file of ['package.json','README.md','AGENTS.md','server.mjs','portable-store.mjs','credential-vault.mjs','model-proxy.mjs','launcher.mjs','build_content.py','启动学习台.cmd','start.sh','scripts/package_portable.py'])await copyFile(path.join(project,file),path.join(root,file));
 await writeFile(path.join(root,'dist/index.html'),'<h1>fixture</h1>');await writeFile(path.join(root,'data/study.json'),JSON.stringify({history:[],wrong:[],read:['d1'],session:null}));
 for(const file of ['data/.local-secrets/credentials.json','data/.local-secrets/credentials.pending.json','scripts/.local-secrets/private.key','scripts/.env'])await writeFile(path.join(root,file),'ENCRYPTED-PRIVATE-MATERIAL');
 const run=(args)=>new Promise((resolve,reject)=>{const child=spawn('python',['-X','utf8',...args],{cwd:root,windowsHide:true});let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);child.on('error',reject);child.on('close',code=>resolve({code,output}));});
 const packed=await run([path.join(root,'scripts/package_portable.py')]);assert.equal(packed.code,0,packed.output);
 const checked=await run(['-c',"from zipfile import ZipFile; z=ZipFile('releases/shixu-study-portable.zip'); n=z.namelist(); assert 'shixu-study/data/study.json' in n; assert not any('.local-secrets' in p or '/.env' in p for p in n); assert not any(b'ENCRYPTED-PRIVATE-MATERIAL' in z.read(p) for p in n); assert z.testzip() is None; print('verified')"]);assert.equal(checked.code,0,checked.output);
});
