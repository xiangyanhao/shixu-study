import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {normalizeEndpoint} from './dist/core.js';
import {PortableStore} from './portable-store.mjs';
import {createHash} from 'node:crypto';
import {CredentialVault} from './credential-vault.mjs';
import {streamModelProxy} from './model-proxy.mjs';
const root=path.resolve(fileURLToPath(new URL('./dist/',import.meta.url)));
export const instanceId=createHash('sha256').update(path.dirname(root)).digest('hex').slice(0,24);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.pdf':'application/pdf','.svg':'image/svg+xml'};
function send(res,status,data,type='application/json; charset=utf-8'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data));}
export function createAppServer({dataDir=null,credentialVault=null}={}){const store=dataDir?new PortableStore(dataDir):null;const vault=credentialVault||(dataDir?new CredentialVault(path.join(dataDir,'.local-secrets')):null);return createServer(async(req,res)=>{
 try{
  // Bind to loopback; reject cross-site browser requests and DNS rebinding hosts.
  const host=req.headers.host||'';if(!/^(localhost|127\.0\.0\.1):\d+$/.test(host))return send(res,403,{error:'Invalid host'});
  if(req.headers.origin&&req.headers.origin!==`http://${host}`)return send(res,403,{error:'Cross-origin requests are not allowed'});
  const url=new URL(req.url,`http://${host}`);
  if(url.pathname==='/api/health'&&req.method==='GET')return send(res,200,{app:'shixu-study',instanceId,portable:!!store});
  if(url.pathname==='/api/credentials'&&vault){
   if(req.method==='GET')return send(res,200,await vault.status(url.searchParams.get('endpoint')||''));
   if(!['PUT','DELETE'].includes(req.method))return send(res,405,{error:'GET, PUT or DELETE required'});
   if(!req.headers['content-type']?.startsWith('application/json'))return send(res,415,{error:'JSON required'});
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>10000)return send(res,413,{error:'Request too large'});chunks.push(chunk);}
   let input;try{input=JSON.parse(Buffer.concat(chunks));}catch{return send(res,400,{error:'Invalid JSON'});}
   return send(res,200,await(req.method==='PUT'?vault.put(input.endpoint,input.key):vault.remove(input.endpoint)));
  }
  if(url.pathname==='/api/storage'&&store){
   if(req.method==='GET')return send(res,200,await store.read());
   if(req.method!=='PUT')return send(res,405,{error:'GET or PUT required'});
   if(!req.headers['content-type']?.startsWith('application/json'))return send(res,415,{error:'JSON required'});
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>15000000)return send(res,413,{error:'学习数据超过15 MB，请先导出分批备份。'});chunks.push(chunk);}
   let input;try{input=JSON.parse(Buffer.concat(chunks));}catch{return send(res,400,{error:'Invalid JSON'});}
   const saved=await store.write(input);return send(res,200,{revision:saved.revision,updatedAt:saved.updatedAt});
  }
  if(url.pathname==='/api/chat'){
   if(req.method!=='POST')return send(res,405,{error:'POST required'});
   if(!req.headers['content-type']?.startsWith('application/json'))return send(res,415,{error:'JSON required'});
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>2000000)return send(res,413,{error:'Request too large'});chunks.push(chunk);}
   let input;try{input=JSON.parse(Buffer.concat(chunks));}catch{return send(res,400,{error:'Invalid JSON'});}
   if(input.body?.stream===true)return await streamModelProxy(req,res,input,vault,host);
   const endpoint=normalizeEndpoint(input.endpoint||'');if(new URL(endpoint).host===host)return send(res,400,{error:'Cannot proxy to this server'});
   if(typeof input.body?.model!=='string'||!Array.isArray(input.body?.messages))return send(res,400,{error:'Invalid model request'});
   const key=input.useStoredKey&&vault?await vault.get(endpoint):input.key;
   if(typeof key!=='string'||!key.trim()||key.length>2000||/[\r\n\0]/.test(key))return send(res,400,{error:'Invalid API Key'});
   // Do not log payloads or keys. Never follow a redirect carrying credentials.
   const upstream=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify({model:input.body.model,messages:input.body.messages,stream:false}),signal:AbortSignal.timeout(120000),redirect:'error'});
   const raw=(await upstream.text()).split(key).join('[redacted]');return send(res,upstream.status,raw);
  }
  if(!['GET','HEAD'].includes(req.method))return send(res,405,{error:'Method not allowed'});
  const requested=decodeURIComponent(url.pathname);const target=path.resolve(root,'.'+(requested==='/'?'/index.html':requested));
  if(!target.startsWith(root+path.sep)&&target!==path.join(root,'index.html'))return send(res,403,{error:'Invalid path'});
  try{if(!(await stat(target)).isFile())return send(res,404,{error:'Not found'});const data=await readFile(target);if(req.method==='HEAD'){res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream'});return res.end();}return send(res,200,data,mime[path.extname(target)]||'application/octet-stream');}catch{return send(res,404,{error:'Not found'});}
 }catch(e){send(res,e.status||(['/api/storage','/api/credentials'].includes(urlPath(req))?500:e.name==='TimeoutError'?504:502),{error:['/api/storage','/api/credentials'].includes(urlPath(req))?e.message:'Model request failed. Check endpoint, connectivity and credentials.'});}
 });}
const urlPath=req=>req.url?.split('?')[0];
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=Number(process.env.SHIXU_PORT||4173);const server=createAppServer({dataDir:path.join(path.dirname(root),'data')});server.on('error',e=>{console.error(`Unable to start (${e.code}). Try another SHIXU_PORT.`);process.exitCode=1;});server.listen(port,'127.0.0.1',()=>console.log(`师序学习台 Local: http://127.0.0.1:${port}`));
}
