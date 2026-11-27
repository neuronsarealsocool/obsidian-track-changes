import {App,FileSystemAdapter,ItemView,MarkdownView,Modal,Notice,Plugin,PluginSettingTab,Setting,TFile,WorkspaceLeaf,editorInfoField} from 'obsidian';
import {EditorView} from '@codemirror/view';
import {diffWordsWithSpace} from 'diff';
import path from 'node:path';
import os from 'node:os';
import {Archive,Revision,AreaRestore} from './storage';
import {randomUUID} from 'node:crypto';
import {Change,rejectOne} from './changes';
import {reviewExtension} from './inline-review';
import {acceptReviewArea} from './review-areas';
import {TextRange} from './area-history';
import {repairAcceptedHistory} from './acceptance-repair';
import {MobileJournalReader, mobileTime} from './mobile-journal';
import {styleDeletion} from './deletion-style';

const VIEW='track-changes-review';
// Obsidian does not await unload hooks. Share the final flush promise across
// module reloads so the next instance scans only after the old writer finishes.
const handoffKey=Symbol.for('obsidian-track-changes.archive-handoffs');
const handoffs:Map<string,Promise<unknown>>=(globalThis as any)[handoffKey]??=((new Map<string,Promise<unknown>>()));
interface Settings {archiveDirectory:string;archiveSubfolder?:string;highlights:boolean;redDeletions:boolean;saveDelayMs:number}
interface Pending {content:string;first:number;last:number}
export default class TrackChanges extends Plugin {
  settings:Settings={archiveDirectory:path.join(os.homedir(),'Obsidian Track Changes History'),highlights:true,redDeletions:false,saveDelayMs:800};
  archive!:Archive; ready=false; pending=new Map<string,Pending>();lastError='';private lastNotice=0;private stopped=false;
  private startupTimer?:number;private startup?:Promise<void>;
  private changingDirectory=false;
  private mobileReader?:MobileJournalReader;private mobileImport?:Promise<void>;
  private settingsQueue:Promise<unknown>=Promise.resolve();
  async onload(){
    this.settings={...this.settings,...await this.loadData()};
    this.settings.saveDelayMs=Math.max(200,Math.min(5000,Number(this.settings.saveDelayMs)||800));
    if(!(this.app.vault.adapter instanceof FileSystemAdapter))throw Error('Track Changes requires a desktop filesystem vault.');
    const vaultPath=this.app.vault.adapter.getBasePath();
    const folder=this.settings.archiveSubfolder;
    this.archive=new Archive(path.join(this.settings.archiveDirectory,folder&&path.basename(folder)===folder&&!['.','..'].includes(folder)?folder:Archive.vaultId(vaultPath)),{id:Archive.vaultId(vaultPath),name:path.basename(vaultPath)});
    this.registerView(VIEW,leaf=>new ReviewView(leaf,this));
    this.addSettingTab(new TrackSettings(this.app,this));
    this.addRibbonIcon('history','Track Changes: browse revision history',()=>void this.openReview());
    this.addCommand({id:'review',name:'Browse revision history',callback:()=>void this.openReview()});
    this.addCommand({id:'catch-up',name:'Catch up synced and offline history',callback:()=>void this.catchUp().catch(e=>this.report(e))});
    this.addCommand({id:'checkpoint',name:'Save a named checkpoint',editorCallback:(editor,view)=>{if(view.file)new NameModal(this.app,'Name this checkpoint',label=>this.capture(view.file!.path,editor.getValue(),'checkpoint',{label})).open();}});
    this.addCommand({id:'toggle-highlights',name:'Toggle inline revision markers',callback:()=>void this.updateSettings({highlights:!this.settings.highlights}).then(()=>{this.refreshEditors();new Notice(`Track Changes revision markers ${this.settings.highlights?'on':'off'}`);}).catch(error=>new Notice(String(error),9000))});
    this.addCommand({id:'toggle-red-deletions',name:'Toggle red for deletions',callback:()=>void this.setRedDeletions(!this.settings.redDeletions).then(()=>new Notice(`Red deletions ${this.settings.redDeletions?'on':'off'}`)).catch(error=>new Notice(String(error),9000))});
    const status=this.addStatusBarItem();status.setText('Track Changes: loading');
    // Restored sidebar leaves may still be DeferredViews during startup.
    // Let Obsidian finish its layout before scanning an existing archive.
    this.app.workspace.onLayoutReady(()=>{if(this.stopped)return;this.startupTimer=window.setTimeout(()=>{this.startupTimer=undefined;this.startup=this.startTracking(status).catch(error=>{this.ready=false;this.report(error);status.setText('Track Changes: startup error');});},0);});
  }
  private async startTracking(status:HTMLElement){
    try{await handoffs.get(this.archive.root);handoffs.delete(this.archive.root);await this.archive.init();if(this.stopped)return;if(this.settings.archiveSubfolder!==path.basename(this.archive.root))await this.updateSettings({archiveSubfolder:path.basename(this.archive.root)});this.ready=true;}catch(error){this.report(error);status.setText('Track Changes: archive error');return;}
    this.registerEvent(this.app.vault.on('modify',file=>{if(file instanceof TFile&&file.extension==='md')void this.captureDisk(file);}));
    this.registerEvent(this.app.vault.on('create',file=>{if(file instanceof TFile&&file.extension==='md')void this.captureDisk(file);}));
    this.registerEvent(this.app.workspace.on('file-open',file=>{if(file?.extension==='md')void this.captureDisk(file);this.refreshViews();}));
    this.registerEvent(this.app.vault.on('rename',(file,oldPath)=>{
      if(file instanceof TFile){if(file.extension==='md')void this.rename(file,oldPath);}
      else for(const r of [...this.archive.docs.values()])if(!r.deleted&&r.path.startsWith(`${oldPath}/`))void this.renamePath(r.path,`${file.path}${r.path.slice(oldPath.length)}`);
    }));
    this.registerEvent(this.app.vault.on('delete',file=>{
      for(const r of [...this.archive.docs.values()])if(!r.deleted&&(r.path===file.path||r.path.startsWith(`${file.path}/`)))void this.markDeleted(r.path);
    }));
    this.registerEditorExtension(this.extension());
    this.registerEvent(this.app.workspace.on('editor-change',(editor,info)=>{if(info.file)this.schedule(info.file.path,editor.getValue());}));
    this.registerInterval(window.setInterval(()=>{void this.flushDue();status.setText(this.lastError?'Track Changes: storage error':`Track Changes: ${this.pending.size?'saving…':'tracking'}`);status.setAttribute('aria-label',this.lastError||'Local history enabled; no automatic expiry');},300));
    this.registerDomEvent(window,'blur',()=>void this.flushAll());
    // Register listeners before seeding, so edits during the initial scan are captured.
    this.mobileReader=new MobileJournalReader(this.app.vault.adapter,(file,error)=>console.warn('Track Changes: pending mobile record',file,error));
    void this.catchUp().catch(e=>this.report(e));
    this.registerInterval(window.setInterval(()=>{void this.importMobile().catch(e=>this.report(e));},15000));
    this.registerDomEvent(window,'focus',()=>void this.catchUp().catch(e=>this.report(e)));
    this.refreshEditors();this.refreshViews();
  }
  report(error:unknown){console.error('Track Changes',error);this.lastError=String(error);if(Date.now()-this.lastNotice>10000){new Notice(`Track Changes could not save history: ${String(error)}. Existing history was preserved.`,12000);this.lastNotice=Date.now();}}
  async capture(notePath:string,content:string,kind='edit',options:Parameters<Archive['save']>[3]={}){
    if(!this.ready)throw Error('History archive is not ready');
    try{const prior=this.archive.get(notePath)?.baseline;const r=await this.archive.save(notePath,content,kind,options);this.lastError='';if(prior!==r.baseline)this.refreshEditors();this.refreshViews();return r;}catch(e){this.report(e);throw e;}
  }
  async captureDisk(file:TFile){
    try{const notePath=file.path,content=await this.app.vault.read(file);if(this.stopped||file.path!==notePath)return;
      // An open editor can be ahead of the on-disk save event.
      const editor=this.editorFor(notePath);const live=editor?.getValue();
      if(live!==undefined&&live!==content){this.schedule(notePath,live);return;}
      await this.capture(notePath,content);
    }catch(e){this.report(e);}
  }
  schedule(notePath:string,content:string){if(!this.ready)return;const old=this.pending.get(notePath);this.pending.set(notePath,{content,first:old?.first??Date.now(),last:Date.now()});}
  async flushPath(notePath:string){const item=this.pending.get(notePath);if(!item)return;this.pending.delete(notePath);try{await this.capture(notePath,item.content);}catch{if(!this.pending.has(notePath))this.pending.set(notePath,item);}}
  async flushDue(){const now=Date.now();for(const [p,item] of this.pending)if(now-item.last>=this.settings.saveDelayMs||now-item.first>=5000)await this.flushPath(p);}
  async flushAll(){for(const p of [...this.pending.keys()])await this.flushPath(p);await this.archive.idle();}
  private updateSettings(patch:Partial<Settings>){
    const task=this.settingsQueue.then(async()=>{const settings={...this.settings,...patch};await this.saveData(settings);this.settings=settings;});
    this.settingsQueue=task.catch(()=>{});return task;
  }
  async setRedDeletions(value:boolean){
    await this.updateSettings({redDeletions:value});this.refreshEditors();this.refreshViews();
  }
  async updateMarkerSetting(value:boolean){await this.updateSettings({highlights:value});this.refreshEditors();}
  async changeHistoryDirectory(value:string){
    const directory=value.trim().replace(/^"(.*)"$/,'$1');
    if(!path.isAbsolute(directory)||!/^([a-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/i.test(directory))throw Error('Enter a full Windows folder path, such as D:\\Backups\\Track Changes or \\\\server\\share\\History.');
    if(!this.ready||this.stopped)throw Error('Wait for the history archive to be ready.');
    if(this.changingDirectory)throw Error('A history folder change is already in progress.');
    this.changingDirectory=true;
    try{
      await this.flushAll();if(this.pending.size)throw Error('Some edits could not be saved. Fix the storage error before changing folders.');
      const target=path.join(directory,path.basename(this.archive.root));
      await this.archive.relocate(target,async()=>{
        if(this.stopped)throw Error('The plugin was unloaded. The original archive is still active.');
        await this.updateSettings({archiveDirectory:directory,archiveSubfolder:path.basename(target)});
      });
      this.refreshViews();this.refreshEditors();
    }finally{this.changingDirectory=false;}
  }
  async seed(){
    for(const file of this.app.vault.getMarkdownFiles()){
      if(this.stopped)return;
      if(!this.archive.get(file.path))await this.captureDisk(file);
      else {const content=await this.app.vault.read(file);if(this.stopped)return;if(content!==this.archive.get(file.path)?.content)await this.captureDisk(file);}
    }
    // Notes removed while Obsidian was closed remain recoverable.
    for(const r of [...this.archive.docs.values()]){if(this.stopped)return;if(!r.deleted&&!this.app.vault.getAbstractFileByPath(r.path))await this.markDeleted(r.path);}
    this.refreshEditors();
  }
  async catchUp(){await this.importMobile();if(!this.stopped)await this.seed();}
  async importMobile(){
    if(this.mobileImport)return this.mobileImport;
    if(!this.ready||this.stopped||!this.mobileReader||typeof this.app.vault.adapter.exists!=='function')return;
    this.mobileImport=(async()=>{
      const records=await this.mobileReader!.readAll();if(this.stopped)return;await this.flushAll();
      let imported=false;
      for(const record of records){
        if(this.stopped)return;if(!record.path.toLowerCase().endsWith('.md'))continue;
        let old=this.archive.get(record.path)??[...this.archive.docs.values()].find(r=>r.path===record.path);
        const source={id:record.id,deviceId:record.deviceId,capturedAt:record.capturedAt,modifiedAt:record.modifiedAt,day:record.day,basis:record.basis};
        if(!old&&record.kind==='edit')old=await this.archive.save(record.path,record.previousContent!,'mobile-baseline',{source:{...source,id:record.id+':before'},label:'Android: version before recorded edit'});
        const result=await this.archive.save(record.path,record.content,'mobile-'+record.kind,{...(old?{docId:old.docId}:{}),source,label:`Android ${new Date(mobileTime(record)).toLocaleString()} (${record.basis})`});
        if(result!==old)imported=true;
      }
      // A journal can arrive after the note. Never leave an imported old version as the active snapshot.
      if(imported&&!this.stopped){await this.seed();this.refreshViews();}
    })();
    try{await this.mobileImport;}finally{this.mobileImport=undefined;}
  }
  async renamePath(oldPath:string,newPath:string){try{await this.flushPath(oldPath);const old=this.archive.get(oldPath);if(old)await this.capture(newPath,old.content,'rename',{docId:old.docId,oldPath});}catch(e){this.report(e);}}
  async rename(file:TFile,oldPath:string){await this.renamePath(oldPath,file.path);await this.captureDisk(file);}
  async markDeleted(notePath:string){try{await this.flushPath(notePath);const old=this.archive.get(notePath);if(old)await this.capture(notePath,old.content,'delete',{docId:old.docId,deleted:true});}catch(e){this.report(e);}}
  editorFor(notePath:string){return this.app.workspace.getLeavesOfType('markdown').map(l=>l.view as MarkdownView).find(v=>v.file?.path===notePath)?.editor;}
  current(notePath:string){return this.editorFor(notePath)?.getValue()??this.pending.get(notePath)?.content??this.archive.get(notePath)?.content??'';}
  refreshViews(){for(const leaf of this.app.workspace.getLeavesOfType(VIEW)){const view=leaf.view as unknown as {requestRefresh?:()=>void};if(typeof view.requestRefresh==='function')view.requestRefresh();}}
  refreshEditors(){for(const leaf of this.app.workspace.getLeavesOfType('markdown')){const editor=(leaf.view as MarkdownView).editor as unknown as {cm?:EditorView}|undefined;editor?.cm?.dispatch({});}}
  async openReview(){let leaf=this.app.workspace.getLeavesOfType(VIEW)[0];if(!leaf){leaf=this.app.workspace.getRightLeaf(false)!;await leaf.setViewState({type:VIEW,active:true});}await this.app.workspace.revealLeaf(leaf);}
  // Allows the isolated integration harness to use Obsidian's own CM state field.
  get editorContextField(){return editorInfoField;}
  extension(){
    return reviewExtension(this);
  }
  async applyChange(notePath:string,expected:string,base:string,change:Change|undefined,accept:boolean){
    if(this.current(notePath)!==expected||this.archive.get(notePath)?.baseline!==base)throw Error('The note changed while reviewing. Refresh and try again.');
    await this.flushPath(notePath);
    if(this.current(notePath)!==expected||this.archive.get(notePath)?.baseline!==base)throw Error('The note changed while saving. Refresh and try again.');
    if(accept){await this.capture(notePath,expected,'accept',{baseline:change?acceptReviewArea(base,expected,change):expected});}
    else {
      const next=change?rejectOne(expected,change):base;
      await this.replaceSafely(notePath,expected,next,'reject');
    }
    this.refreshEditors();this.refreshViews();
  }
  async replaceSafely(notePath:string,expected:string,next:string,kind:string,areaRestore?:Omit<AreaRestore,'beforeRevisionId'>){
    const preceding=await this.capture(notePath,expected,`before-${kind}`);
    const editor=this.editorFor(notePath);
    if(editor){if(editor.getValue()!==expected)throw Error('The note changed. Nothing was replaced.');editor.setValue(next);}
    else{const file=this.app.vault.getAbstractFileByPath(notePath);if(!(file instanceof TFile))throw Error('Note no longer exists. Use Recover as copy.');await this.app.vault.process(file,current=>{if(current!==expected)throw Error('The note changed. Nothing was replaced.');return next;});}
    this.pending.delete(notePath);await this.capture(notePath,next,kind,areaRestore?{areaRestore:{...areaRestore,beforeRevisionId:preceding.id}}:{});
  }
  async restoreAreaVersion(notePath:string,expected:string,base:string,range:TextRange,text:string){
    if(this.current(notePath)!==expected||this.archive.get(notePath)?.baseline!==base)throw Error('The note changed while browsing revisions. Open its updated review box.');
    if(range.from<0||range.to<range.from||range.to>expected.length)throw Error('Invalid area boundary.');
    const next=expected.slice(0,range.from)+text+expected.slice(range.to);
    const existing=this.archive.get(notePath)?.areaAnchors?.find(area=>area.from===range.from&&area.to===range.to);
    await this.replaceSafely(notePath,expected,next,'restore-area',{id:existing?.id??randomUUID(),before:range,after:{from:range.from,to:range.from+text.length},previousText:expected.slice(range.from,range.to)});this.refreshEditors();this.refreshViews();
  }
  async repairAcceptedBoundaries(notePath:string){
    await this.flushPath(notePath);
    const latest=this.archive.get(notePath);if(!latest)return {repaired:0};
    const expected=this.current(notePath),baseline=latest.baseline,records:Revision[]=[];
    for(const name of (await this.archive.list(latest.docId)).reverse())records.push(await this.archive.load(latest.docId,name));
    const repair=repairAcceptedHistory(records);if(repair.baseline===undefined)return repair;
    if(this.current(notePath)!==expected||this.archive.get(notePath)?.baseline!==baseline)throw Error('The note changed during repair. No accepted state was replaced.');
    await this.capture(notePath,expected,'before-accept-boundary-repair');
    if(this.current(notePath)!==expected||this.archive.get(notePath)?.baseline!==baseline)throw Error('The note changed during repair. No accepted state was replaced.');
    await this.capture(notePath,expected,'repair-accepted-boundaries',{baseline:repair.baseline});
    return {repaired:repair.repaired,noteTextUnchanged:this.current(notePath)===expected};
  }
  async recoverCopy(revision:Revision){
    const basename=revision.path.split('/').pop()?.replace(/\.md$/i,'')||'Recovered note';
    const name=`${basename} (recovered ${new Date().toISOString().replace(/[:.]/g,'-')}).md`;
    const file=await this.app.vault.create(name,revision.content);await this.capture(file.path,revision.content,'recovered-copy');await this.app.workspace.getLeaf(false).openFile(file);new Notice('Recovered as a new note. Original note preserved.');
  }
  onunload(){this.stopped=true;window.clearTimeout(this.startupTimer);if(this.archive){const finished=(this.startup??Promise.resolve()).then(()=>this.flushAll()).catch(e=>this.report(e));handoffs.set(this.archive.root,finished);}}
}

function button(parent:HTMLElement,text:string,action:()=>unknown,primary=false){const b=parent.createEl('button',{text,cls:primary?'mod-cta':''});b.addEventListener('click',()=>{b.disabled=true;Promise.resolve().then(action).catch(e=>new Notice(String(e),9000)).finally(()=>b.disabled=false);});return b;}
function showDiff(parent:HTMLElement,before:string,after:string,red=false){
  const el=parent.createDiv({cls:'tc-diff'});
  const parts=before.length+after.length>400000?undefined:diffWordsWithSpace(before,after,{timeout:200});
  if(!parts){el.createEl('p',{text:'Large revision: complete text shown below. Recover as copy to compare in an editor.'});el.createEl('pre',{text:after});return;}
  for(const part of parts){const element=el.createEl(part.added?'ins':part.removed?'del':'span',{text:part.value});if(part.removed)styleDeletion(element,red);}
}
class ReviewView extends ItemView {
  private timer?:number;private disposed=false;private selectedDoc?:string;private allNotes=false;private query='';private page=0;private generation=0;
  private selectedRevision?:Revision;private selectionName?:string;
  constructor(leaf:WorkspaceLeaf,readonly plugin:TrackChanges){super(leaf);}
  getViewType(){return VIEW;}getDisplayText(){return 'Track Changes';}getIcon(){return 'history';}
  async onOpen(){this.disposed=false;await this.render();}
  async onClose(){this.disposed=true;window.clearTimeout(this.timer);this.generation++;}
  requestRefresh(){if(this.timer||this.disposed)return;this.timer=window.setTimeout(()=>{this.timer=undefined;void this.render();},900);}
  async render(){
    if(this.disposed)return;const gen=++this.generation,p=this.plugin,root=this.contentEl;
    root.empty();root.addClass('tc-review');root.classList.toggle('tc-red-deletions',p.settings.redDeletions);root.createEl('h2',{text:'Track Changes'});
    if(!p.ready){root.createEl('p',{text:'The history archive is not ready. Check plugin settings or storage permissions.'});return;}
    root.createEl('p',{text:p.lastError?`Storage error: ${p.lastError}`:'Local history · no automatic expiry',cls:p.lastError?'tc-error':'tc-caption'});
    const tools=root.createDiv({cls:'tc-tools'});
    button(tools,this.allNotes?'Current note':'Browse all notes',()=>{this.allNotes=!this.allNotes;this.page=0;this.selectedRevision=undefined;void this.render();});
    button(tools,'Refresh',async()=>{await p.flushAll();await this.render();});
    if(this.allNotes){
      const input=root.createEl('input',{type:'search',placeholder:'Find a note, including deleted notes…',value:this.query});
      input.addEventListener('input',()=>{this.query=input.value;this.renderNoteList(list);});
      const list=root.createDiv({cls:'tc-note-list'});this.renderNoteList(list);
    }else this.selectedDoc=p.archive.get(p.app.workspace.getActiveFile()?.path??'')?.docId;
    const doc=this.selectedDoc?p.archive.docs.get(this.selectedDoc):undefined;
    if(!doc){root.createEl('p',{text:'Open a Markdown note, or browse all notes to recover a deleted document.'});return;}
    root.createEl('h3',{text:doc.path+(doc.deleted?' (deleted)':'')});
    if(!doc.deleted){
      const actions=root.createDiv({cls:'tc-tools'});
      button(actions,'Checkpoint',()=>new NameModal(p.app,'Name this checkpoint',label=>p.capture(doc.path,p.current(doc.path),'checkpoint',{label})).open());
    }
    root.createEl('h3',{text:'Revision history'});
    const names=await p.archive.list(doc.docId);if(gen!==this.generation||this.disposed)return;
    this.page=Math.min(this.page,Math.max(0,Math.ceil(names.length/30)-1));
    root.createEl('p',{text:`${names.length} saved revisions · page ${this.page+1} of ${Math.max(1,Math.ceil(names.length/30))}`,cls:'tc-caption'});
    const nav=root.createDiv({cls:'tc-tools'});
    button(nav,'Newer',()=>{this.page=Math.max(0,this.page-1);void this.render();}).disabled=this.page===0;
    button(nav,'Older',()=>{this.page++;void this.render();}).disabled=(this.page+1)*30>=names.length;
    const history=root.createDiv({cls:'tc-history'}),preview=root.createDiv();
    const entries=await Promise.all(names.slice(this.page*30,this.page*30+30).map(async name=>({name,r:await p.archive.load(doc.docId,name)})));
    if(gen!==this.generation||this.disposed)return;
    for(const {name,r} of entries){button(history,`${new Date(r.time).toLocaleString()} · ${r.label||r.kind}`,async()=>{this.selectedRevision=r;this.selectionName=name;await this.preview(preview,r,name,names);});}
    if(this.selectedRevision?.docId===doc.docId&&this.selectionName)await this.preview(preview,this.selectedRevision,this.selectionName,names);
  }
  renderNoteList(list:HTMLElement){list.empty();const docs=[...this.plugin.archive.docs.values()].filter(r=>r.path.toLowerCase().includes(this.query.toLowerCase())).sort((a,b)=>a.path.localeCompare(b.path));
    for(const r of docs.slice(0,100))button(list,r.path+(r.deleted?' · deleted':''),()=>{this.selectedDoc=r.docId;this.selectedRevision=undefined;this.page=0;void this.render();});
    if(docs.length>100)list.createEl('p',{text:'Refine your search to see more notes.'});
  }
  async preview(root:HTMLElement,r:Revision,name:string,names:string[]){
    const p=this.plugin;root.empty();root.createEl('h3',{text:r.label||`${r.kind} · ${new Date(r.time).toLocaleString()}`});
    const actions=root.createDiv({cls:'tc-tools'});
    button(actions,'Recover as copy',()=>p.recoverCopy(r),true);
    const latest=p.archive.docs.get(r.docId);
    if(latest&&!latest.deleted)button(actions,'Restore this version',()=>{
      const expected=p.current(latest.path);
      new ConfirmModal(p.app,'Restore this revision?',`The current version of ${latest.path} will be saved first. You can also recover a separate copy.`,async()=>{await p.replaceSafely(latest.path,expected,r.content,'restore');p.refreshEditors();await this.render();}).open();
    });
    const index=names.indexOf(name),previous=names[index+1]?await p.archive.load(r.docId,names[index+1]):undefined;
    if(this.selectionName!==name)return;
    root.createEl('p',{text:previous?'Changes from the preceding saved revision:':'First saved version:',cls:'tc-caption'});
    showDiff(root,previous?.content??'',r.content,p.settings.redDeletions);
  }
}
class NameModal extends Modal {
  constructor(app:App,readonly title:string,readonly done:(name:string)=>unknown){super(app);}
  onOpen(){this.contentEl.createEl('h2',{text:this.title});const input=this.contentEl.createEl('input',{type:'text',placeholder:'Before rewriting the introduction'});input.focus();button(this.contentEl,'Save checkpoint',async()=>{await this.done(input.value.trim()||'Checkpoint');this.close();new Notice('Checkpoint saved');},true);}
  onClose(){this.contentEl.empty();}
}
class ConfirmModal extends Modal {
  constructor(app:App,readonly title:string,readonly description:string,readonly done:()=>Promise<unknown>){super(app);}
  onOpen(){this.contentEl.createEl('h2',{text:this.title});this.contentEl.createEl('p',{text:this.description});const row=this.contentEl.createDiv({cls:'tc-tools'});button(row,'Cancel',()=>this.close());button(row,'Confirm',async()=>{await this.done();this.close();},true);}
  onClose(){this.contentEl.empty();}
}
class TrackSettings extends PluginSettingTab {
  constructor(app:App,readonly plugin:TrackChanges){super(app,plugin);}
  display(){const root=this.containerEl,p=this.plugin;root.empty();root.createEl('h2',{text:'Track Changes'});
    root.createEl('p',{text:'History has no age, revision-count, or size limit. It grows until storage is full. Back up this archive separately; history is not an off-device backup. Only Markdown notes are tracked, beginning when this plugin is enabled. Changes made while Obsidian is closed can only be recorded as the next observed version.'});
    new Setting(root).setName('Inline revision markers and history boxes').setDesc('Show struck-through old text and Previous / Next revisions when hovering a changed area.').addToggle(t=>t.setValue(p.settings.highlights).onChange(async value=>{try{await p.updateMarkerSetting(value);}catch(error){t.setValue(p.settings.highlights);new Notice(String(error),9000);}}));
    new Setting(root).setName('Red deletions').setDesc('Color struck-through text red. Also available as “Track Changes: Toggle red for deletions” in the command palette.').addToggle(t=>t.setValue(p.settings.redDeletions).onChange(async value=>{try{await p.setRedDeletions(value);}catch(error){t.setValue(p.settings.redDeletions);new Notice(String(error),9000);}}));
    let directory=p.settings.archiveDirectory;
    new Setting(root).setName('History folder').setDesc('Enter any writable Windows folder, for example D:\\Backups\\Track Changes or \\\\server\\share\\History. A separate subfolder is used for each vault. Saving copies and verifies existing history, then switches future saves here. The old copy is retained. No reload is needed.').addText(t=>t.setValue(directory).setPlaceholder('D:\\Backups\\Track Changes').onChange(value=>{directory=value;})).addButton(b=>b.setButtonText('Save history here').onClick(async()=>{
      b.setDisabled(true);b.setButtonText('Copying and verifying…');
      try{await p.changeHistoryDirectory(directory);new Notice('History folder updated. Existing history was copied and the old copy was retained.');this.display();}
      catch(error){new Notice(`History folder was not changed: ${String(error)}`,12000);}
      finally{b.setDisabled(false);b.setButtonText('Save history here');}
    }));
    root.createEl('p',{text:`History saved in: ${p.archive?.root??'Not initialized'}`,cls:'tc-archive-path'});
    root.createEl('p',{text:'Old text is struck through to mark changed areas; current text keeps its normal appearance. Hover an area to browse its revisions. Restoring saves the current text first. Deleted notes remain in Browse all notes. Existing comparison baselines and all archived revisions are preserved.'});
  }
}
