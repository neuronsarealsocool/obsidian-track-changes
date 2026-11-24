import {Change,changes} from './changes';

export interface ReviewArea extends Change {anchor:number}

/** One review decision per changed paragraph. Offsets still describe exact text,
 * including unchanged characters between nearby edits, so either choice remains
 * reversible without accepting an edit in a separate paragraph. */
export function reviewAreas(base:string,current:string,edits:Change[]=changes(base,current,true)):ReviewArea[]{
  const areas:ReviewArea[]=[];
  for(const change of edits){
    const previous=areas.at(-1);
    const boundary=current.slice(change.to).search(/\r?\n[\t ]*\r?\n/);
    const anchor=boundary<0?current.length:change.to+boundary;
    if(previous&&change.from<=previous.anchor){
      previous.to=change.to;previous.oldTo=change.oldTo;
      previous.added=current.slice(previous.from,previous.to);
      previous.removed=base.slice(previous.oldFrom,previous.oldTo);
      previous.anchor=Math.max(previous.anchor,anchor);
    }else areas.push({...change,anchor});
  }
  return areas;
}
