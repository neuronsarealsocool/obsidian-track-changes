import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AreaHistory,areaRange,mapAreaRange} from '../src/area-history';
import {reviewAreas} from '../src/review-areas';

function source(texts:string[]){
  let reads=0;
  return {get:()=>({docId:'fixture'}),list:async()=>texts.map((_,i)=>String(i)),
    load:async(_id:string,name:string)=>{reads++;return {id:name,content:texts[Number(name)],time:`2026-11-${20-Number(name)}T00:00:00.000Z`,kind:'edit'};},reads:()=>reads};
}
test('area history follows earlier paragraph versions and skips unrelated note changes',async()=>{
  const current='Header changed elsewhere.\n\nThe current paragraph.\n\nFooter new.';
  const snapshots=[current,'Header changed elsewhere.\n\nThe current paragraph.\n\nFooter old.','Header old.\n\nThe middle paragraph.\n\nFooter old.','Header old.\n\nThe oldest paragraph.\n\nFooter old.'];
  const start=current.indexOf('The current'),history=new AreaHistory(source(snapshots),'note.md',current,{from:start,to:current.indexOf('\n\n',start)});
  assert.equal(history.selected.text,'The current paragraph.');
  await history.older();assert.equal(history.selected.text,'The middle paragraph.');
  await history.older();assert.equal(history.selected.text,'The oldest paragraph.');
  history.newer();assert.equal(history.selected.text,'The middle paragraph.');history.newer();assert.equal(history.selected.text,'The current paragraph.');
  assert.equal(history.hasNewer,false);
});
test('insertions before the paragraph shift offsets without changing its identity',async()=>{
  const current='New heading.\n\nPrefix.\n\nTarget new.\n\nTail.',previous='Prefix.\n\nTarget old.\n\nTail.';
  const from=current.indexOf('Target'),history=new AreaHistory(source([current,previous]),'n',current,{from,to:from+'Target new.'.length});
  await history.older();assert.equal(history.selected.text,'Target old.');
});
test('a deleted area recovers its own text without taking the adjacent paragraph',async()=>{
  const current='Keep before.\n\nKeep after.',older='Keep before.\n\nDeleted paragraph.\n\nKeep after.';
  const from=current.indexOf('Keep after'),history=new AreaHistory(source([current,older]),'n',current,{from,to:from});
  await history.older();assert.equal(history.selected.text,'Deleted paragraph.\n\n');
});
test('insertion history ends when that area did not exist',async()=>{
  const current='Intro.\n\nBrand new area.\n\nTail.',previous='Intro.\n\nTail.';
  const from=current.indexOf('Brand'),history=new AreaHistory(source([current,previous,'Unrelated older note.']),'n',current,{from,to:from+'Brand new area.'.length});
  await history.older();assert.equal(history.selected.text,'');assert.equal(history.hasOlder,false);assert.equal(history.entries.length,2);
});
test('an inseparable rewrite stops instead of treating a whole note as the area',async()=>{
  const current='One alpha.\n\nTwo beta.\n\nThree gamma.',older='A completely rewritten document.';
  const from=current.indexOf('Two'),history=new AreaHistory(source([current,older]),'n',current,{from,to:from+'Two beta.'.length});
  await history.older();assert.equal(history.position,0);assert.equal(history.hasOlder,false);assert.match(history.stopReason,/surrounding/);
});
test('a return to a former value is a separate revision, with adjacent duplicates omitted',async()=>{
  const history=new AreaHistory(source(['Value A.','Value A.','Value B.','Value A.']),'n','Value A.',{from:0,to:8});
  await history.older();assert.equal(history.selected.text,'Value B.');await history.older();assert.equal(history.selected.text,'Value A.');
  assert.equal(history.entries.length,3);
});
test('browsing is lazy and returning to an already loaded revision needs no rereads',async()=>{
  const archive=source(['Target new.','Target middle.','Target old.']),history=new AreaHistory(archive,'n','Target new.',{from:0,to:11});
  assert.equal(archive.reads(),0);await history.older();assert.equal(archive.reads(),2);history.newer();await history.older();assert.equal(archive.reads(),2);
});
test('area ranges use paragraph boundaries and preserve zero-width deletion positions',()=>{
  const base='Intro.\n\nThe old paragraph.\n\nTail.',current='Intro.\n\nThe new paragraph.\n\nTail.';
  const range=areaRange(current,reviewAreas(base,current)[0]);assert.equal(current.slice(range.from,range.to),'The new paragraph.');
  assert.deepEqual(areaRange('text',{from:2,to:2,anchor:4,oldFrom:2,oldTo:4,removed:'old',added:''}),{from:2,to:2});
});
test('malformed ranges are rejected and metadata-only snapshots do not add versions',async()=>{
  assert.throws(()=>mapAreaRange('abc','abc',{from:-1,to:1}),/Invalid/);
  const history=new AreaHistory(source(['same','same']),'n','same',{from:0,to:4});await history.older();assert.equal(history.entries.length,1);assert.equal(history.hasOlder,false);
});
test('ambiguous repeated paragraphs stop instead of borrowing another copy',()=>{
  const mapped=mapAreaRange('Same area.\n\nSame area.','Different area.\n\nSame area.',{from:0,to:10});
  assert.equal(mapped.range,undefined);assert.match(mapped.reason!,/Repeated/);
});
test('a failed snapshot read can be retried without skipping the revision',async()=>{
  let fail=true;const archive=source(['New text.','Old text.']),load=archive.load;
  archive.load=async(id,name)=>{if(fail){fail=false;throw Error('Disk unavailable');}return load(id,name);};
  const history=new AreaHistory(archive,'n','New text.',{from:0,to:9});
  await assert.rejects(history.older(),/Disk/);await history.older();assert.equal(history.selected.text,'Old text.');
});
test('dismissing a history popup cancels further lazy archive reads',async()=>{
  const archive=source(['New text.','Old text.']),history=new AreaHistory(archive,'n','New text.',{from:0,to:9});
  await history.older(()=>false);assert.equal(archive.reads(),0);assert.equal(history.position,0);
});
test('older leading and trailing lines stay inside their paragraph preview',async()=>{
  const current='Keep.\n\nTarget new.\n\nTail.',older='Keep.\n\nLeading line.\nTarget old.\nTrailing line.\n\nTail.';
  const from=current.indexOf('Target'),history=new AreaHistory(source([current,older]),'n',current,{from,to:from+'Target new.'.length});
  await history.older();assert.equal(history.selected.text,'Leading line.\nTarget old.\nTrailing line.');
});
test('separate older paragraphs at either boundary do not enter the preview',async()=>{
  const current='Target new.',older='Unrelated before.\n\nTarget old.\n\nUnrelated after.';
  const history=new AreaHistory(source([current,older]),'n',current,{from:0,to:current.length});
  await history.older();assert.equal(history.selected.text,'Target old.');
});
test('a grouped deleted continuation leaves current paragraph separators outside restoration',()=>{
  const base='The original introduction.\nAn old supporting line.\n\nAnother paragraph unchanged.';
  const current='The revised introduction.\n\nAnother paragraph unchanged.';
  const range=areaRange(current,reviewAreas(base,current)[0]);
  assert.equal(current.slice(range.from,range.to),'The revised introduction.');
  assert.equal(current.slice(range.to),'\n\nAnother paragraph unchanged.');
});
test('historical paragraph changes never include a neighbouring paragraph',async()=>{
  const current='A joined replacement.',older='First former paragraph.\n\nSecond former paragraph.';
  const history=new AreaHistory(source([current,older]),'n',current,{from:0,to:current.length});
  await history.older();assert.ok(history.position===0||!history.selected.text.includes('Second former paragraph.'));
});
test('a deleted paragraph keeps its own origin when multiple paragraphs were deleted',async()=>{
  const base='First deleted.\n\nSecond deleted.\n\nThird deleted.',area=reviewAreas(base,'')[1];
  const history=new AreaHistory(source(['',base]),'n','',areaRange('',area),{document:base,range:{from:area.oldFrom,to:area.oldTo}});
  await history.older();assert.equal(history.selected.text,'Second deleted.\n\n');
});
test('a pasted block can preview the absence of just one inserted paragraph',async()=>{
  const current='First pasted.\n\nSecond pasted.\n\nThird pasted.',area=reviewAreas('',current)[1];
  const history=new AreaHistory(source([current,'']),'n',current,areaRange(current,area));
  await history.older();assert.equal(history.selected.text,'');assert.equal(history.position,1);
});
