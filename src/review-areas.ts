import {diffArrays} from 'diff';
import {Change,acceptOne,changes} from './changes';
import {Paragraph,paragraphs} from './paragraphs';
import type {SavedArea} from './storage';
import type {DeletionMark} from './deletions';

export interface ReviewArea extends Change {anchor:number;paragraphFrom?:number;paragraphTo?:number;oldParagraphFrom?:number;oldParagraphTo?:number;historyId?:string;deletedTextOrigin?:string;operation?:'body'|'separator'|'insert'|'delete'}
interface Pending {area:ReviewArea;kind:'body'|'separator'|'insert'|'delete';paragraph?:number}

/** Restored areas remain browseable even if they now match the comparison text. */
export function historyReviewAreas(base:string,current:string,saved:SavedArea[]=[]):ReviewArea[]{
  let areas=reviewAreas(base,current);
  for(const anchor of saved){
    if(anchor.from<0||anchor.to<anchor.from||anchor.to>current.length)continue;
    areas=areas.filter(area=>{
      if(area.historyId)return true;
      const range={from:area.paragraphFrom??area.from,to:area.paragraphTo??area.to};
      return !(range.from===anchor.from&&range.to===anchor.to)&&!(range.from<anchor.to&&range.to>anchor.from);
    });
    areas.push({from:anchor.from,to:anchor.to,oldFrom:0,oldTo:anchor.previousText.length,removed:anchor.previousText,added:current.slice(anchor.from,anchor.to),anchor:anchor.to,paragraphFrom:anchor.from,paragraphTo:anchor.to,historyId:anchor.id});
  }
  return areas.sort((a,b)=>a.from-b.from||a.oldFrom-b.oldFrom);
}

export function deletionReviewAreas(base:string,current:string,saved:SavedArea[]|undefined,marks:DeletionMark[]){
  const areas=historyReviewAreas(base,current,saved),blocks=paragraphs(current),tracked:{mark:DeletionMark;area:ReviewArea}[]=[];
  for(const mark of marks){
    let area=areas.find(a=>mark.block?a.from===mark.from&&a.to===mark.from&&a.removed===mark.text:a.paragraphFrom!==undefined&&a.paragraphFrom<=mark.from&&a.paragraphTo!>=mark.from);
    if(!area){
      const paragraph=mark.block?undefined:blocks.find(p=>p.from<=mark.from&&mark.from<=p.bodyTo);
      const from=paragraph?.from??mark.from,to=paragraph?.bodyTo??mark.from;
      area={from,to,oldFrom:0,oldTo:0,removed:'',added:current.slice(from,to),anchor:to,...(paragraph?{paragraphFrom:from,paragraphTo:to}:{deletedTextOrigin:mark.originText??mark.text})};
      areas.push(area);
    }
    tracked.push({mark,area});
  }
  areas.sort((a,b)=>a.from-b.from||a.oldFrom-b.oldFrom);
  return {areas,tracked:tracked.map(({mark,area})=>({mark,areaIndex:areas.indexOf(area)}))};
}

/** Align paragraphs first. Word diffs cannot cross current paragraph bodies. */
export function reviewAreas(base:string,current:string):ReviewArea[]{
  const old=paragraphs(base),now=paragraphs(current),pending:Pending[]=[];
  const currentMeta=(p:Paragraph)=>({paragraphFrom:p.from,paragraphTo:p.bodyTo});
  function paired(a:Paragraph,b:Paragraph,index:number){
    const metadata={...currentMeta(b),oldParagraphFrom:a.from,oldParagraphTo:a.bodyTo};
    for(const kind of ['body','separator'] as const){
      const before=kind==='body'?a.body:a.separator,after=kind==='body'?b.body:b.separator;
      if(before===after)continue;
      const edits=changes(before,after,true);if(!edits.length)continue;
      const first=edits[0],last=edits.at(-1)!,oldOffset=kind==='body'?a.from:a.bodyTo,offset=kind==='body'?b.from:b.bodyTo;
      const from=offset+first.from,to=offset+last.to,oldFrom=oldOffset+first.oldFrom,oldTo=oldOffset+last.oldTo;
      pending.push({kind,paragraph:index,area:{from,to,oldFrom,oldTo,removed:base.slice(oldFrom,oldTo),added:current.slice(from,to),anchor:Math.max(b.bodyTo,to),...metadata}});
    }
  }
  function inserted(b:Paragraph,point:number,index:number){pending.push({kind:'insert',paragraph:index,area:{from:b.from,to:b.to,oldFrom:point,oldTo:point,removed:'',added:b.text,anchor:b.to,...currentMeta(b)}});}
  function deleted(a:Paragraph,point:number){pending.push({kind:'delete',area:{from:point,to:point,oldFrom:a.from,oldTo:a.to,removed:a.text,added:'',anchor:point,oldParagraphFrom:a.from,oldParagraphTo:a.bodyTo}});}
  let oi=0,ni=0,oldRun:Paragraph[]=[],newRun:Paragraph[]=[],oldStart=0,newStart=0;
  function flush(){
    if(!oldRun.length&&!newRun.length)return;
    const common=Math.min(oldRun.length,newRun.length);
    let oldPoint=old[oldStart]?.from??base.length,point=now[newStart]?.from??current.length;
    for(let i=0;i<common;i++){paired(oldRun[i],newRun[i],newStart+i);oldPoint=oldRun[i].to;point=newRun[i].to;}
    for(let i=common;i<oldRun.length;i++){deleted(oldRun[i],point);oldPoint=oldRun[i].to;}
    for(let i=common;i<newRun.length;i++)inserted(newRun[i],oldPoint,newStart+i);
    oldRun=[];newRun=[];
  }
  const parts=diffArrays(old.map(p=>p.body),now.map(p=>p.body),{timeout:150})??[{removed:true,value:old.map(p=>p.body)},{added:true,value:now.map(p=>p.body)}];
  for(const part of parts){
    if(!part.added&&!part.removed){flush();for(let i=0;i<part.value.length;i++)paired(old[oi++],now[ni],ni++);}
    else{
      if(!oldRun.length&&!newRun.length){oldStart=oi;newStart=ni;}
      if(part.removed){oldRun.push(...old.slice(oi,oi+part.value.length));oi+=part.value.length;}
      if(part.added){newRun.push(...now.slice(ni,ni+part.value.length));ni+=part.value.length;}
    }
  }
  flush();
  function merge(target:ReviewArea,extra:ReviewArea){
    target.from=Math.min(target.from,extra.from);target.to=Math.max(target.to,extra.to);
    target.oldFrom=Math.min(target.oldFrom,extra.oldFrom);target.oldTo=Math.max(target.oldTo,extra.oldTo);
    target.removed=base.slice(target.oldFrom,target.oldTo);target.added=current.slice(target.from,target.to);target.anchor=Math.max(target.anchor,target.to);
  }
  const removed=new Set<Pending>();
  for(const item of pending.filter(p=>p.kind==='separator')){
    const a=item.area;
    const neighbour=pending.find(p=>p.kind==='insert'&&a.to===p.area.from&&a.oldTo===p.area.oldFrom)
      ??pending.find(p=>p.kind==='delete'&&a.to===p.area.from&&a.oldTo===p.area.oldFrom);
    const target=neighbour??pending.find(p=>p.kind==='body'&&p.paragraph===item.paragraph);
    if(target){merge(target.area,a);removed.add(item);}
  }
  return pending.filter(p=>!removed.has(p)).map(p=>({...p.area,operation:p.kind})).sort((a,b)=>a.from-b.from||a.oldFrom-b.oldFrom);
}

/** A paragraph can be accepted before an earlier insertion is accepted. Keep
 * its own boundaries even when the separator was assigned to that earlier
 * insertion in the complete diff. Never modify the current note. */
export function acceptReviewArea(base:string,current:string,change:Change):string{
  const area=change as ReviewArea;
  if(area.operation!=='insert'||!area.added.trim())return acceptOne(base,area);
  const before=base.slice(0,area.oldFrom),after=base.slice(area.oldTo);
  let added=area.added;
  const separates=(left:string,right:string)=>/\r?\n[\t ]*\r?\n/.test((left.match(/[\t \r\n]*$/)?.[0]??'')+(right.match(/^[\t \r\n]*/)?.[0]??''));
  const separator=/\r?\n[\t ]*\r?\n(?:[\t ]*\r?\n)*/;
  if(before.trim()&&!separates(before,added)){
    const prefix=current.slice(0,area.paragraphFrom??area.from).match(/\r?\n[\t ]*\r?\n(?:[\t ]*\r?\n)*$/)?.[0]??'\n\n';
    added=prefix+added;
  }
  if(after.trim()&&!separates(added,after)){
    const suffix=current.slice(area.paragraphTo??area.to).match(separator)?.[0]??'\n\n';
    added+=suffix;
  }
  return before+added+after;
}
