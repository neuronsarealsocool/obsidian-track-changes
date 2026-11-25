import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {Archive,Revision} from '../src/storage';
import {dateStamp,revisionTime,safeName,sortRevisions} from '../src/archive-names';

test('date filenames round-trip milliseconds and sort correctly across daylight-saving offsets',()=>{
  for(const time of [0,Date.parse('2026-04-04T15:59:59.123Z'),Date.parse('2026-04-04T16:00:00.124Z'),Date.now()])assert.equal(revisionTime(dateStamp(time)+'.json.gz'),time);
  const earlier='2026-04-05_02-59-59.999_UTC+1100.json.gz',later='2026-04-05_02-00-00.001_UTC+1000.json.gz';
  assert.deepEqual(sortRevisions([earlier,later,'../private','unfinished.tmp']),[later,earlier]);
  assert.equal(revisionTime('../../anything.json.gz'),undefined);
});

test('new note folders and files have readable dates and safe note names without exposed UUIDs',async()=>{
  const a=new Archive(path.resolve('tests/.runtime',`readable-${randomUUID()}`));await a.init();
  const r=await a.save('folder/An example: note?.md','Text'),folder=path.basename(a.directory(r.docId)),files=await a.list(r.docId);
  assert.match(folder,/^\d{4}-\d{2}-\d{2}_.* - An example- note-$/);assert.ok(!folder.includes(r.docId));
  assert.equal(files.length,1);assert.match(files[0],/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.\d{3}_UTC[+-]\d{4}\.json\.gz$/);
  assert.equal((await a.load(r.docId,files[0])).id,r.id);assert.ok(!/[<>:"/\\|?*]/.test(safeName('bad:<title>?/name*. ')));
});

test('legacy migration preserves every compressed byte, document identity, and restore marker across restart',async()=>{
  const parent=path.resolve('tests/.runtime',`legacy-layout-${randomUUID()}`),vaultId='1234567890abcdef12345678',root=path.join(parent,vaultId),docId=randomUUID();
  await fs.mkdir(path.join(root,docId),{recursive:true});const records:Revision[]=[],bytes=new Map<string,Buffer>();
  for(let i=0;i<3;i++){
    const id=`${1700000000000+i}-${randomUUID()}`,r:Revision={schema:1,id,docId,time:new Date(1700000000000+i).toISOString(),path:'My note.md',aliases:['My note.md'],kind:'edit',content:`Version ${i}`,baseline:'Version 0',deleted:false,areaAnchors:[{id:'area',from:0,to:9,previousText:'Other text'}]};
    records.push(r);const data=gzipSync(JSON.stringify(r));bytes.set(id,data);await fs.writeFile(path.join(root,docId,`${id}.json.gz`),data);
  }
  const a=new Archive(root,{id:vaultId,name:'Example vault'});await a.init();assert.notEqual(a.root,root);assert.match(path.basename(a.root),/^\d{4}-\d{2}-\d{2}_.* - Example vault$/);
  assert.match(path.basename(a.directory(docId)),/ - My note$/);const names=await a.list(docId);assert.equal(names.length,3);
  for(const name of names){const r=await a.load(docId,name);assert.deepEqual(await fs.readFile(path.join(a.directory(docId),name)),bytes.get(r.id));}
  assert.equal(a.get('My note.md')!.id,records[2].id);assert.deepEqual(a.get('My note.md')!.areaAnchors,records[2].areaAnchors);
  const b=new Archive(root,{id:vaultId,name:'Example vault'});await b.init();assert.equal(b.root,a.root);assert.deepEqual(await b.list(docId),names);
  await b.save('My note.md','A future version');assert.equal((await b.list(docId)).length,4);
});

test('same-time notes with the same title remain independent and reload under their original identities',async()=>{
  const a=new Archive(path.resolve('tests/.runtime',`name-collisions-${randomUUID()}`));await a.init();
  const clock=Date.now;let first:Revision,second:Revision;
  try{Date.now=()=>1700000000000;first=await a.save('one/Same title.md','One');second=await a.save('two/Same title.md','Two');}finally{Date.now=clock;}
  assert.notEqual(a.directory(first!.docId),a.directory(second!.docId));const b=new Archive(a.root);await b.init();
  assert.equal(b.get('one/Same title.md')!.docId,first!.docId);assert.equal(b.get('two/Same title.md')!.docId,second!.docId);
});

test('readable root discovery never opens another vault’s archive',async()=>{
  const root=path.resolve('tests/.runtime',`identity-${randomUUID()}`),a=new Archive(root,{id:'vault-one',name:'One'});await a.init();await a.save('private.md','Private');
  const wrong=new Archive(a.root,{id:'vault-two',name:'Two'});await assert.rejects(wrong.init(),/different vault/);
  const b=new Archive(a.root,{id:'vault-one',name:'One'});await b.init();assert.equal(b.get('private.md')!.content,'Private');
});
