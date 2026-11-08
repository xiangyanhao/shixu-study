import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {normalizeEndpoint} from './dist/core.js';

// The payload (including any secret) travels over stdin, never argv or env.
// No master encryption key is stored with the app: DPAPI uses CurrentUser.
const dpapiScript=String.raw`
$ErrorActionPreference = 'Stop'
try {
 [Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
 [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
 Add-Type -AssemblyName System.Security
 $p = [Console]::In.ReadToEnd() | ConvertFrom-Json
 $entropy = [Text.Encoding]::UTF8.GetBytes('shixu-credential-v1:' + $p.endpoint)
 $scope = [Security.Cryptography.DataProtectionScope]::CurrentUser
 if ($p.operation -eq 'protect') {
  $bytes = [Text.Encoding]::UTF8.GetBytes($p.value)
  $result = [Security.Cryptography.ProtectedData]::Protect($bytes, $entropy, $scope)
  [Console]::Out.Write([Convert]::ToBase64String($result))
 } elseif ($p.operation -eq 'unprotect') {
  $bytes = [Convert]::FromBase64String($p.value)
  $result = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $entropy, $scope)
  [Console]::Out.Write([Text.Encoding]::UTF8.GetString($result))
 } else { exit 1 }
} catch { [Console]::Error.Write('DPAPI operation failed'); exit 1 }
`;
export const systemCodec={
 supported:process.platform==='win32',name:'windows-dpapi-current-user',
 async transform(operation,value,endpoint){
  if(!this.supported)throw Error('本机加密保存目前需要 Windows；其他系统可仅在当前页面使用 Key。');
  return new Promise((resolve,reject)=>{
   const executable=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
   const child=spawn(executable,['-NoLogo','-NoProfile','-NonInteractive','-Command',dpapiScript],{windowsHide:true,stdio:['pipe','pipe','pipe']});
   let output='';const timer=setTimeout(()=>{child.kill();reject(Error('系统密钥加密操作超时。'));},20000);
   child.stdout.setEncoding('utf8');child.stdout.on('data',c=>{output+=c;});child.stderr.resume();child.stdin.on('error',()=>{});
   child.on('error',()=>{clearTimeout(timer);reject(Error('无法调用 Windows 数据保护功能。'));});
   child.on('close',code=>{clearTimeout(timer);if(code!==0||!output)reject(Error('Windows 无法加密或解密该密钥，请使用原 Windows 用户，或重新输入并保存。'));else resolve(output);});
   child.stdin.end(JSON.stringify({operation,value,endpoint}));
  });
 }
};

export class CredentialVault {
 constructor(directory,{codec=systemCodec}={}){this.directory=path.resolve(directory);this.file=path.join(this.directory,'credentials.json');this.codec=codec;this.queue=Promise.resolve();}
 async records(){try{const doc=JSON.parse(await readFile(this.file,'utf8'));if(doc.format!=='shixu-encrypted-credentials'||doc.version!==1||!Array.isArray(doc.records)||doc.records.some(r=>typeof r.endpoint!=='string'||typeof r.ciphertext!=='string'||r.protection!==this.codec.name))throw Error('Invalid vault');return doc.records;}catch(e){if(e.code==='ENOENT')return [];throw Error('本机密钥文件无法读取，请保留文件并重新配置。');}}
 async status(endpoint){const normalized=normalizeEndpoint(endpoint);return {supported:this.codec.supported,protection:this.codec.name,saved:(await this.records()).some(r=>r.endpoint===normalized)};}
 mutate(action){const next=this.queue.then(action);this.queue=next.catch(()=>{});return next;}
 async persist(records){await mkdir(this.directory,{recursive:true,mode:0o700});const temp=path.join(this.directory,'credentials.pending.json');await writeFile(temp,JSON.stringify({format:'shixu-encrypted-credentials',version:1,records}),{encoding:'utf8',mode:0o600,flush:true});await rename(temp,this.file);}
 put(endpoint,key){return this.mutate(async()=>{
  if(typeof key!=='string'||!key.trim()||key.length>2000||/[\r\n\0]/.test(key))throw Error('API Key 为空或格式不正确。');
  const normalized=normalizeEndpoint(endpoint);const ciphertext=await this.codec.transform('protect',key.trim(),normalized);
  const records=(await this.records()).filter(r=>r.endpoint!==normalized);records.push({endpoint:normalized,ciphertext,protection:this.codec.name});await this.persist(records);return {saved:true};
 });}
 async get(endpoint){const normalized=normalizeEndpoint(endpoint);const record=(await this.records()).find(r=>r.endpoint===normalized);if(!record)throw Error('当前服务没有已保存的密钥，请先填写并保存。');return this.codec.transform('unprotect',record.ciphertext,normalized);}
 remove(endpoint){return this.mutate(async()=>{const normalized=normalizeEndpoint(endpoint);const records=await this.records();const remaining=records.filter(r=>r.endpoint!==normalized);if(remaining.length!==records.length)await this.persist(remaining);return {saved:false};});}
}
