import {test} from 'node:test';import assert from 'node:assert/strict';import {promises as fs} from 'node:fs';import path from 'node:path';import {Archive} from '../src/storage';
test('mobile revisions retain source dates and accepted baseline, and imports remain idempotent after restart',async()=>{
 const root=await fs.mkdtemp(path.resolve('tests/.runtime-mobile-'));try{
 let archive=new Archive(root);await archive.init();await archive.save('note.md','Accepted');await archive.save('note.md','Desktop before phone');
 const source={id:'00000000-0000-4000-8000-000000000001',deviceId:'00000000-0000-4000-8000-000000000002',capturedAt:'2026-11-24T02:00:00Z',modifiedAt:Date.parse('2026-11-24T02:00:00Z'),day:'2026-11-24',basis:'file-mtime'};
 const imported=await archive.save('note.md','Phone intermediate','mobile-edit',{source});await archive.save('note.md','Final synced text');
 assert.equal(imported.baseline,'Accepted');const before=(await archive.list(imported.docId)).length;
 archive=new Archive(root);await archive.init();await archive.save('note.md','Phone intermediate','mobile-edit',{source});
 assert.equal((await archive.list(imported.docId)).length,before);assert.equal(archive.get('note.md')!.content,'Final synced text');
 const revisions=await Promise.all((await archive.list(imported.docId)).map(name=>archive.load(imported.docId,name)));assert.equal(revisions.find(r=>r.source)?.source?.day,'2026-11-24');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
