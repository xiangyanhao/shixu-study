import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createAppServer,instanceId} from './server.mjs';

const appDir=path.dirname(fileURLToPath(import.meta.url));
const dataDir=path.join(appDir,'data');
const openPage=url=>{
 if(process.argv.includes('--no-open'))return;
 const [command,args]=process.platform==='win32'?['rundll32.exe',['url.dll,FileProtocolHandler',url]]:process.platform==='darwin'?['open',[url]]:['xdg-open',[url]];
 const child=spawn(command,args,{windowsHide:true,stdio:'ignore',detached:true});child.on('error',()=>console.log('请手动打开上面的浏览器地址。'));child.unref();
};
async function launch(){
 if(Number(process.versions.node.split('.')[0])<22)throw Error('需要 Node.js 22 或以上版本。');
 await mkdir(dataDir,{recursive:true});
 const first=Number(process.env.SHIXU_PORT||4173);if(!Number.isInteger(first)||first<1024||first>65525)throw Error('SHIXU_PORT 必须为 1024–65525 的整数。');
 for(let port=first;port<first+10;port++){
  const url=`http://127.0.0.1:${port}`;
  const server=createAppServer({dataDir});
  try{
   await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});
   console.log(`师序学习台：${url}\n学习数据：${dataDir}\n保持本窗口开启；关闭窗口或按 Ctrl+C 停止服务。`);openPage(url);return;
  }catch(e){
   if(!['EADDRINUSE','EACCES'].includes(e.code))throw e;
   try{const health=await (await fetch(url+'/api/health',{signal:AbortSignal.timeout(1000)})).json();if(health.instanceId===instanceId&&health.portable){console.log(`学习台已在运行：${url}`);openPage(url);return;}}catch{}
  }
 }
 throw Error('连续10个端口均被占用，请设置 SHIXU_PORT 后重试。');
}
launch().catch(e=>{console.error(`启动失败：${e.message}`);process.exitCode=1;});
