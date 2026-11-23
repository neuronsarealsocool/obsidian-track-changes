import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {Archive} from '../src/storage';
import {acceptOne,changes,rejectOne} from '../src/changes';

const fixtures=path.resolve('tests/.runtime');
async function fresh(name:string){const root=path.join(fixtures,`${name}-${crypto.randomUUID()}`);const archive=new Archive(root);await archive.init();return archive;}
test('accept and reject independent edits without altering surrounding text',()=>{
  const base='The cat sleeps.\nA quiet house.\n',current='The dog sleeps.\nA quiet house!\n';
  const edits=changes(base,current);assert.ok(edits.length>=2);
  let accepted=base;for(const edit of changes(accepted,current)){assert.equal(typeof edit.oldFrom,'number');}
  while(changes(accepted,current).length)accepted=acceptOne(accepted,changes(accepted,current)[0]);
  assert.equal(accepted,current);
  let rejected=current;while(changes(base,rejected).length)rejected=rejectOne(rejected,changes(base,rejected)[0]);
  assert.equal(rejected,base);
});
test('Unicode, CRLF, empty notes, insertions and deletions round-trip',()=>{
  for(const [base,current] of [['','hello'],['hello',''],['😸 café\r\nline','😸 cake\r\nline two'],['abc','xyz'],['same','same'],['a\nb\n','a\nnew\nb\n']]){
    const edits=changes(base,current);let accepted=base,rejected=current;
    for(const c of [...edits].reverse()){accepted=acceptOne(accepted,c);rejected=rejectOne(rejected,c);}
    assert.equal(accepted,current);assert.equal(rejected,base);
  }
});
test('randomized edit coordinates reconstruct both exact strings',()=>{
  let seed=42;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let n=0;n<500;n++){
    const base=Array.from({length:Math.floor(random()*70)},()=> 'ab cd\n😺'[Math.floor(random()*9)]??'x').join('');
    let current=base;
    for(let j=0;j<8;j++){const i=Math.floor(random()*(current.length+1));current=current.slice(0,i)+(random()>.5?'NEW':'')+current.slice(i+Math.floor(random()*4));}
    let accepted=base,rejected=current;
    for(const c of changes(base,current).reverse()){accepted=acceptOne(accepted,c);rejected=rejectOne(rejected,c);}
    assert.equal(accepted,current);assert.equal(rejected,base);
  }
});
test('large documents remain reversible through bounded whole-note fallback',()=>{
  const base='a'.repeat(210000),current='b'.repeat(210000),edit=changes(base,current)[0];assert.equal(acceptOne(base,edit),current);assert.equal(rejectOne(current,edit),base);
});
test('history, accepted baseline, checkpoints and duplicate suppression survive restart',async()=>{
  const a=await fresh('restart');const first=await a.save('note.md','Original');await a.save('note.md','Changed');await a.save('note.md','Changed');
  await a.save('note.md','Changed','accept',{baseline:'Changed'});await a.save('note.md','Changed','checkpoint',{label:'Before rewrite'});
  const names=await a.list(first.docId);assert.equal(names.length,4);
  const b=new Archive(a.root);await b.init();assert.equal(b.get('note.md')?.baseline,'Changed');
  assert.equal((await b.load(first.docId,names.at(-1)!)).content,'Original');assert.equal(b.get('note.md')?.label,'Before rewrite');
});
test('renames and deletion preserve history; recreating the same path creates a separate identity',async()=>{
  const a=await fresh('lifecycle');const first=await a.save('folder/note.md','Keep me');
  await a.save('new/name.md','Keep me','rename',{docId:first.docId});assert.equal(a.get('folder/note.md'),undefined);
  await a.save('new/name.md','Keep me','delete',{docId:first.docId,deleted:true});assert.equal(a.get('new/name.md'),undefined);
  const recreated=await a.save('new/name.md','New document');assert.notEqual(recreated.docId,first.docId);
  const b=new Archive(a.root);await b.init();assert.equal(b.docs.get(first.docId)?.deleted,true);assert.equal(b.get('new/name.md')?.content,'New document');
  assert.deepEqual(b.docs.get(first.docId)?.aliases,['folder/note.md','new/name.md']);assert.equal((await b.list(first.docId)).length,3);
});
test('concurrent snapshots serialize without losing any distinct version',async()=>{
  const a=await fresh('concurrent');await Promise.all(Array.from({length:60},(_,i)=>a.save('note.md',`Version ${i}`)));
  const doc=a.get('note.md')!;const names=await a.list(doc.docId);assert.equal(names.length,60);assert.equal(doc.content,'Version 59');
  assert.equal(new Set((await Promise.all(names.map(n=>a.load(doc.docId,n)))).map(r=>r.content)).size,60);
});
test('corrupt revisions surface an error and remain intact; unfinished temp files are ignored',async()=>{
  const a=await fresh('corrupt');const first=await a.save('note.md','Original');const latest=await a.save('note.md','Changed');
  const bad=path.join(a.root,first.docId,`${latest.id}.json.gz`);await fs.writeFile(bad,'broken archive');
  await fs.writeFile(path.join(a.root,first.docId,'unfinished.tmp'),'partial');
  const b=new Archive(a.root);await assert.rejects(b.init(),/Unreadable archive/);assert.equal(await fs.readFile(bad,'utf8'),'broken archive');assert.equal(b.docs.get(first.docId)?.content,'Original');
});
test('a failed write never discards previous revisions and later saves can succeed',async()=>{
  const a=await fresh('failure');const first=await a.save('note.md','Original');const dir=path.join(a.root,first.docId),moved=`${dir}-saved`;
  await fs.rename(dir,moved);await fs.writeFile(dir,'blocked');await assert.rejects(a.save('note.md','Not saved'));
  assert.equal(a.get('note.md')?.content,'Original');await fs.unlink(dir);await fs.rename(moved,dir);await a.save('note.md','Saved after repair');assert.equal((await a.list(first.docId)).length,2);
});
test('history reader rejects traversal and archives are isolated by vault',async()=>{
  const a=await fresh('paths');await assert.rejects(a.load('../private','x'),/Invalid revision/);
  assert.equal(Archive.vaultId('C:/Vault'),Archive.vaultId('c:/vault'));assert.notEqual(Archive.vaultId('C:/Vault'),Archive.vaultId('C:/Other'));
});
