import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {Archive} from '../src/storage';

async function fixture(){
  const root=path.resolve('tests/.runtime',`relocate-${crypto.randomUUID()}`),a=new Archive(path.join(root,'original'));
  await a.init();return {a,destination:path.join(root,'new history (spaces)')};
}

test('relocation preserves all revisions, deleted documents and baselines across restart while retaining the old copy',async()=>{
  const {a,destination}=await fixture(),source=a.root;
  const first=await a.save('note.md','Original');await a.save('note.md','Current','accept',{baseline:'Current'});
  await a.save('note.md','Current','checkpoint',{label:'Checkpoint'});
  const deleted=await a.save('gone.md','Recover me');await a.save('gone.md','Recover me','delete',{deleted:true});
  const names=await a.list(first.docId),originalDir=a.directory(first.docId),folder=path.basename(originalDir);let committed=false;
  await a.relocate(destination,async()=>{committed=true;assert.equal(a.root,source);});
  assert.ok(committed);assert.equal(a.root,destination);assert.deepEqual(await a.list(first.docId),names);
  for(const name of names)assert.deepEqual(await fs.readFile(path.join(originalDir,name)),await fs.readFile(path.join(destination,folder,name)));
  const restarted=new Archive(destination);await restarted.init();assert.equal(restarted.get('note.md')?.baseline,'Current');
  assert.equal(restarted.docs.get(deleted.docId)?.deleted,true);assert.equal((await restarted.load(first.docId,names[0])).label,'Checkpoint');
  await a.save('note.md','Future save');assert.equal((await a.list(first.docId)).length,names.length+1);
  assert.equal((await fs.readdir(originalDir)).length,names.length);
});

test('writers queued during relocation save only in the new history folder after it is verified',async()=>{
  const {a,destination}=await fixture(),source=a.root,first=await a.save('note.md','Original'),originalDir=a.directory(first.docId);
  let release!:()=>void,entered!:()=>void;const waiting=new Promise<void>(resolve=>release=resolve),started=new Promise<void>(resolve=>entered=resolve);
  const moving=a.relocate(destination,async()=>{entered();await waiting;});await started;
  const saving=a.save('note.md','During relocation');release();await Promise.all([moving,saving]);
  assert.equal(a.get('note.md')?.content,'During relocation');assert.equal((await a.list(first.docId)).length,2);
  assert.equal((await fs.readdir(originalDir)).length,1);
});

test('conflicting destination data is preserved and leaves the original archive active',async()=>{
  const {a,destination}=await fixture(),source=a.root,r=await a.save('note.md','Original');
  const folder=path.basename(a.directory(r.docId));await fs.mkdir(path.join(destination,folder),{recursive:true});const collision=path.join(destination,folder,(await a.list(r.docId))[0]);await fs.writeFile(collision,'other history');
  let committed=false;await assert.rejects(a.relocate(destination,async()=>{committed=true;}),/different history/);
  assert.equal(committed,false);assert.equal(a.root,source);assert.equal(await fs.readFile(collision,'utf8'),'other history');
  await a.save('note.md','Still saving');assert.equal((await a.list(r.docId)).length,2);
});

test('a failed settings commit leaves the original active and the verified copy can be retried',async()=>{
  const {a,destination}=await fixture(),source=a.root;await a.save('note.md','Original');
  await assert.rejects(a.relocate(destination,async()=>{throw Error('settings failed');}),/settings failed/);assert.equal(a.root,source);
  await a.relocate(destination,async()=>{});assert.equal(a.root,destination);
});

test('nested destinations are refused and choosing the current folder is harmless',async()=>{
  const {a}=await fixture(),source=a.root;await a.save('note.md','Original');
  await assert.rejects(a.relocate(path.join(source,'child'),async()=>{}),/outside/);
  assert.equal(a.root,source);let committed=false;await a.relocate(source,async()=>{committed=true;});assert.ok(committed);assert.equal(a.root,source);
});

test('an unwritable destination leaves the current archive and settings active',async()=>{
  const {a,destination}=await fixture(),source=a.root;await a.save('note.md','Original');await fs.writeFile(destination,'blocked');
  let committed=false;await assert.rejects(a.relocate(destination,async()=>{committed=true;}));assert.equal(a.root,source);assert.equal(committed,false);
});

test('history folder changes retain preserved legacy backup files',async()=>{
  const {a,destination}=await fixture();await a.save('note.md','Original');
  await fs.mkdir(path.join(a.root,'_preserved-legacy','nested'),{recursive:true});await fs.writeFile(path.join(a.root,'_preserved-legacy','nested','old.json'),'preserved backup');
  await a.relocate(destination,async()=>{});assert.equal(await fs.readFile(path.join(destination,'_preserved-legacy','nested','old.json'),'utf8'),'preserved backup');
});
