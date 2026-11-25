import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reviewAreas} from '../src/review-areas';
import {acceptOne,rejectOne} from '../src/changes';

test('a sentence rewrite groups character fragments into one reversible review area',()=>{
  const base='That is an old sentence with a quiet ending.',current='This is a new sentence with a bright ending.';
  const areas=reviewAreas(base,current);assert.equal(areas.length,1);
  assert.equal(acceptOne(base,areas[0]),current);assert.equal(rejectOne(current,areas[0]),base);
  assert.equal(areas[0].anchor,current.length);
});
test('separate changed paragraphs receive separate independently actionable boxes',()=>{
  const base='The first paragraph is old.\n\nKeep this paragraph unchanged.\n\nThe last paragraph is old.';
  const current='The first paragraph is new.\n\nKeep this paragraph unchanged.\n\nThe last paragraph is new.';
  const areas=reviewAreas(base,current);assert.equal(areas.length,2);
  assert.equal(areas[0].anchor,current.indexOf('\n\n'));
  assert.equal(acceptOne(base,areas[0]),'The first paragraph is new.\n\nKeep this paragraph unchanged.\n\nThe last paragraph is old.');
  assert.equal(rejectOne(current,areas[1]),'The first paragraph is new.\n\nKeep this paragraph unchanged.\n\nThe last paragraph is old.');
});
test('multiline paragraphs share a box and whitespace-only paragraph separators split areas',()=>{
  const base='First line old\nSecond line old\n \t\nLast line old',current='First line new\nSecond line new\n \t\nLast line new';
  const areas=reviewAreas(base,current);assert.equal(areas.length,2);
  let accepted=base,rejected=current;
  for(const area of areas.slice().reverse()){accepted=acceptOne(accepted,area);rejected=rejectOne(rejected,area);}
  assert.equal(accepted,current);assert.equal(rejected,base);
});
test('pure insertion, complete deletion, trailing deletion, and CRLF remain actionable',()=>{
  for(const [base,current] of [['','New paragraph'],['Deleted paragraph',''],['Text and tail','Text'],['Old\r\n\r\nOld','New\r\n\r\nNew']]){
    let accepted=base,rejected=current;const areas=reviewAreas(base,current);
    for(const area of areas.slice().reverse()){accepted=acceptOne(accepted,area);rejected=rejectOne(rejected,area);assert.ok(area.anchor>=area.to&&area.anchor<=current.length);}
    assert.equal(accepted,current);assert.equal(rejected,base);
  }
});
test('unchanged paragraphs create no review boxes',()=>{assert.deepEqual(reviewAreas('same','same'),[]);});
test('a deleted continuation line stays grouped with edits in its original paragraph',()=>{
  const base='The original introduction.\nAn old supporting line.\n\nAnother paragraph unchanged.';
  const current='The revised introduction.\n\nAnother paragraph unchanged.';
  const areas=reviewAreas(base,current);assert.equal(areas.length,1);
  assert.equal(acceptOne(base,areas[0]),current);assert.equal(rejectOne(current,areas[0]),base);
});
test('a deleted continuation does not absorb edits in the next paragraph',()=>{
  const base='The original introduction.\nAn old supporting line.\n\nAnother paragraph old.';
  const current='The revised introduction.\n\nAnother paragraph new.';
  const areas=reviewAreas(base,current);assert.equal(areas.length,2);
  assert.equal(acceptOne(base,areas[0]),'The revised introduction.\n\nAnother paragraph old.');
});
test('completely rewritten adjacent paragraphs remain independently reviewable',()=>{
  const base='One old.\n\nTwo old.\n\nThree old.';
  const current='First replacement.\n\nSecond replacement.\n\nThird replacement.';
  const areas=reviewAreas(base,current);assert.equal(areas.length,3,JSON.stringify(areas));
  assert.equal(acceptOne(base,areas[0]),'First replacement.\n\nTwo old.\n\nThree old.');
  assert.equal(rejectOne(current,areas[1]),'First replacement.\n\nTwo old.\n\nThird replacement.');
});
test('splitting one paragraph into two produces separate review areas',()=>{
  const base='Alpha beta gamma.',current='Alpha changed.\n\nBeta changed.';
  const areas=reviewAreas(base,current);assert.equal(areas.length,2,JSON.stringify(areas));
});
test('a pasted multi-paragraph insertion produces one area for each paragraph',()=>{
  const current='First inserted paragraph.\n\nSecond inserted paragraph.\n\nThird inserted paragraph.';
  const areas=reviewAreas('',current);assert.equal(areas.length,3,JSON.stringify(areas));
});
test('split paragraph decisions preserve the other current paragraph',()=>{
  const base='Alpha beta gamma.',current='Alpha changed.\n\nBeta changed.';
  const areas=reviewAreas(base,current);
  assert.equal(rejectOne(current,areas[0]),'Alpha beta gamma.\n\nBeta changed.');
  assert.equal(rejectOne(current,areas[1]),'Alpha changed.');
  assert.equal(acceptOne(base,areas[1]),'Alpha beta gamma.\n\nBeta changed.');
});
test('a deleted multi-paragraph block produces separate deletion areas',()=>{
  const base='First deleted.\n\nSecond deleted.\n\nThird deleted.';
  const areas=reviewAreas(base,'');assert.equal(areas.length,3);
  assert.equal(rejectOne('',areas[1]),'Second deleted.\n\n');
});
test('random paragraph insertions, deletions, splits, and formatting changes round-trip exactly',()=>{
  let seed=57;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const bodies=['Alpha text.','Beta text.','Gamma text.','Same repeated text.','Line one\nline two.'];
  for(let n=0;n<350;n++){
    const before=Array.from({length:1+Math.floor(random()*5)},()=>bodies[Math.floor(random()*bodies.length)]);
    const after=before.slice();
    for(let step=0;step<3;step++){const index=Math.floor(random()*(after.length+1)),op=Math.floor(random()*4);if(op===0)after.splice(index,0,'Inserted '+n+'.');else if(op===1)after.splice(index,1);else if(op===2&&index<after.length)after[index]='Rewritten '+n+'.';else after.splice(index,0,'Split first.','Split second.');}
    const base=before.join(n%3===0?'\r\n\r\n':'\n\n'),current=after.join(n%4===0?'\n \t\n':'\n\n');
    const areas=reviewAreas(base,current);let accepted=base,rejected=current;
    for(const area of areas.slice().reverse()){
      assert.ok(area.added.split(/\r?\n[\t ]*\r?\n/).filter(p=>p.trim()).length<=1,'current paragraph boundary '+n);
      assert.ok(area.removed.split(/\r?\n[\t ]*\r?\n/).filter(p=>p.trim()).length<=1,'accepted paragraph boundary '+n);
      accepted=acceptOne(accepted,area);rejected=rejectOne(rejected,area);
    }
    assert.equal(accepted,current,'accept '+n);assert.equal(rejected,base,'reject '+n);
  }
});
