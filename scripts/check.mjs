import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=process.cwd();
const ignored=new Set(['node_modules','dist','.git','work','outputs','coverage']);
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{if(ignored.has(entry.name)||entry.name.endsWith('.log'))return [];const name=path.join(dir,entry.name);return entry.isDirectory()?files(name):[name];});}
let checked=0;const errors=[];
for(const file of files(root)){
  const relative=path.relative(root,file).replaceAll(path.sep,'/');
  if(/(?:^|\/)(?:private|data|backups|reports|Partitions)(?:\/|$)|(?:^|\/)(?:workspace\.json|Cookies|Login Data|\.env(?:\..*)?)$/.test(relative)){errors.push('Runtime/private file in source: '+relative);continue;}
  if(/\.(?:js|mjs|cjs)$/.test(file)){
    const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8',shell:false});
    if(result.status!==0)errors.push(relative+': '+result.stderr.trim());checked++;
  }
  if(!/\.(?:js|mjs|cjs|json|html|css|md|yml|yaml|svg)$/.test(file))continue;
  const content=fs.readFileSync(file,'utf8');
  if(/[A-Z]:[\\/]Users[\\/][^\s"']+[\\/]/i.test(content))errors.push('Machine-specific user path: '+relative);
  if(/\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9]{25,})\b/.test(content))errors.push('Possible live credential: '+relative);
}
for(const required of ['LICENSE','THIRD_PARTY_NOTICES.md','README.md','package-lock.json','src/main/index.cjs','src/ui/index.html'])if(!fs.existsSync(path.join(root,required)))errors.push('Missing '+required);
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('Syntax and source publication checks passed: '+checked+' JavaScript files.');
