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
