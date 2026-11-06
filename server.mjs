import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {normalizeEndpoint} from './dist/core.js';
const root=path.resolve(fileURLToPath(new URL('./dist/',import.meta.url)));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.pdf':'application/pdf','.svg':'image/svg+xml'};
function send(res,status,data,type='application/json; charset=utf-8'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data));}
export function createAppServer(){return createServer(async(req,res)=>{
 try{
  // Bind to loopback; reject cross-site browser requests and DNS rebinding hosts.
  const host=req.headers.host||'';if(!/^(localhost|127\.0\.0\.1):\d+$/.test(host))return send(res,403,{error:'Invalid host'});
  if(req.headers.origin&&req.headers.origin!==`http://${host}`)return send(res,403,{error:'Cross-origin requests are not allowed'});
  const url=new URL(req.url,`http://${host}`);
  if(url.pathname==='/api/chat'){
   if(req.method!=='POST')return send(res,405,{error:'POST required'});
   if(!req.headers['content-type']?.startsWith('application/json'))return send(res,415,{error:'JSON required'});
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>2000000)return send(res,413,{error:'Request too large'});chunks.push(chunk);}
   let input;try{input=JSON.parse(Buffer.concat(chunks));}catch{return send(res,400,{error:'Invalid JSON'});}
   const endpoint=normalizeEndpoint(input.endpoint||'');if(new URL(endpoint).host===host)return send(res,400,{error:'Cannot proxy to this server'});
   if(typeof input.key!=='string'||!input.key.trim()||input.key.length>2000||typeof input.body?.model!=='string'||!Array.isArray(input.body?.messages))return send(res,400,{error:'Invalid model request'});
   // Do not log payloads or keys. Never follow a redirect carrying credentials.
   const upstream=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${input.key}`},body:JSON.stringify({model:input.body.model,messages:input.body.messages,stream:false}),signal:AbortSignal.timeout(120000),redirect:'error'});
   const raw=await upstream.text();return send(res,upstream.status,raw);
  }
  if(!['GET','HEAD'].includes(req.method))return send(res,405,{error:'Method not allowed'});
  const requested=decodeURIComponent(url.pathname);const target=path.resolve(root,'.'+(requested==='/'?'/index.html':requested));
  if(!target.startsWith(root+path.sep)&&target!==path.join(root,'index.html'))return send(res,403,{error:'Invalid path'});
  try{if(!(await stat(target)).isFile())return send(res,404,{error:'Not found'});const data=await readFile(target);if(req.method==='HEAD'){res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream'});return res.end();}return send(res,200,data,mime[path.extname(target)]||'application/octet-stream');}catch{return send(res,404,{error:'Not found'});}
 }catch(e){send(res,e.name==='TimeoutError'?504:502,{error:'Model request failed. Check endpoint, connectivity and credentials.'});}
 });}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=Number(process.env.SHIXU_PORT||4173);const server=createAppServer();server.on('error',e=>{console.error(`Unable to start (${e.code}). Try another SHIXU_PORT.`);process.exitCode=1;});server.listen(port,'127.0.0.1',()=>console.log(`师序学习台 Local: http://127.0.0.1:${port}`));
}
