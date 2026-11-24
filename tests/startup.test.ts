import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import path from 'node:path';
import {buildSync} from 'esbuild';

function fixture(){
  const timers=new Map<number,()=>void>();let nextTimer=0,layoutReady=()=>{};
  const notices:string[]=[];let initialized=0,registered=0,refreshed=0,dispatched=0;
  let finishInit:()=>void=()=>{};
  const waitForInit=new Promise<void>(resolve=>{finishInit=resolve;});
  const archive={root:path.resolve('tests/.runtime/startup'),docs:new Map(),init:()=>{initialized++;return waitForInit;},idle:async()=>{},get:()=>undefined};
  const leaves:{view:unknown}[]=[{view:{getViewType:()=> 'track-changes-review'}},{view:{requestRefresh:()=>refreshed++}}];
  const markdown=[{view:{}},{view:{editor:{cm:{dispatch:()=>dispatched++}}}}];
  const status={setText:()=>{},setAttribute:()=>{}};
  class FileSystemAdapter{getBasePath(){return path.resolve('tests/.runtime/vault');}}
  class Plugin{
    app={vault:{adapter:new FileSystemAdapter(),on:()=>({}),getMarkdownFiles:()=>[]},workspace:{
      onLayoutReady:(callback:()=>void)=>{layoutReady=callback;},on:()=>({}),getLeavesOfType:(type:string)=>type==='markdown'?markdown:leaves}};
    async loadData(){return {};}
    registerView(){registered++;}addSettingTab(){}addRibbonIcon(){}addCommand(){}addStatusBarItem(){return status;}
    registerEvent(){}registerEditorExtension(){}registerInterval(){}registerDomEvent(){}
  }
  const obsidian={Plugin,FileSystemAdapter,ItemView:class{},Modal:class{},PluginSettingTab:class{},Notice:class{constructor(text:string){notices.push(text);}}};
  const require=createRequire(import.meta.url),module={exports:{} as any};
  const code=buildSync({entryPoints:['src/main.ts'],bundle:true,write:false,platform:'node',format:'cjs',external:['obsidian','@codemirror/state','@codemirror/view']}).outputFiles[0].text;
  runInNewContext(code,{module,exports:module.exports,require:(name:string)=>name==='obsidian'?obsidian:require(name),console,process,Buffer,
    window:{setTimeout:(fn:()=>void)=>{const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout:(id:number)=>timers.delete(id),setInterval:()=>1},
    setTimeout,clearTimeout,Symbol,Map});
  const instance=new module.exports.default();
  const start=async()=>{await instance.onload();instance.archive=archive;};
  return {instance,start,timers,layoutReady:()=>layoutReady(),finishInit,notices,counts:()=>({initialized,registered,refreshed,dispatched})};
}

test('restored deferred sidebar and Markdown views do not throw while refreshing',()=>{
  const f=fixture();f.instance.refreshViews();f.instance.refreshEditors();
  assert.equal(f.counts().refreshed,1);assert.equal(f.counts().dispatched,1);
});

test('onload registers the review view and returns before layout or archive initialization',async()=>{
  const f=fixture();await f.start();
  assert.equal(f.counts().registered,1);assert.equal(f.counts().initialized,0);assert.equal(f.instance.ready,false);
  f.layoutReady();assert.equal(f.counts().initialized,0);
  const timer=f.timers.values().next().value!;timer();await Promise.resolve();
  assert.equal(f.counts().initialized,1);assert.equal(f.instance.ready,false);
  f.finishInit();await f.instance.startup;
  assert.equal(f.instance.ready,true);assert.equal(f.notices.length,0);
});

test('unloading before layout prevents delayed startup',async()=>{
  const f=fixture();await f.start();f.instance.onunload();f.layoutReady();
  assert.equal(f.timers.size,0);assert.equal(f.counts().initialized,0);
});

test('unloading during archive initialization waits for initialization without registering tracking',async()=>{
  const f=fixture();await f.start();f.layoutReady();f.timers.values().next().value!();await Promise.resolve();
  f.instance.onunload();f.finishInit();await f.instance.startup;
  assert.equal(f.instance.ready,false);assert.equal(f.counts().refreshed,0);
});
