import {Notice,editorInfoField} from 'obsidian';
import {EditorState,Range,StateEffect,StateField} from '@codemirror/state';
import {Decoration,DecorationSet,EditorView,ViewPlugin,ViewUpdate,WidgetType} from '@codemirror/view';
import {Change,changes} from './changes';
import {ReviewArea,historyReviewAreas} from './review-areas';
import type {SavedArea} from './storage';
import {AreaHistory,AreaHistorySource,areaRange,mapAreaRange,TextRange} from './area-history';
import {styleDeletion} from './deletion-style';

interface ReviewHost {
  settings:{highlights:boolean;redDeletions?:boolean};
  archive:{get:(path:string)=>{baseline:string;docId:string;content:string;areaAnchors?:SavedArea[]}|undefined;list:AreaHistorySource['list'];load:AreaHistorySource['load']};
  capture:(path:string,text:string)=>Promise<unknown>;
  schedule:(path:string,text:string)=>void;
  restoreAreaVersion:(path:string,expected:string,base:string,range:TextRange,text:string)=>Promise<void>;
}
interface InPlacePreview {path:string;base:string;original:string;index:number;range:TextRange;text:string}
type SetPreview=(view:EditorView,preview:InPlacePreview|null)=>void;
class HistoricalText extends WidgetType {
  constructor(readonly text:string,readonly current:string,readonly index:number,readonly red:boolean){super();}
  eq(other:HistoricalText){return this.text===other.text&&this.current===other.current&&this.index===other.index&&this.red===other.red;}
  toDOM(){
    const el=document.createElement('span');el.className='tc-inplace-preview';el.dataset.tcArea=String(this.index);el.contentEditable='false';
    el.setAttribute('aria-label','Temporary historical revision preview');el.setAttribute('role','note');
    const text=document.createElement('span');text.className='tc-inplace-text';el.appendChild(text);
    let offset=0;
    for(const change of changes(this.current,this.text,true)){
      text.appendChild(document.createTextNode(this.current.slice(offset,change.oldFrom)));
      if(change.removed){const removed=document.createElement('del');removed.className='tc-preview-deletion tc-deletion';styleDeletion(removed,this.red);removed.textContent=change.removed;removed.setAttribute('aria-label',`Current text removed in this preview: ${change.removed}`);text.appendChild(removed);}
      if(change.added){const added=document.createElement('ins');added.className='tc-preview-addition tc-addition';added.textContent=change.added;added.setAttribute('aria-label',`Selected revision text: ${change.added}`);text.appendChild(added);}
      offset=change.oldTo;
    }
    text.appendChild(document.createTextNode(this.current.slice(offset)));
    if(!this.text){const empty=document.createElement('span');empty.className='tc-preview-empty';empty.textContent='(Area not present in this revision)';text.appendChild(empty);}
    return el;
  }
  ignoreEvent(){return true;}
}
class DeletedText extends WidgetType {
  constructor(readonly text:string,readonly areaIndex:number,readonly red:boolean){super();}
  eq(other:DeletedText){return other.text===this.text&&other.areaIndex===this.areaIndex&&other.red===this.red;}
  toDOM(){const span=document.createElement('span');span.className='tc-deletion';styleDeletion(span,this.red);span.textContent=this.text;span.dataset.tcArea=String(this.areaIndex);span.setAttribute('aria-label',`Deleted: ${this.text}`);return span;}
}
class EmptyAreaHistory extends WidgetType {
  constructor(readonly areaIndex:number){super();}
  eq(other:EmptyAreaHistory){return other.areaIndex===this.areaIndex;}
  toDOM(){const span=document.createElement('span');span.className='tc-area-history-marker';span.textContent='↶';span.dataset.tcArea=String(this.areaIndex);span.setAttribute('aria-label','Revisions of this empty area');return span;}
}
class ReviewBox extends WidgetType {
  constructor(readonly host:ReviewHost,readonly path:string,readonly base:string,readonly text:string,readonly area:ReviewArea,readonly index:number,readonly total:number,readonly setPreview:SetPreview,readonly reopen:(view:EditorView,range:TextRange)=>void){super();}
  eq(other:ReviewBox){return this.host===other.host&&this.path===other.path&&this.base===other.base&&this.text===other.text&&this.index===other.index&&this.total===other.total;}
  toDOM(view:EditorView){
    const wrapper=document.createElement('div');wrapper.className='tc-inline-container';wrapper.contentEditable='false';wrapper.dataset.tcArea=String(this.index);
    const card=document.createElement('div');card.className='tc-inline-review';card.setAttribute('role','group');card.setAttribute('aria-label','This area’s revisions');card.dataset.changeIndex=String(this.index);card.dataset.from=String(this.area.from);wrapper.appendChild(card);
    const addButton=(label:string,action:string,run:()=>unknown,disabled:boolean,parent:HTMLElement)=>{
      const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.action=action;button.disabled=disabled;
      button.setAttribute('aria-label',action==='previous'?'Previous revision of this area':action==='next'?'Next revision of this area':`${label} this changed area`);
      button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();void run();});parent.appendChild(button);return button;
    };
    const origin=this.area.paragraphFrom===undefined&&this.area.from===this.area.to?{document:this.base,range:{from:this.area.oldFrom,to:this.area.oldTo}}:undefined;
    const history=new AreaHistory(this.host.archive,this.path,this.text,areaRange(this.text,this.area),origin,this.area.historyId);
    const section=document.createElement('div');section.className='tc-area-history';card.appendChild(section);
    const historyTitle=document.createElement('div');historyTitle.className='tc-area-history-title';historyTitle.textContent='This area’s revisions';section.appendChild(historyTitle);
    const status=document.createElement('div');status.className='tc-area-history-status';status.setAttribute('aria-live','polite');section.appendChild(status);
    const historyControls=document.createElement('div');historyControls.className='tc-inline-controls';section.appendChild(historyControls);
    const note=document.createElement('div');note.className='tc-area-history-note';section.appendChild(note);
    let loading=false;
    const current=()=>view.state.doc.toString()===this.text&&this.host.archive.get(this.path)?.baseline===this.base;
    const renderHistory=()=>{
      status.textContent=loading?'Loading earlier revisions…':history.position===0?'Current text':`Preview vs current · ${history.selected.label?`${history.selected.label} · `:''}${new Date(history.selected.time!).toLocaleString()}`;
      previous.disabled=loading||!history.hasOlder;next.disabled=loading||!history.hasNewer;
      restore.hidden=history.position===0;restore.disabled=loading||history.selected.text===history.entries[0].text;
      cancel.hidden=history.position===0;cancel.disabled=loading;
      note.textContent=!history.hasOlder?history.stopReason:'';note.hidden=!note.textContent;
      if(card.isConnected&&current())this.setPreview(view,history.position===0?null:{path:this.path,base:this.base,original:this.text,index:this.index,range:history.currentRange,text:history.selected.text});
      view.requestMeasure();
    };
    const browse=async(older:boolean)=>{
      if(loading)return;if(!current()){view.dispatch({});return;}
      loading=true;renderHistory();
      try{if(older)await history.older(()=>card.isConnected&&current());else history.newer();}
      catch(error){new Notice(`Could not load this area's revisions: ${String(error)}`,9000);}
      finally{loading=false;if(card.isConnected)renderHistory();}
    };
    const useRevision=async()=>{
      if(loading||history.position===0)return;
      if(!current()){view.dispatch({});return;}
      const enabled=Array.from(card.querySelectorAll<HTMLButtonElement>('button')).filter(b=>!b.disabled);enabled.forEach(b=>b.disabled=true);card.setAttribute('aria-busy','true');
      try{this.setPreview(view,null);const selected=history.selected.text;await this.host.restoreAreaVersion(this.path,this.text,this.base,history.currentRange,selected);view.dispatch({});this.reopen(view,{from:history.currentRange.from,to:history.currentRange.from+selected.length});}
      catch(error){new Notice(String(error),9000);}
      finally{card.removeAttribute('aria-busy');enabled.forEach(b=>b.disabled=false);}
    };
    const previous=addButton('← Previous revision','previous',()=>browse(true),false,historyControls);
    const next=addButton('Next revision →','next',()=>browse(false),true,historyControls);
    const restore=addButton('Use this revision','restore-area',()=>useRevision(),true,historyControls);
    const cancel=addButton('Cancel preview','cancel-preview',()=>{history.position=0;renderHistory();},false,historyControls);
    renderHistory();
    return wrapper;
  }
  // Keep buttons keyboard-accessible while preventing editor selection on clicks.
  ignoreEvent(){return true;}
  get estimatedHeight(){return 88;}
}

interface AreaChange extends Change {areaIndex:number}
interface ReviewState {decorations:DecorationSet;text:string;base?:string;path?:string;enabled:boolean;red:boolean;saved?:SavedArea[];hovered:number|null;areas:ReviewArea[];raw:AreaChange[];preview:InPlacePreview|null}
export function reviewExtension(host:ReviewHost){
  const reveal=StateEffect.define<number|null>();
  const previewEffect=StateEffect.define<InPlacePreview|null>();
  const samePreview=(a:InPlacePreview|null,b:InPlacePreview|null)=>a===b||!!a&&!!b&&a.path===b.path&&a.base===b.base&&a.original===b.original&&a.index===b.index&&a.range.from===b.range.from&&a.range.to===b.range.to&&a.text===b.text;
  const setPreview:SetPreview=(view,preview)=>{if(!samePreview(view.state.field(field).preview,preview))view.dispatch({effects:previewEffect.of(preview)});};
  const reopen=(view:EditorView,range:TextRange)=>{const index=view.state.field(field).areas.findIndex(area=>area.historyId&&area.paragraphFrom===range.from&&area.paragraphTo===range.to);if(index>=0)view.dispatch({effects:reveal.of(index)});};
  function build(state:EditorState,previous?:ReviewState,requested:number|null=null,requestedPreview:InPlacePreview|null=null):ReviewState{
    const path=state.field(editorInfoField,false)?.file?.path,record=path?host.archive.get(path):undefined,base=record?.baseline,saved=record?.areaAnchors;
    const text=state.doc.toString(),enabled=host.settings.highlights,red=!!host.settings.redDeletions;
    const unchanged=previous&&previous.text===text&&previous.base===base&&previous.path===path&&previous.enabled===enabled&&previous.red===red&&previous.saved===saved;
    const currentSaved=record&&record.content!==text?saved?.flatMap(area=>{const mapped=mapAreaRange(record.content,text,area);if(!mapped.range)return [];if(area.from===area.to)mapped.range.to=mapped.range.from;return [{...area,...mapped.range}];}):saved;
    const areas=unchanged?previous.areas:enabled&&base!==undefined&&text.length+base.length<=150000?historyReviewAreas(base,text,currentSaved):[];
    const raw=unchanged?previous.raw:areas.flatMap((area,areaIndex)=>changes(area.removed,area.added,true).map(c=>({...c,from:c.from+area.from,to:c.to+area.from,oldFrom:c.oldFrom+area.oldFrom,oldTo:c.oldTo+area.oldFrom,areaIndex})));
    const requestedArea=requested===null?undefined:previous?.areas[requested];
    const refreshedIndex=requestedArea&&previous?.text===text&&previous.base===base&&previous.path===path?areas.findIndex(area=>requestedArea.historyId?area.historyId===requestedArea.historyId:area.from===requestedArea.from&&area.to===requestedArea.to&&area.removed===requestedArea.removed):-1;
    const hovered=requested!==null&&areas[requested]&&unchanged?requested:refreshedIndex>=0?refreshedIndex:null;
    const preview=unchanged&&hovered!==null&&requestedPreview?.index===hovered&&requestedPreview.path===path&&requestedPreview.original===text&&requestedPreview.base===base&&requestedPreview.range.from>=0&&requestedPreview.range.to<=text.length&&requestedPreview.range.to>=requestedPreview.range.from?requestedPreview:null;
    if(unchanged&&previous.hovered===hovered&&samePreview(previous.preview,preview))return previous;
    const ranges:Range<Decoration>[]=[];
    if(path&&base!==undefined&&areas.length){
      areas.forEach((area,index)=>{
        if(!area.historyId||preview?.index===index)return;
        if(area.to>area.from)ranges.push(Decoration.mark({class:'tc-area-target',attributes:{'data-tc-area':String(index)}}).range(area.from,area.to));
        else if(!area.removed)ranges.push(Decoration.widget({widget:new EmptyAreaHistory(index),side:-1}).range(area.from));
      });
      for(const c of raw){
        const areaIndex=c.areaIndex;
        if(preview&&areaIndex===preview.index)continue;
        if(c.removed)ranges.push(Decoration.widget({widget:new DeletedText(c.removed,areaIndex,red),side:-1}).range(c.from));
        if(c.to>c.from)ranges.push(Decoration.mark({class:'tc-addition',attributes:{'data-tc-area':String(areaIndex)}}).range(c.from,c.to));
      }
      if(preview){
        const {from,to}=preview.range;
        const widget=new HistoricalText(preview.text,preview.original.slice(from,to),preview.index,red);
        if(from<to)ranges.push(Decoration.replace({widget,inclusive:false}).range(from,to));
        else ranges.push(Decoration.widget({widget,side:-1}).range(from));
      }
      if(hovered!==null){const area=areas[hovered],anchor=area.from<area.to?areaRange(text,area).to:area.anchor;ranges.push(Decoration.widget({widget:new ReviewBox(host,path,base,text,area,hovered,areas.length,setPreview,reopen),block:true,side:1}).range(state.doc.lineAt(anchor).to));}
    }
    return {decorations:Decoration.set(ranges,true),text,base,path,enabled,red,saved,hovered,areas,raw,preview};
  }
  const field=StateField.define<ReviewState>({create:state=>build(state),update:(value,tr)=>{
    let hovered=value.hovered,preview=value.preview;for(const effect of tr.effects){if(effect.is(reveal))hovered=effect.value;if(effect.is(previewEffect))preview=effect.value;}
    return build(tr.state,value,hovered,preview);
  },provide:f=>[EditorView.decorations.from(f,value=>value.decorations),EditorView.editorAttributes.from(f,value=>({class:value.red?'tc-red-deletions':''}))]});
  // Block widgets must be provided directly by a state field. Capture events
  // stay in a view plugin so rebuilding decorations never performs async work.
  const capture=ViewPlugin.fromClass(class {
    private hideTimer?:ReturnType<typeof setTimeout>;
    constructor(readonly view:EditorView){
      view.dom.addEventListener('pointerover',this.enter);
      view.dom.addEventListener('pointermove',this.enter);
      view.dom.addEventListener('pointerout',this.leave);
      view.dom.addEventListener('pointerleave',this.exit);
      view.dom.addEventListener('keydown',this.keydown,true);
      view.dom.addEventListener('beforeinput',this.edit,true);
      view.dom.addEventListener('paste',this.edit,true);
      view.dom.addEventListener('cut',this.edit,true);
      view.dom.addEventListener('drop',this.edit,true);
    }
    private index(target:EventTarget|null):number|null{
      const element=(target as Element|null)?.closest?.('[data-tc-area]');
      if(!element||!this.view.dom.contains(element))return null;
      const index=Number((element as HTMLElement).dataset.tcArea);return Number.isInteger(index)?index:null;
    }
    private show(index:number|null){if(this.view.state.field(field).hovered!==index)this.view.dispatch({effects:reveal.of(index)});}
    private cancel(){clearTimeout(this.hideTimer);this.hideTimer=undefined;}
    private hide(){
      if(this.hideTimer!==undefined||this.view.state.field(field).hovered===null)return;
      // Allow the pointer to cross the small gap from text to the review box.
      this.hideTimer=setTimeout(()=>{this.hideTimer=undefined;this.show(null);},250);
    }
    private enter=(event:PointerEvent)=>{const index=this.index(event.target);if(index!==null){this.cancel();this.show(index);}else this.hide();};
    private leave=(event:PointerEvent)=>{
      const current=this.view.state.field(field).hovered;
      if(current===null)return;
      if(this.index(event.relatedTarget)===current){this.cancel();return;}
      if(this.index(event.target)===current)this.hide();
    };
    private exit=()=>this.hide();
    private keydown=(event:KeyboardEvent)=>{
      const state=this.view.state.field(field);
      if(event.key==='Escape'&&state.hovered!==null){event.preventDefault();event.stopPropagation();this.cancel();this.show(null);return;}
      if(state.preview&&((event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey)||['Backspace','Delete','Enter','Tab'].includes(event.key))&&!(event.target as Element)?.closest?.('button'))this.edit(event);
    };
    private edit=(event:Event)=>{if(this.view.state.field(field).preview){event.preventDefault();event.stopPropagation();this.cancel();this.show(null);}};
    destroy(){this.cancel();this.view.dom.removeEventListener('pointerover',this.enter);this.view.dom.removeEventListener('pointermove',this.enter);this.view.dom.removeEventListener('pointerout',this.leave);this.view.dom.removeEventListener('pointerleave',this.exit);this.view.dom.removeEventListener('keydown',this.keydown,true);this.view.dom.removeEventListener('beforeinput',this.edit,true);this.view.dom.removeEventListener('paste',this.edit,true);this.view.dom.removeEventListener('cut',this.edit,true);this.view.dom.removeEventListener('drop',this.edit,true);}
    update(update:ViewUpdate){
      const file=update.state.field(editorInfoField,false)?.file;
      if(update.docChanged&&file){
        if(!host.archive.get(file.path))void host.capture(file.path,update.startState.doc.toString()).catch(()=>{});
        host.schedule(file.path,update.state.doc.toString());
      }
    }
  });
  return [field,capture];
}
