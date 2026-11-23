import {diffChars} from 'diff';
export interface Change {from:number; to:number; oldFrom:number; oldTo:number; removed:string; added:string}
export function changes(base:string, current:string):Change[] {
  let oldPos=0, pos=0; const out:Change[]=[]; let pending:Change|undefined;
  // Bound diff work for very large notes; a whole-note change is still reversible.
  const parts = base.length+current.length>400000 ? null : diffChars(base,current,{timeout:150});
  if (!parts) return base===current ? [] : [{from:0,to:current.length,oldFrom:0,oldTo:base.length,removed:base,added:current}];
  for (const part of parts) {
    if (!part.added && !part.removed) {if(pending){out.push(pending);pending=undefined;} pos+=part.value.length;oldPos+=part.value.length;continue;}
    pending ??= {from:pos,to:pos,oldFrom:oldPos,oldTo:oldPos,removed:'',added:''};
    if(part.removed){pending.removed+=part.value;oldPos+=part.value.length;pending.oldTo=oldPos;}
    if(part.added){pending.added+=part.value;pos+=part.value.length;pending.to=pos;}
  }
  if(pending) out.push(pending); return out;
}
export function acceptOne(base:string, change:Change):string {return base.slice(0,change.oldFrom)+change.added+base.slice(change.oldTo);}
export function rejectOne(current:string, change:Change):string {return current.slice(0,change.from)+change.removed+current.slice(change.to);}
