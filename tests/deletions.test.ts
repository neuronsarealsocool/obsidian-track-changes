import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {Archive} from '../src/storage';
import {trackDeletions} from '../src/deletions';
import {deletionReviewAreas} from '../src/review-areas';

test('deleting later-added words retains their deleted text even when current text matches the original',()=>{
  const base='An original sentence.',before='An original sentence with extra words.';
  const result=trackDeletions(base,before,base);assert.equal(result.recorded,true);assert.equal(result.marks.map(m=>m.text).join(''),' with extra words');
  assert.equal(deletionReviewAreas(base,base,undefined,result.marks).areas.length,1);
});
test('successive Backspace and Delete operations keep removed characters in reading order',()=>{
  let previous=trackDeletions('','ABC','AB');previous=trackDeletions('','AB','A',previous.marks);previous=trackDeletions('','A','',previous.marks);assert.equal(previous.marks.map(m=>m.text).join(''),'ABC');
  let forward=trackDeletions('','ABC','BC');forward=trackDeletions('','BC','C',forward.marks);forward=trackDeletions('','C','',forward.marks);assert.equal(forward.marks.map(m=>m.text).join(''),'ABC');
});
test('undoing a tracked deletion removes the restored characters from the deletion display',()=>{
  const removed=trackDeletions('','ABC','A');assert.equal(trackDeletions('','A','ABC',removed.marks).marks.length,0);
  const partial=trackDeletions('','A','AB',removed.marks);assert.equal(partial.marks[0].text,'C');assert.equal(partial.marks[0].from,2);
  const entire=trackDeletions('','ABC','');assert.equal(trackDeletions('','','A',entire.marks).marks[0].block,false);
});
test('tracked deletion positions remain valid through arbitrary typing, replacements and removals',()=>{
  let seed=17;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let n=0;n<200;n++){
    const base='Original paragraph.',initial=base+' Added text.';let text=initial,marks=trackDeletions(base,initial,initial).marks;
    for(let step=0;step<40;step++){const from=Math.floor(random()*(text.length+1)),to=from+Math.floor(random()*(text.length-from+1)),insert=random()<.5?'new text':'';const next=text.slice(0,from)+insert+text.slice(to);marks=trackDeletions(base,text,next,marks).marks;text=next;assert.ok(marks.every(m=>Number.isSafeInteger(m.from)&&m.from>=0&&m.from<=text.length));}
  }
});
test('original comparison deletions are not duplicated as newly tracked deletions',()=>{assert.deepEqual(trackDeletions('Original word.','Original word.','Original.').marks,[]);});
test('deleting a later-added paragraph retains independent revision areas',()=>{
  const marks=trackDeletions('','First.\n\nSecond.','').marks;assert.equal(marks.length,2);assert.equal(deletionReviewAreas('','',undefined,marks).areas.length,2);assert.ok(marks.every(m=>m.block));
});
test('deleted additions persist across save and restart without changing accepted text',async()=>{
  const a=new Archive(path.resolve('tests/.runtime',`deletions-${crypto.randomUUID()}`));await a.init();const base='Original.';await a.save('note.md',base);await a.save('note.md','Original. Added words.');await a.save('note.md',base);
  const b=new Archive(a.root);await b.init();assert.equal(b.get('note.md')!.baseline,base);assert.equal(b.get('note.md')!.deletions!.map(m=>m.text).join(''),' Added words.');
});
