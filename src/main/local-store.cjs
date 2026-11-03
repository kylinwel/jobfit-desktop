const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
class LocalStore{
 constructor(directory,validate){this.directory=directory;this.validate=validate;this.file=path.join(directory,'workspace.json');this.backupDirectory=path.join(directory,'backups');fs.mkdirSync(this.backupDirectory,{recursive:true});this.broken=false;}
 read(){if(!fs.existsSync(this.file))return {data:null,revision:0};try{const current=JSON.parse(fs.readFileSync(this.file,'utf8'));if(!this.validate(current.data)||!Number.isSafeInteger(current.revision)||current.revision<1)throw Error();return current;}catch{this.broken=true;throw Error('本机数据文件无法读取，已保留原文件。请从备份恢复，或先复制数据文件夹。');}}
 write(data,revision){if(!this.validate(data))return {status:400,body:{error:'数据格式无效，原文件没有被覆盖。'}};if(this.broken)return {status:503,body:{error:'数据文件异常，已停止覆盖。请先保留原文件再恢复备份。'}};
 let current;try{current=this.read();}catch(e){return {status:503,body:{error:e.message}};}
 if(current.revision!==revision)return {status:409,body:{error:'本机有更新版本，请选择要保留的内容。',data:current.data,revision:current.revision}};
 if(current.data){const id=crypto.randomUUID();const backup={...current,id,created_at:new Date().toISOString()};this.atomic(path.join(this.backupDirectory,id+'.json'),backup);}
 const next={data,revision:revision+1,updatedAt:new Date().toISOString()};this.atomic(this.file,next);this.trim();return {status:200,body:{revision:next.revision,updatedAt:next.updatedAt}};}
 atomic(file,value){const temp=file+'.'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(temp,JSON.stringify(value),{encoding:'utf8',flag:'wx'});fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
 list(){return fs.readdirSync(this.backupDirectory).filter(n=>/^[0-9a-f-]{36}\.json$/.test(n)).flatMap(n=>{try{const file=path.join(this.backupDirectory,n),b=JSON.parse(fs.readFileSync(file,'utf8'));return this.validate(b.data)?[{id:b.id,revision:b.revision,created_at:b.created_at}]:[];}catch{return [];}}).sort((a,b)=>b.revision-a.revision);}
 backup(id){if(!/^[0-9a-f-]{36}$/.test(id))return null;try{const b=JSON.parse(fs.readFileSync(path.join(this.backupDirectory,id+'.json'),'utf8'));return this.validate(b.data)?b.data:null;}catch{return null;}}
 trim(){for(const b of this.list().slice(30))fs.unlinkSync(path.join(this.backupDirectory,b.id+'.json'));}
}
module.exports={LocalStore};
