import {changes} from './changes';
import {ReviewArea} from './review-areas';
import type {Revision,AreaTransition} from './storage';
import {paragraphs} from './paragraphs';

export interface TextRange {from:number;to:number}
export interface AreaOrigin {document:string;range:TextRange}
export interface AreaVersion {text:string;time?:string;id?:string;label?:string;kind:string}
export interface AreaHistorySource {
  get:(path:string)=>{docId:string}|undefined;
  list:(docId:string)=>Promise<string[]>;
  load:(docId:string,name:string)=>Promise<Pick<Revision,'id'|'content'|'time'|'label'|'kind'|'areaRestore'|'areaChanges'>>;
}
export function areaRange(text:string,area:ReviewArea):TextRange{
  if(area.paragraphFrom!==undefined&&area.paragraphTo!==undefined&&area.paragraphFrom>=0&&area.paragraphTo>=area.paragraphFrom&&area.paragraphTo<=text.length)return {from:area.paragraphFrom,to:area.paragraphTo};
  // A deleted range has no current paragraph of its own. Keep its insertion
  // point rather than borrowing the surviving paragraph beside it.
  if(area.from===area.to)return {from:area.from,to:area.to};
  let from=0;const separators=/\r?\n[\t ]*\r?\n/g;let match:RegExpExecArray|null;
  while((match=separators.exec(text))&&match.index+match[0].length<=area.from)from=match.index+match[0].length;
  let to=area.anchor;separators.lastIndex=0;
  while((match=separators.exec(text)))if(match.index<to&&to<=match.index+match[0].length){to=match.index;break;}
  return from<=to?{from,to}:{from:area.from,to:area.to};
}

/** Map this area's boundaries through one adjacent pair of full-note versions.
 * A change crossing the boundary cannot be separated safely and stops browsing. */
export function mapAreaRange(newer:string,older:string,range:TextRange):{range?:TextRange;reason?:string}{
  if(range.from<0||range.to<range.from||range.to>newer.length)throw Error('Invalid area range');
  const edits=changes(newer,older,true);
  for(const c of edits){
    const crossesStart=c.oldFrom<range.from&&c.oldTo>range.from&&newer.slice(c.oldFrom,range.from).trim()!=='';
    const crossesEnd=c.oldFrom<range.to&&c.oldTo>range.to&&newer.slice(range.to,c.oldTo).trim()!=='';
    if((crossesStart||crossesEnd)&&c.added.trim()!=='')return {reason:'An earlier rewrite also changed surrounding text. Its area cannot be isolated safely.'};
  }
  function position(offset:number,side:number){
    let delta=0;
    for(const c of edits){
      if(offset<c.oldFrom)break;
      if(c.oldFrom===c.oldTo&&offset===c.oldFrom)return side>0?c.to:c.from;
      if(offset<=c.oldTo){if(offset===c.oldFrom)return c.from;if(offset===c.oldTo)return c.to;return side>0?c.from:c.to;}
      delta+=(c.to-c.from)-(c.oldTo-c.oldFrom);
    }
    return offset+delta;
  }
  let from=position(range.from,1),to=position(range.to,-1);
  if(range.from<range.to){
    const startsParagraph=range.from===0||/\r?\n[\t ]*\r?\n$/.test(newer.slice(0,range.from));
    const endsParagraph=range.to===newer.length||/^\r?\n[\t ]*\r?\n/.test(newer.slice(range.to));
    if(startsParagraph&&endsParagraph&&from<to){
      // Token diffs may anchor an inserted line to a neighboring newline.
      // Follow the complete historical paragraph, bounded by blank separators.
      let start=0,end=older.length,match:RegExpExecArray|null;const separators=/\r?\n[\t ]*\r?\n/g;
      while((match=separators.exec(older))){
        const after=match.index+match[0].length;
        if(after<=from)start=after;
        if(match.index>=to||(match.index<to&&to<=after)){end=match.index;break;}
      }
      from=start;to=end;
    }
  }
  if(range.from===range.to){
    const restored=edits.find(c=>c.oldFrom===range.from&&c.oldTo===range.to);
    if(restored){from=restored.from;to=restored.to;}
  }
  if(from>to)return {reason:'The older area boundary is ambiguous.'};
  const currentText=newer.slice(range.from,range.to),oldText=older.slice(from,to);
  if(paragraphs(currentText).filter(p=>p.body.trim()).length<=1&&range.from<range.to&&paragraphs(oldText).filter(p=>p.body.trim()).length>1)return {reason:'This earlier version split or joined the paragraph. Its text cannot be isolated safely.'};
  const overlaps=edits.some(c=>c.oldFrom<range.to&&c.oldTo>range.from);
  const repeated=(document:string,value:string)=>!!value&&document.indexOf(value)!==document.lastIndexOf(value);
  if(overlaps&&oldText&&(repeated(newer,currentText)||repeated(older,oldText)))return {reason:'Repeated text makes this earlier area ambiguous. Use the full-note history to compare it.'};
  return {range:{from,to}};
}

/** Reads older snapshots lazily and skips saves that changed only other areas. */
export class AreaHistory {
  readonly entries:AreaVersion[];position=0;finished=false;stopReason='';
  private document:string;private range:TextRange;private names?:string[];private cursor=0;
  private readonly docId?:string;
  private deletionOrigin?:AreaOrigin;
  private restored?:AreaTransition;
  constructor(readonly source:AreaHistorySource,path:string,text:string,readonly currentRange:TextRange,origin?:AreaOrigin,private areaId?:string,private deletedTextOrigin?:string){
    this.docId=source.get(path)?.docId;this.document=text;this.range={...currentRange};
    if(currentRange.from===currentRange.to&&origin)this.deletionOrigin=origin;
    this.entries=[{text:text.slice(currentRange.from,currentRange.to),kind:'current'}];
    if(!this.docId){this.finished=true;this.stopReason='No saved revisions for this area yet.';}
  }
  get selected(){return this.entries[this.position];}
  get hasNewer(){return this.position>0;}
  get hasOlder(){return this.position<this.entries.length-1||!this.finished;}
  newer(){if(this.hasNewer)this.position--;return this.selected;}
  async older(keepReading:()=>boolean=()=>true){
    if(this.position<this.entries.length-1){this.position++;return this.selected;}
    if(this.finished||!this.docId)return this.selected;
    this.names??=await this.source.list(this.docId);
    while(this.cursor<this.names.length){
      if(!keepReading())return this.selected;
      const revision=await this.source.load(this.docId,this.names[this.cursor]);this.cursor++;
      if(!keepReading())return this.selected;
      if(this.deletedTextOrigin){
        const from=revision.content.indexOf(this.deletedTextOrigin);
        if(from<0)continue;
        if(from!==revision.content.lastIndexOf(this.deletedTextOrigin)){this.finished=true;this.stopReason='Repeated text makes this deleted area ambiguous. Use full-note history to compare it.';return this.selected;}
        this.document=revision.content;this.range={from,to:from+this.deletedTextOrigin.length};this.deletedTextOrigin=undefined;
        this.entries.push({text:revision.content.slice(this.range.from,this.range.to),time:revision.time,id:revision.id,label:revision.label,kind:revision.kind});this.position++;
        return this.selected;
      }
      // Explicit restores provide exact boundaries across the saved transition,
      // even when an area was removed or restored to its original wording.
      const restoration=this.restored;
      const transition=()=>[...(revision.areaRestore?[revision.areaRestore]:[]),...(revision.areaChanges??[])].find(area=>(!this.areaId||area.id===this.areaId)&&area.after.from===this.range.from&&area.after.to===this.range.to);
      if(restoration&&revision.id!==restoration.beforeRevisionId)continue;
      if(revision.content===this.document&&!restoration){
        this.restored=transition();
        continue;
      }
      const mapped=restoration?{range:restoration.before}:mapAreaRange(this.deletionOrigin?.document??this.document,revision.content,this.deletionOrigin?.range??this.range);
      this.restored=undefined;
      if(!mapped.range){this.finished=true;this.stopReason=mapped.reason!;return this.selected;}
      if(mapped.range.to>revision.content.length){this.finished=true;this.stopReason='The saved restoration boundary is invalid. Use full-note history to compare it.';return this.selected;}
      if(this.deletionOrigin&&mapped.range.from===mapped.range.to)continue;
      this.deletionOrigin=undefined;
      this.document=revision.content;this.range=mapped.range;
      this.restored=transition();
      const text=revision.content.slice(this.range.from,this.range.to);
      if(text===this.entries.at(-1)!.text)continue;
      this.entries.push({text,time:revision.time,id:revision.id,label:revision.label,kind:revision.kind});this.position++;
      if(this.range.from===this.range.to&&!this.restored){this.finished=true;this.stopReason='This area was not present in earlier saved versions.';}
      else if(this.cursor===this.names.length){this.finished=true;this.stopReason='No earlier revisions of this area.';}
      return this.selected;
    }
    this.finished=true;this.stopReason='No earlier revisions of this area.';return this.selected;
  }
}
