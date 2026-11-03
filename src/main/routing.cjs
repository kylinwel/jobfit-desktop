const path=require('node:path');
function assetPath(root,pathname){
  let decoded;try{decoded=decodeURIComponent(pathname);}catch{return null;}
  if(decoded.includes('\\')||decoded.includes('\0'))return null;
  const target=path.resolve(root,'.'+(decoded==='/'?'/index.html':decoded));
  if(!target.startsWith(path.resolve(root)+path.sep))return null;
  if(!/\.(html|js|css|svg|png|ico|json)$/i.test(target))return null;
  return target;
}
function trustedSender(event,contents){return Boolean(contents&&!contents.isDestroyed()&&event.sender===contents&&event.senderFrame===contents.mainFrame&&event.senderFrame.url.startsWith('jobfit://app/'));}
function externalUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
module.exports={assetPath,trustedSender,externalUrl};
