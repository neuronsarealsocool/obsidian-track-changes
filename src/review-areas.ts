import {Change,changes} from './changes';

export interface ReviewArea extends Change {anchor:number}
function paragraphEnd(text:string,position:number){
  const separators=/\r?\n[\t ]*\r?\n/g;let match:RegExpExecArray|null;
  while((match=separators.exec(text)))if(position<match.index+match[0].length)return match.index;
  return text.length;
}

/** One review decision per changed paragraph. Offsets still describe exact text,
 * including unchanged characters between nearby edits, so either choice remains
 * reversible without accepting an edit in a separate paragraph. */
export function reviewAreas(base:string,current:string,edits:Change[]=changes(base,current,true)):ReviewArea[]{
  const areas:ReviewArea[]=[];
  for(const change of edits){
    const previous=areas.at(-1);
    const anchor=Math.max(change.to,paragraphEnd(current,change.to));
    const whitespaceContinuation=previous&&!change.added.trim()&&!change.removed.trim()&&!base.slice(previous.oldTo,change.oldFrom).trim()&&!current.slice(previous.to,change.from).trim();
    const sameOldParagraph=previous&&(previous.oldTo>previous.oldFrom||!/\r?\n[\t ]*\r?\n/.test(previous.added))&&change.oldFrom<=paragraphEnd(base,Math.max(previous.oldFrom,previous.oldTo-1));
    if(previous&&(change.from<=previous.anchor||sameOldParagraph||whitespaceContinuation)){
      previous.to=change.to;previous.oldTo=change.oldTo;
      previous.added=current.slice(previous.from,previous.to);
      previous.removed=base.slice(previous.oldFrom,previous.oldTo);
      previous.anchor=Math.max(previous.anchor,whitespaceContinuation?change.to:anchor);
    }else areas.push({...change,anchor});
  }
  return areas;
}
