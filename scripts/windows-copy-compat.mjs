// This host's Node 24 fs.cpSync crashes natively with Windows Unicode paths.
// Deployment-only preload; keep the upstream Sites helpers unchanged.
import fs from 'node:fs';
import path from 'node:path';
import {syncBuiltinESMExports} from 'node:module';
if(process.platform==='win32'){
 fs.cpSync=function copyRegularTree(source,destination,options={}){
  const sourceStat=fs.lstatSync(source);
  if(sourceStat.isSymbolicLink()||(!sourceStat.isDirectory()&&!sourceStat.isFile()))throw Error('Refusing to copy a symlink or special file');
  const destinationStat=fs.existsSync(destination)?fs.lstatSync(destination):null;
  if(destinationStat?.isSymbolicLink())throw Error('Refusing a symlink destination');
  if(sourceStat.isDirectory()){
   if(!options.recursive)throw Error('Recursive option required for directories');
   fs.mkdirSync(destination,{recursive:true});
   for(const entry of fs.readdirSync(source))copyRegularTree(path.join(source,entry),path.join(destination,entry),options);
  }else{
   if(destinationStat&&options.force===false){if(options.errorOnExist)throw Error('Destination exists');return;}
   fs.copyFileSync(source,destination,options.errorOnExist?fs.constants.COPYFILE_EXCL:0);
  }
 };
 syncBuiltinESMExports();
}
