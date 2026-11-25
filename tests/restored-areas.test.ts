import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Archive} from '../src/storage';
import {AreaHistory,TextRange} from '../src/area-history';
import {historyReviewAreas} from '../src/review-areas';

async function fixture(text:string){const a=new Archive(path.resolve('tests/.runtime',`restored-areas-${randomUUID()}`));await a.init();await a.save('note.md',text);return a;}
async function restore(a:Archive,range:TextRange,text:string){
  const preceding=await a.save('note.md',a.get('note.md')!.content,'before-restore-area'),before=preceding.content;
  const existing=preceding.areaAnchors?.find(area=>area.from===range.from&&area.to===range.to);
  return a.save('note.md',before.slice(0,range.from)+text+before.slice(range.to),'restore-area',{areaRestore:{id:existing?.id??randomUUID(),before:range,after:{from:range.from,to:range.from+text.length},beforeRevisionId:preceding.id,previousText:before.slice(range.from,range.to)}});
}
async function texts(a:Archive,range:TextRange&{id?:string}){const h=new AreaHistory(a,'note.md',a.get('note.md')!.content,range,undefined,range.id);for(let i=0;i<40&&h.hasOlder;i++)await h.older();assert.ok(h.finished);return h.entries.map(e=>e.text);}

test('restoring original wording retains every version and its hover area across restart',async()=>{
  const a=await fixture('Original.');await a.save('note.md','Middle.');await a.save('note.md','Latest.');
  const restored=await restore(a,{from:0,to:7},'Original.');
  assert.equal(restored.content,restored.baseline);const areas=historyReviewAreas(restored.baseline,restored.content,restored.areaAnchors);
  assert.equal(areas.length,1);assert.ok(areas[0].historyId);assert.equal(areas[0].removed,'Latest.');
  assert.deepEqual(await texts(a,{from:0,to:9}),['Original.','Latest.','Middle.','Original.']);
  const reopened=new Archive(a.root);await reopened.init();assert.deepEqual(reopened.get('note.md')!.areaAnchors,restored.areaAnchors);
  assert.deepEqual(await texts(reopened,{from:0,to:9}),['Original.','Latest.','Middle.','Original.']);
});

test('repeatedly choosing versions preserves newer, older and repeated values without duplicate markers',async()=>{
  const a=await fixture('Original.');await a.save('note.md','Middle.');await a.save('note.md','Latest.');
  const first=await restore(a,{from:0,to:7},'Original.');await restore(a,{from:0,to:9},'Middle.');
  const current=a.get('note.md')!;assert.equal(current.areaAnchors!.length,1);assert.equal(current.areaAnchors![0].id,first.areaAnchors![0].id);
  assert.deepEqual(await texts(a,{from:0,to:7}),['Middle.','Original.','Latest.','Middle.','Original.']);
  assert.equal((await a.list(current.docId)).length,7);
});

test('an area restored to absence can still browse its removed text without taking neighbouring paragraphs',async()=>{
  const a=await fixture('Before.\n\nAfter.');const inserted='Before.\n\nTarget new.\n\nAfter.';await a.save('note.md',inserted);
  const from=inserted.indexOf('Target');const restored=await restore(a,{from,to:from+11},'');
  const areas=historyReviewAreas(restored.baseline,restored.content,restored.areaAnchors);assert.ok(areas.some(area=>area.historyId&&area.from===area.to));
  assert.deepEqual(await texts(a,{from,to:from}),['','Target new.','']);
});

test('history markers follow safe edits before an area without changing its other versions',async()=>{
  const a=await fixture('Heading.\n\nOriginal.\n\nFooter.');const edited='Heading.\n\nLatest.\n\nFooter.';await a.save('note.md',edited);
  const from=edited.indexOf('Latest');await restore(a,{from,to:from+7},'Original.');await a.save('note.md','New prefix.\n\n'+a.get('note.md')!.content);
  const current=a.get('note.md')!,area=current.areaAnchors![0];assert.equal(current.content.slice(area.from,area.to),'Original.');
  assert.deepEqual(await texts(a,area),['Original.','Latest.','Original.']);
});

test('exact restoration boundaries retain the selected copy when paragraph text is repeated',async()=>{
  const a=await fixture('Repeated.\n\nRepeated.');await a.save('note.md','Changed.\n\nRepeated.');
  await restore(a,{from:0,to:8},'Repeated.');const current=a.get('note.md')!;
  assert.deepEqual((await texts(a,current.areaAnchors![0])).slice(0,2),['Repeated.','Changed.']);
});

test('deleting multiple restored paragraphs keeps separate histories at the same empty position',async()=>{
  const a=await fixture('First original.\n\nSecond original.');await a.save('note.md','First revised.\n\nSecond revised.');
  await restore(a,{from:0,to:14},'First original.');
  const before=a.get('note.md')!.content,from=before.indexOf('Second');await restore(a,{from,to:before.length},'Second original.');
  await a.save('note.md','');const current=a.get('note.md')!,anchors=current.areaAnchors!;
  assert.equal(anchors.length,2);assert.equal(historyReviewAreas(current.baseline,current.content,anchors).filter(area=>area.historyId).length,2);
  assert.deepEqual((await texts(a,anchors[0])).slice(0,2),['','First original.']);
  assert.deepEqual((await texts(a,anchors[1])).slice(0,2),['','Second original.']);
});

test('unrelated text inserted at an empty history marker does not become that area’s version',async()=>{
  const a=await fixture('Original.');await a.save('note.md','Changed.');await restore(a,{from:0,to:8},'');await a.save('note.md','An unrelated paragraph.');
  const anchor=a.get('note.md')!.areaAnchors![0];assert.equal(anchor.from,anchor.to);
  const versions=await texts(a,anchor);assert.ok(versions.includes('Changed.'));assert.ok(!versions.includes('An unrelated paragraph.'));
});
