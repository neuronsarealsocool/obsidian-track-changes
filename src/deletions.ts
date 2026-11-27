import {changes} from './changes';
import {paragraphs} from './paragraphs';

/** Deleted text which was added after the original comparison version. */
export interface DeletionMark {from:number;text:string;block?:boolean;originText?:string}
export function sameDeletions(a:DeletionMark[]=[],b:DeletionMark[]=[]){return JSON.stringify(a)===JSON.stringify(b);}

export function trackDeletions(base:string,before:string,after:string,previous:DeletionMark[]=[],record=true){
  if(before===after)return {marks:previous,recorded:false};
  const edits=changes(before,after),additions=record?changes(base,before).filter(c=>c.added):[];
  const absorbed=new Set<DeletionMark>(),fresh:DeletionMark[]=[];
  const blocks=paragraphs(before);
  for(const edit of edits){
    if(!edit.removed||!additions.some(c=>c.from<edit.oldTo&&c.to>edit.oldFrom))continue;
    for(const part of paragraphs(edit.removed)){
      const from=edit.oldFrom+part.from,to=edit.oldFrom+part.to;
      let cursor=from,text='';
      for(const mark of previous){if(absorbed.has(mark)||mark.from<from||mark.from>to)continue;text+=before.slice(cursor,mark.from)+mark.text;cursor=mark.from;absorbed.add(mark);}
      text+=before.slice(cursor,to);
      const block=blocks.find(p=>p.from===from&&p.bodyTo<=to&&p.body.trim());
      if(text)fresh.push({from:edit.from,text,...(block?{block:true,originText:before.slice(block.from,Math.min(block.to,to))}:{})});
    }
  }
  const mapped:DeletionMark[]=[];
  for(const mark of previous){
    if(absorbed.has(mark))continue;
    let from=mark.from,delta=0,text=mark.text,restored=false;
    for(const edit of edits){
      if(mark.from<edit.oldFrom)break;
      if(mark.from<=edit.oldTo){
        from=edit.from;
        if(edit.oldFrom===edit.oldTo&&edit.added&&mark.from===edit.oldFrom){
          if(text.startsWith(edit.added)){text=text.slice(edit.added.length);from=edit.to;restored=true;}
          else if(text.endsWith(edit.added)){text=text.slice(0,-edit.added.length);restored=true;}
        }
        delta=0;break;
      }
      delta+=(edit.to-edit.from)-(edit.oldTo-edit.oldFrom);from=mark.from+delta;
    }
    if(text)mapped.push({...mark,from,text,...(restored?{block:false}:{})});
  }
  const marks=[...mapped,...fresh].sort((a,b)=>a.from-b.from);
  return {marks,recorded:fresh.length>0};
}
