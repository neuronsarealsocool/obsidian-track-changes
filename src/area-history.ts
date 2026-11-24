import {changes} from './changes';
import {ReviewArea} from './review-areas';
import {Revision} from './storage';

export interface TextRange {from:number;to:number}
export interface AreaVersion {text:string;time?:string;id?:string;label?:string;kind:string}
export interface AreaHistorySource {
  get:(path:string)=>{docId:string}|undefined;
  list:(docId:string)=>Promise<string[]>;
  load:(docId:string,name:string)=>Promise<Pick<Revision,'id'|'content'|'time'|'label'|'kind'>>;
}
export function areaRange(text:string,area:ReviewArea):TextRange{
  // A deleted range has no current paragraph of its own. Keep its insertion
  // point rather than borrowing the surviving paragraph beside it.
  if(area.from===area.to)return {from:area.from,to:area.to};
  let from=0;const separators=/\r?\n[\t ]*\r?\n/g;let match:RegExpExecArray|null;
  while((match=separators.exec(text))&&match.index+match[0].length<=area.from)from=match.index+match[0].length;
  return {from,to:area.anchor};
}

/** Map this area's boundaries through one adjacent pair of full-note versions.
 * A change crossing the boundary cannot be separated safely and stops browsing. */
export function mapAreaRange(newer:string,older:string,range:TextRange):{range?:TextRange;reason?:string}{
  if(range.from<0||range.to<range.from||range.to>newer.length)throw Error('Invalid area range');
  const edits=changes(newer,older,true);
  for(const c of edits){
    const crossesStart=c.oldFrom<range.from&&c.oldTo>range.from&&newer.slice(c.oldFrom,range.from).trim()!=='';
    const crossesEnd=c.oldFrom<range.to&&c.oldTo>range.to&&newer.slice(range.to,c.oldTo).trim()!=='';
    if(crossesStart||crossesEnd)return {reason:'An earlier rewrite also changed surrounding text. Its area cannot be isolated safely.'};
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
  if(range.from===range.to){
    const restored=edits.find(c=>c.oldFrom===range.from&&c.oldTo===range.to);
    if(restored){from=restored.from;to=restored.to;}
  }
  if(from>to)return {reason:'The older area boundary is ambiguous.'};
  const currentText=newer.slice(range.from,range.to),oldText=older.slice(from,to);
  const overlaps=edits.some(c=>c.oldFrom<range.to&&c.oldTo>range.from);
  const repeated=(document:string,value:string)=>!!value&&document.indexOf(value)!==document.lastIndexOf(value);
  if(overlaps&&(repeated(newer,currentText)||repeated(older,oldText)))return {reason:'Repeated text makes this earlier area ambiguous. Use the full-note history to compare it.'};
  return {range:{from,to}};
}

/** Reads older snapshots lazily and skips saves that changed only other areas. */
export class AreaHistory {
  readonly entries:AreaVersion[];position=0;finished=false;stopReason='';
  private document:string;private range:TextRange;private names?:string[];private cursor=0;
  private readonly docId?:string;
  constructor(readonly source:AreaHistorySource,path:string,text:string,readonly currentRange:TextRange){
    this.docId=source.get(path)?.docId;this.document=text;this.range={...currentRange};
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
      if(revision.content===this.document)continue;
      const mapped=mapAreaRange(this.document,revision.content,this.range);
      if(!mapped.range){this.finished=true;this.stopReason=mapped.reason!;return this.selected;}
      this.document=revision.content;this.range=mapped.range;
      const text=revision.content.slice(this.range.from,this.range.to);
      if(text===this.entries.at(-1)!.text)continue;
      this.entries.push({text,time:revision.time,id:revision.id,label:revision.label,kind:revision.kind});this.position++;
      if(this.range.from===this.range.to){this.finished=true;this.stopReason='This area was not present in earlier saved versions.';}
      else if(this.cursor===this.names.length){this.finished=true;this.stopReason='No earlier revisions of this area.';}
      return this.selected;
    }
    this.finished=true;this.stopReason='No earlier revisions of this area.';return this.selected;
  }
}
