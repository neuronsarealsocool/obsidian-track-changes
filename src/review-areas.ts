import {diffArrays} from 'diff';
import {Change,changes} from './changes';
import {Paragraph,paragraphs} from './paragraphs';

export interface ReviewArea extends Change {anchor:number;paragraphFrom?:number;paragraphTo?:number;oldParagraphFrom?:number;oldParagraphTo?:number}
interface Pending {area:ReviewArea;kind:'body'|'separator'|'insert'|'delete';paragraph?:number}

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
  return pending.filter(p=>!removed.has(p)).map(p=>p.area).sort((a,b)=>a.from-b.from||a.oldFrom-b.oldFrom);
}
