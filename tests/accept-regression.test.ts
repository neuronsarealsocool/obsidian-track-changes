import {test} from 'node:test';
import assert from 'node:assert/strict';
import {acceptReviewArea,reviewAreas} from '../src/review-areas';
import {acceptOne} from '../src/changes';
import {repairAcceptedHistory} from '../src/acceptance-repair';
import {Revision} from '../src/storage';

test('accepting paragraphs in arbitrary order converges without phantom deletions',()=>{
  let seed=19;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const bodies=['Alpha text.','Beta text.','Gamma text.','Repeated text.','Line one\nline two.'];
  for(let n=0;n<700;n++){
    const original=Array.from({length:Math.floor(random()*5)},()=>bodies[Math.floor(random()*bodies.length)]);
    const changed=original.slice();
    for(let step=0;step<4;step++){const at=Math.floor(random()*(changed.length+1)),op=Math.floor(random()*3);if(op===0)changed.splice(at,0,'Inserted '+n+'.');else if(op===1)changed.splice(at,1);else if(at<changed.length)changed[at]='Rewritten '+n+'.';}
    let base=original.join('\n\n');const current=changed.join('\n\n'),seen=new Set<string>();
    for(let step=0;step<40&&base!==current;step++){
      assert.ok(!seen.has(base),JSON.stringify({n,original,changed,base,current,areas:reviewAreas(base,current)}));seen.add(base);
      const areas=reviewAreas(base,current);assert.ok(areas.length>0);
      const area=areas[Math.floor(random()*areas.length)];const next=acceptReviewArea(base,current,area);
      assert.notEqual(next,base,JSON.stringify({n,base,current,area}));base=next;
    }
    assert.equal(base,current,'case '+n);
  }
});
test('accepting the last new paragraph first does not concatenate it with the preceding text',()=>{
  const base='Existing paragraph.',current='Existing paragraph.\n\nFirst new paragraph.\n\nLast new paragraph.';
  const last=reviewAreas(base,current).find(a=>a.paragraphFrom===current.indexOf('Last new'))!;
  const accepted=acceptReviewArea(base,current,last);
  assert.equal(accepted,'Existing paragraph.\n\nLast new paragraph.');
  assert.ok(!reviewAreas(accepted,current).some(a=>a.removed.includes('Last new paragraph.')));
});
test('accepting an inserted word keeps it within its paragraph',()=>{
  const base='The fox sleeps.',current='The quick fox sleeps.';
  assert.equal(acceptReviewArea(base,current,reviewAreas(base,current)[0]),current);
});
function record(baseline:string,content:string,kind:string):Revision{return {schema:1,id:'test',docId:'test',time:'2026-11-25T00:00:00Z',path:'fixture.md',aliases:['fixture.md'],kind,content,baseline,deleted:false};}
test('verified historical insertion accepts can be replayed with correct boundaries',()=>{
  const base='Existing paragraph.',current='Existing paragraph.\n\nFirst new paragraph.\n\nLast new paragraph.';
  const last=reviewAreas(base,current).find(a=>a.paragraphFrom===current.indexOf('Last new'))!;
  const badFirst=acceptOne(base,last);
  const first=reviewAreas(badFirst,current).find(a=>a.paragraphFrom===current.indexOf('First new'))!;
  const badSecond=acceptOne(badFirst,first);
  const repair=repairAcceptedHistory([record(base,base,'edit'),record(badFirst,current,'accept'),record(badSecond,current,'accept'),record(badSecond,current,'edit')]);
  assert.equal(repair.baseline,current);assert.equal(repair.repaired,1);
});
test('repair refuses to replay an unknown baseline mutation',()=>{
  const base='Existing.',current='Existing.\n\nFirst new.\n\nLast new.';
  const bad=acceptOne(base,reviewAreas(base,current).at(-1)!);
  const repair=repairAcceptedHistory([record(base,base,'edit'),record(bad,current,'accept'),record(bad+' unknown',current,'unknown')]);
  assert.equal(repair.baseline,undefined);assert.match(repair.reason!,/safely/);
});
test('Accept all and an already repaired baseline do not get repaired again',()=>{
  const current='One.\n\nTwo.';
  assert.equal(repairAcceptedHistory([record('One.','One.','edit'),record(current,current,'accept')]).baseline,undefined);
  assert.equal(repairAcceptedHistory([record('One.','One.','edit'),record(current,current,'repair-accepted-boundaries')]).baseline,undefined);
});
