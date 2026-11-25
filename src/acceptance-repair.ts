import {acceptOne} from './changes';
import {acceptReviewArea,reviewAreas} from './review-areas';
import {Revision} from './storage';

export interface AcceptanceRepair {baseline?:string;repaired:number;reason?:string}
/** Replay only exactly identifiable insertion accepts from immutable snapshots.
 * An uncertain action aborts the repair instead of guessing at accepted text. */
export function repairAcceptedHistory(records:Revision[]):AcceptanceRepair{
  let corrected:string|undefined,repaired=0;
  for(let i=1;i<records.length;i++){
    const before=records[i-1],after=records[i];
    if(before.baseline===after.baseline)continue;
    if(after.kind==='repair-accepted-boundaries'||(after.kind==='accept'&&after.baseline===after.content)){corrected=undefined;repaired=0;continue;}
    if(after.kind!=='accept'){
      if(corrected!==undefined)return {repaired:0,reason:'A later baseline change cannot be replayed safely.'};
      continue;
    }
    const actions=reviewAreas(before.baseline,after.content).filter(area=>acceptOne(before.baseline,area)===after.baseline);
    if(actions.length!==1||actions[0].operation!=='insert'){
      if(corrected!==undefined)return {repaired:0,reason:'A later Accept action is ambiguous.'};
      continue;
    }
    const action=actions[0],fixed=acceptReviewArea(before.baseline,after.content,action);
    if(corrected===undefined){if(fixed!==after.baseline){corrected=fixed;repaired++;}continue;}
    const candidates=reviewAreas(corrected,after.content).filter(area=>area.paragraphFrom===action.paragraphFrom&&area.paragraphTo===action.paragraphTo);
    if(candidates.length>1)return {repaired:0,reason:'A replayed paragraph has more than one decision.'};
    if(candidates.length)corrected=acceptReviewArea(corrected,after.content,candidates[0]);
    if(fixed!==after.baseline)repaired++;
  }
  const latest=records.at(-1);
  return corrected!==undefined&&latest&&corrected!==latest.baseline?{baseline:corrected,repaired}:{repaired:0};
}
