import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{assetPath,trustedSender,externalUrl}=require('../src/main/routing.cjs');
test('asset routing stays inside the static UI folder',()=>{
  const root=path.resolve('src/ui');assert.equal(assetPath(root,'/'),path.join(root,'index.html'));
  for(const value of ['/../main/index.cjs','/%2e%2e/main/index.cjs','/%5c..%5csecret.json','/../ui-other/secret.json','/LICENSE','/%00file.js','/%XX'])assert.equal(assetPath(root,value),null,value);
});
test('only the actual main application frame can invoke native data access',()=>{
  const frame={url:'jobfit://app/index.html'},contents={isDestroyed:()=>false,mainFrame:frame};
  assert.equal(trustedSender({sender:contents,senderFrame:frame},contents),true);
  assert.equal(trustedSender({sender:contents,senderFrame:{url:'https://www.nowcoder.com/'}},contents),false);
  assert.equal(trustedSender({sender:{},senderFrame:frame},contents),false);
});
test('external URLs reject privileged schemes and embedded credentials',()=>{
  assert.equal(externalUrl('https://github.com/kylinwel/jobfit-desktop'),'https://github.com/kylinwel/jobfit-desktop');
  for(const value of ['file:///private','javascript:alert(1)','https://secret@example.com','jobfit://app/'])assert.equal(externalUrl(value),null);
});
