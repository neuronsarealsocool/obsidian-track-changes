import {Notice,editorInfoField} from 'obsidian';
import {EditorState,Range,StateEffect,StateField} from '@codemirror/state';
import {Decoration,DecorationSet,EditorView,ViewPlugin,ViewUpdate,WidgetType} from '@codemirror/view';
import {Change,changes} from './changes';
import {ReviewArea,reviewAreas} from './review-areas';
import {AreaHistory,AreaHistorySource,areaRange,TextRange} from './area-history';

interface ReviewHost {
  settings:{highlights:boolean};
  archive:{get:(path:string)=>{baseline:string;docId:string}|undefined;list:AreaHistorySource['list'];load:AreaHistorySource['load']};
  capture:(path:string,text:string)=>Promise<unknown>;
  schedule:(path:string,text:string)=>void;
  applyChange:(path:string,expected:string,base:string,change:Change|undefined,accept:boolean)=>Promise<void>;
  restoreAreaVersion:(path:string,expected:string,base:string,range:TextRange,text:string)=>Promise<void>;
}
interface InPlacePreview {path:string;base:string;original:string;index:number;range:TextRange;text:string}
type SetPreview=(view:EditorView,preview:InPlacePreview|null)=>void;
class HistoricalText extends WidgetType {
  constructor(readonly text:string,readonly current:string,readonly index:number){super();}
  eq(other:HistoricalText){return this.text===other.text&&this.current===other.current&&this.index===other.index;}
  toDOM(){
    const el=document.createElement('span');el.className='tc-inplace-preview';el.dataset.tcArea=String(this.index);el.contentEditable='false';
    el.setAttribute('aria-label','Temporary historical revision preview');el.setAttribute('role','note');
    const text=document.createElement('span');text.className='tc-inplace-text';el.appendChild(text);
    let offset=0;
    for(const change of changes(this.current,this.text,true)){
      text.appendChild(document.createTextNode(this.current.slice(offset,change.oldFrom)));
      if(change.removed){const removed=document.createElement('del');removed.className='tc-preview-deletion tc-deletion';removed.textContent=change.removed;removed.setAttribute('aria-label',`Current text removed in this preview: ${change.removed}`);text.appendChild(removed);}
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
  constructor(readonly text:string,readonly areaIndex:number){super();}
  eq(other:DeletedText){return other.text===this.text&&other.areaIndex===this.areaIndex;}
  toDOM(){const span=document.createElement('span');span.className='tc-deletion';span.textContent=this.text;span.dataset.tcArea=String(this.areaIndex);span.setAttribute('aria-label',`Deleted: ${this.text}`);return span;}
}
function preview(text:string){const value=text.replace(/\r?\n/g,' ↵ ');return value.trim()?value.length>130?`${value.slice(0,130)}…`:value:'Whitespace';}

class ReviewBox extends WidgetType {
  constructor(readonly host:ReviewHost,readonly path:string,readonly base:string,readonly text:string,readonly area:ReviewArea,readonly index:number,readonly total:number,readonly setPreview:SetPreview){super();}
  eq(other:ReviewBox){return this.host===other.host&&this.path===other.path&&this.base===other.base&&this.text===other.text&&this.index===other.index&&this.total===other.total;}
  toDOM(view:EditorView){
    const wrapper=document.createElement('div');wrapper.className='tc-inline-container';wrapper.contentEditable='false';wrapper.dataset.tcArea=String(this.index);
    const card=document.createElement('div');card.className='tc-inline-review is-active';card.setAttribute('role','group');card.setAttribute('aria-label',`Review change ${this.index+1} of ${this.total}`);card.dataset.changeIndex=String(this.index);card.dataset.from=String(this.area.from);wrapper.appendChild(card);
    const heading=document.createElement('div');heading.className='tc-inline-header';card.appendChild(heading);
    const title=document.createElement('span');title.className='tc-inline-title';title.textContent=this.area.removed?this.area.added?'Changed text':'Deleted text':'Added text';heading.appendChild(title);
    const count=document.createElement('span');count.className='tc-inline-count';count.textContent='Pending edit';heading.appendChild(count);
    const summary=document.createElement('div');summary.className='tc-inline-preview';card.appendChild(summary);
    if(this.area.removed){const old=document.createElement('del');old.textContent=preview(this.area.removed);old.setAttribute('aria-label',`Previous text: ${this.area.removed}`);summary.appendChild(old);}
    if(this.area.added){const added=document.createElement('ins');added.textContent=preview(this.area.added);added.setAttribute('aria-label',`New text: ${this.area.added}`);summary.appendChild(added);}
    const controls=document.createElement('div');controls.className='tc-inline-controls';card.appendChild(controls);
    const addButton=(label:string,action:string,run:()=>unknown,disabled=false,parent=controls)=>{
      const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.action=action;button.disabled=disabled;
      button.setAttribute('aria-label',action==='previous'?'Previous revision of this area':action==='next'?'Next revision of this area':`${label} this changed area`);
      button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();void run();});parent.appendChild(button);return button;
    };
    const decide=async(accept:boolean)=>{
      if(card.getAttribute('aria-busy')==='true')return;
      const enabled=Array.from(card.querySelectorAll<HTMLButtonElement>('button')).filter(b=>!b.disabled);
      enabled.forEach(b=>b.disabled=true);card.setAttribute('aria-busy','true');
      try{
        if(view.state.doc.toString()!==this.text)throw Error('The note changed while reviewing. Use its updated review box.');
        this.setPreview(view,null);await this.host.applyChange(this.path,this.text,this.base,this.area,accept);
        // Also refresh disposable editors and other callers outside the workspace.
        view.dispatch({});
      }catch(error){new Notice(String(error),9000);}
      finally{card.removeAttribute('aria-busy');enabled.forEach(b=>b.disabled=false);}
    };
    const accept=addButton('Accept','accept',()=>decide(true));accept.classList.add('tc-inline-accept');
    const reject=addButton('Reject','reject',()=>decide(false));
    const origin=this.area.paragraphFrom===undefined&&this.area.from===this.area.to?{document:this.base,range:{from:this.area.oldFrom,to:this.area.oldTo}}:undefined;
    const history=new AreaHistory(this.host.archive,this.path,this.text,areaRange(this.text,this.area),origin);
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
      accept.disabled=loading||history.position>0;reject.disabled=loading||history.position>0;
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
      try{this.setPreview(view,null);await this.host.restoreAreaVersion(this.path,this.text,this.base,history.currentRange,history.selected.text);view.dispatch({});}
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
  get estimatedHeight(){return 132;}
}

interface AreaChange extends Change {areaIndex:number}
interface ReviewState {decorations:DecorationSet;text:string;base?:string;path?:string;enabled:boolean;hovered:number|null;areas:ReviewArea[];raw:AreaChange[];preview:InPlacePreview|null}
export function reviewExtension(host:ReviewHost){
  const reveal=StateEffect.define<number|null>();
  const previewEffect=StateEffect.define<InPlacePreview|null>();
  const samePreview=(a:InPlacePreview|null,b:InPlacePreview|null)=>a===b||!!a&&!!b&&a.path===b.path&&a.base===b.base&&a.original===b.original&&a.index===b.index&&a.range.from===b.range.from&&a.range.to===b.range.to&&a.text===b.text;
  const setPreview:SetPreview=(view,preview)=>{if(!samePreview(view.state.field(field).preview,preview))view.dispatch({effects:previewEffect.of(preview)});};
  function build(state:EditorState,previous?:ReviewState,requested:number|null=null,requestedPreview:InPlacePreview|null=null):ReviewState{
    const path=state.field(editorInfoField,false)?.file?.path,base=path?host.archive.get(path)?.baseline:undefined;
    const text=state.doc.toString(),enabled=host.settings.highlights;
    const unchanged=previous&&previous.text===text&&previous.base===base&&previous.path===path&&previous.enabled===enabled;
    const areas=unchanged?previous.areas:enabled&&base!==undefined&&text.length+base.length<=150000?reviewAreas(base,text):[];
    const raw=unchanged?previous.raw:areas.flatMap((area,areaIndex)=>changes(area.removed,area.added,true).map(c=>({...c,from:c.from+area.from,to:c.to+area.from,oldFrom:c.oldFrom+area.oldFrom,oldTo:c.oldTo+area.oldFrom,areaIndex})));
    const hovered=unchanged&&requested!==null&&areas[requested]?requested:null;
    const preview=unchanged&&hovered!==null&&requestedPreview?.index===hovered&&requestedPreview.path===path&&requestedPreview.original===text&&requestedPreview.base===base&&requestedPreview.range.from>=0&&requestedPreview.range.to<=text.length&&requestedPreview.range.to>=requestedPreview.range.from?requestedPreview:null;
    if(unchanged&&previous.hovered===hovered&&samePreview(previous.preview,preview))return previous;
    const ranges:Range<Decoration>[]=[];
    if(path&&base!==undefined&&areas.length){
      for(const c of raw){
        const areaIndex=c.areaIndex;
        if(preview&&areaIndex===preview.index)continue;
        if(c.removed)ranges.push(Decoration.widget({widget:new DeletedText(c.removed,areaIndex),side:-1}).range(c.from));
        if(c.to>c.from)ranges.push(Decoration.mark({class:'tc-addition',attributes:{'data-tc-area':String(areaIndex)}}).range(c.from,c.to));
      }
      if(preview){
        const {from,to}=preview.range;
        const widget=new HistoricalText(preview.text,preview.original.slice(from,to),preview.index);
        if(from<to)ranges.push(Decoration.replace({widget,inclusive:false}).range(from,to));
        else ranges.push(Decoration.widget({widget,side:-1}).range(from));
      }
      if(hovered!==null){const area=areas[hovered],anchor=area.from<area.to?areaRange(text,area).to:area.anchor;ranges.push(Decoration.widget({widget:new ReviewBox(host,path,base,text,area,hovered,areas.length,setPreview),block:true,side:1}).range(state.doc.lineAt(anchor).to));}
    }
    return {decorations:Decoration.set(ranges,true),text,base,path,enabled,hovered,areas,raw,preview};
  }
  const field=StateField.define<ReviewState>({create:state=>build(state),update:(value,tr)=>{
    let hovered=value.hovered,preview=value.preview;for(const effect of tr.effects){if(effect.is(reveal))hovered=effect.value;if(effect.is(previewEffect))preview=effect.value;}
    return build(tr.state,value,hovered,preview);
  },provide:f=>EditorView.decorations.from(f,value=>value.decorations)});
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
