import {Notice,editorInfoField} from 'obsidian';
import {EditorState,Range,StateEffect,StateEffectType,StateField} from '@codemirror/state';
import {Decoration,DecorationSet,EditorView,ViewPlugin,ViewUpdate,WidgetType} from '@codemirror/view';
import {Change,changes} from './changes';
import {ReviewArea,reviewAreas} from './review-areas';

interface ReviewHost {
  settings:{highlights:boolean};
  archive:{get:(path:string)=>{baseline:string}|undefined};
  capture:(path:string,text:string)=>Promise<unknown>;
  schedule:(path:string,text:string)=>void;
  applyChange:(path:string,expected:string,base:string,change:Change|undefined,accept:boolean)=>Promise<void>;
}
class DeletedText extends WidgetType {
  constructor(readonly text:string,readonly areaIndex:number){super();}
  eq(other:DeletedText){return other.text===this.text&&other.areaIndex===this.areaIndex;}
  toDOM(){const span=document.createElement('span');span.className='tc-deletion';span.textContent=this.text;span.dataset.tcArea=String(this.areaIndex);span.setAttribute('aria-label',`Deleted: ${this.text}`);return span;}
}
function preview(text:string){const value=text.replace(/\r?\n/g,' ↵ ');return value.trim()?value.length>130?`${value.slice(0,130)}…`:value:'Whitespace';}

class ReviewBox extends WidgetType {
  constructor(readonly host:ReviewHost,readonly path:string,readonly base:string,readonly text:string,readonly area:ReviewArea,readonly index:number,readonly total:number,readonly reveal:StateEffectType<number|null>){super();}
  eq(other:ReviewBox){return this.host===other.host&&this.path===other.path&&this.base===other.base&&this.text===other.text&&this.index===other.index&&this.total===other.total;}
  toDOM(view:EditorView){
    const wrapper=document.createElement('div');wrapper.className='tc-inline-container';wrapper.contentEditable='false';wrapper.dataset.tcArea=String(this.index);
    const card=document.createElement('div');card.className='tc-inline-review is-active';card.setAttribute('role','group');card.setAttribute('aria-label',`Review change ${this.index+1} of ${this.total}`);card.dataset.changeIndex=String(this.index);card.dataset.from=String(this.area.from);wrapper.appendChild(card);
    const heading=document.createElement('div');heading.className='tc-inline-header';card.appendChild(heading);
    const title=document.createElement('span');title.className='tc-inline-title';title.textContent=this.area.removed?this.area.added?'Changed text':'Deleted text':'Added text';heading.appendChild(title);
    const count=document.createElement('span');count.className='tc-inline-count';count.textContent=`${this.index+1} of ${this.total}`;heading.appendChild(count);
    const summary=document.createElement('div');summary.className='tc-inline-preview';card.appendChild(summary);
    if(this.area.removed){const old=document.createElement('del');old.textContent=preview(this.area.removed);old.setAttribute('aria-label',`Previous text: ${this.area.removed}`);summary.appendChild(old);}
    if(this.area.added){const added=document.createElement('ins');added.textContent=preview(this.area.added);added.setAttribute('aria-label',`New text: ${this.area.added}`);summary.appendChild(added);}
    const controls=document.createElement('div');controls.className='tc-inline-controls';card.appendChild(controls);
    const addButton=(label:string,action:string,run:()=>unknown,disabled=false)=>{
      const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.action=action;button.disabled=disabled;
      button.setAttribute('aria-label',action==='previous'?'Previous change':action==='next'?'Next change':`${label} this changed area`);
      button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();void run();});controls.appendChild(button);return button;
    };
    const decide=async(accept:boolean)=>{
      if(card.getAttribute('aria-busy')==='true')return;
      const enabled=Array.from(card.querySelectorAll<HTMLButtonElement>('button')).filter(b=>!b.disabled);
      enabled.forEach(b=>b.disabled=true);card.setAttribute('aria-busy','true');
      try{
        if(view.state.doc.toString()!==this.text)throw Error('The note changed while reviewing. Use its updated review box.');
        await this.host.applyChange(this.path,this.text,this.base,this.area,accept);
        // Also refresh disposable editors and other callers outside the workspace.
        view.dispatch({});
      }catch(error){new Notice(String(error),9000);}
      finally{card.removeAttribute('aria-busy');enabled.forEach(b=>b.disabled=false);}
    };
    addButton('Accept','accept',()=>decide(true)).classList.add('tc-inline-accept');
    addButton('Reject','reject',()=>decide(false));
    const navigate=(direction:number)=>{
      if(view.state.doc.toString()!==this.text||this.host.archive.get(this.path)?.baseline!==this.base){view.dispatch({});return;}
      const areas=reviewAreas(this.base,this.text),target=areas[this.index+direction];if(!target)return;
      view.dispatch({selection:{anchor:target.from},effects:[this.reveal.of(this.index+direction),EditorView.scrollIntoView(Math.min(target.anchor,view.state.doc.length),{y:'center'})]});view.focus();
    };
    addButton('← Previous','previous',()=>navigate(-1),this.index===0);
    addButton('Next →','next',()=>navigate(1),this.index===this.total-1);
    return wrapper;
  }
  // Keep buttons keyboard-accessible while preventing editor selection on clicks.
  ignoreEvent(){return true;}
  get estimatedHeight(){return 132;}
}

interface ReviewState {decorations:DecorationSet;text:string;base?:string;path?:string;enabled:boolean;hovered:number|null;areas:ReviewArea[];raw:Change[]}
export function reviewExtension(host:ReviewHost){
  const reveal=StateEffect.define<number|null>();
  function build(state:EditorState,previous?:ReviewState,requested:number|null=null):ReviewState{
    const path=state.field(editorInfoField,false)?.file?.path,base=path?host.archive.get(path)?.baseline:undefined;
    const text=state.doc.toString(),enabled=host.settings.highlights;
    const unchanged=previous&&previous.text===text&&previous.base===base&&previous.path===path&&previous.enabled===enabled;
    const raw=unchanged?previous.raw:enabled&&base!==undefined&&text.length+base.length<=150000?changes(base,text,true):[];
    const areas=unchanged?previous.areas:base!==undefined?reviewAreas(base,text,raw):[];
    const hovered=unchanged&&requested!==null&&areas[requested]?requested:null;
    if(unchanged&&previous.hovered===hovered)return previous;
    const ranges:Range<Decoration>[]=[];
    if(path&&base!==undefined&&areas.length){
      let areaIndex=0;
      for(const c of raw){
        while(areaIndex<areas.length-1&&c.from>areas[areaIndex].to)areaIndex++;
        if(c.removed)ranges.push(Decoration.widget({widget:new DeletedText(c.removed,areaIndex),side:-1}).range(c.from));
        if(c.to>c.from)ranges.push(Decoration.mark({class:'tc-addition',attributes:{'data-tc-area':String(areaIndex)}}).range(c.from,c.to));
      }
      if(hovered!==null){const area=areas[hovered];ranges.push(Decoration.widget({widget:new ReviewBox(host,path,base,text,area,hovered,areas.length,reveal),block:true,side:1}).range(state.doc.lineAt(area.anchor).to));}
    }
    return {decorations:Decoration.set(ranges,true),text,base,path,enabled,hovered,areas,raw};
  }
  const field=StateField.define<ReviewState>({create:state=>build(state),update:(value,tr)=>{
    let hovered=value.hovered;for(const effect of tr.effects)if(effect.is(reveal))hovered=effect.value;
    return build(tr.state,value,hovered);
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
      // Navigation has already moved the open box; an old box leaving the DOM
      // must not close the destination before the pointer reaches it.
      if(this.index(event.target)===current)this.hide();
    };
    private exit=()=>this.hide();
    destroy(){this.cancel();this.view.dom.removeEventListener('pointerover',this.enter);this.view.dom.removeEventListener('pointermove',this.enter);this.view.dom.removeEventListener('pointerout',this.leave);this.view.dom.removeEventListener('pointerleave',this.exit);}
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
