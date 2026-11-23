// Run using Obsidian's developer CLI eval. All text and archives are isolated
// under this source project's ignored test directory; no vault notes are edited.
(async () => {
  const real = app.plugins.plugins['track-changes'];
  if (!real?.ready) throw Error('Installed plugin is not ready');
  const checked=[];
  const assert=(condition,message)=>{if(!condition)throw Error(message);checked.push(message);};
  if(!globalThis.__trackChangesTestDirectory)throw Error('Set __trackChangesTestDirectory to an absolute tests/.runtime directory first');
  const root = require('path').join(globalThis.__trackChangesTestDirectory,`live-${Date.now()}`);
  const instance = new real.constructor(app,real.manifest);
  instance.archive = new real.archive.constructor(root);
  await instance.archive.init();instance.ready=true;
  instance.refreshEditors=()=>{};instance.refreshViews=()=>{};
  let text='Original paragraph.\nSecond line.';
  const editor={getValue:()=>text,setValue:value=>{text=value;instance.schedule('fixture.md',value);}};
  instance.editorFor=notePath=>notePath==='fixture.md'?editor:undefined;
  await instance.capture('fixture.md',text);
  text='Rewritten paragraph.\nSecond line!';instance.schedule('fixture.md',text);await instance.flushAll();
  const before=text,base=instance.archive.get('fixture.md').baseline;
  assert(base==='Original paragraph.\nSecond line.','Initial baseline preserved after editing');
  await instance.applyChange('fixture.md',text,base,undefined,false);
  assert(text===base,'Reject all restores accepted text');
  let names=await instance.archive.list(instance.archive.get('fixture.md').docId);
  const versions=await Promise.all(names.map(name=>instance.archive.load(instance.archive.get('fixture.md').docId,name)));
  assert(versions.some(r=>r.kind==='before-reject'&&r.content===before),'Rejected text remains recoverable');
  text='Accepted rewrite';instance.schedule('fixture.md',text);
  await instance.applyChange('fixture.md',text,base,undefined,true);
  assert(instance.archive.get('fixture.md').baseline===text,'Accept all persists new baseline');
  const expected=text;text='Changed while reviewing';
  let refused=false;try{await instance.applyChange('fixture.md',expected,expected,undefined,false);}catch{refused=true;}
  assert(refused&&text==='Changed while reviewing','Stale review cannot replace newer editor text');
  instance.schedule('fixture.md',text);await instance.flushAll();
  await instance.replaceSafely('fixture.md',text,'Original paragraph.\nSecond line.','restore');
  assert(text==='Original paragraph.\nSecond line.','Restore writes selected revision');
  names=await instance.archive.list(instance.archive.get('fixture.md').docId);
  const restored=await Promise.all(names.map(name=>instance.archive.load(instance.archive.get('fixture.md').docId,name)));
  assert(restored.some(r=>r.kind==='before-restore'&&r.content==='Changed while reviewing'),'Restore preserves preceding editor text');
  // Recover-as-copy uses a mock vault to verify the actual plugin action safely.
  let created,opened;
  instance.app={vault:{create:async(name,content)=>{created={path:name,content};return created;}},workspace:{getLeaf:()=>({openFile:async file=>{opened=file;}})}};
  await instance.recoverCopy(restored.find(r=>r.content===before));
  assert(created?.content===before&&opened===created&&created.path.includes('(recovered '),'Recover as copy creates and opens an independent note');
  // Exercise the actual installed CodeMirror extension in a disposable editor.
  const active=app.workspace.getLeavesOfType('markdown').find(l=>l.view.editor?.cm)?.view.editor.cm;
  if(!active)throw Error('An open Markdown editor is needed for the inline smoke test');
  const editorInfoField=real.editorContextField;
  const mount=document.createElement('div');mount.style.position='fixed';mount.style.left='-10000px';document.body.appendChild(mount);
  const State=active.state.constructor,View=active.constructor;
  let cm;
  try{
    const initial='Inline original';await instance.capture('inline-fixture.md',initial);
    const state=State.create({doc:initial,extensions:[editorInfoField.init(()=>({file:{path:'inline-fixture.md'}})),instance.extension()]});
    cm=new View({state,parent:mount});
    cm.dispatch({changes:{from:7,to:15,insert:'replacement'}});
    assert(!!mount.querySelector('.tc-addition'),'Inline addition decoration renders');
    assert([...mount.querySelectorAll('.tc-deletion')].some(el=>el.textContent.length>0),'Inline deletion decoration renders');
    await instance.flushAll();
  } finally {cm?.destroy();mount.remove();}
  await instance.archive.idle();
  instance.schedule('shutdown-fixture.md','Pending text at unload');
  instance.onunload();
  const handoff=globalThis[Symbol.for('obsidian-track-changes.archive-handoffs')]?.get(root);
  assert(handoff instanceof Promise,'Reload handoff exposes the final flush promise');
  await handoff;
  const restarted=new real.archive.constructor(root);await restarted.init();
  assert(restarted.get('shutdown-fixture.md')?.content==='Pending text at unload','Reload handoff preserves pending text before the next scan');
  const result={passed:checked.length,checks:checked,isolatedArchive:root,installedReady:real.ready};
  await require('fs').promises.writeFile(require('path').join(root,'result.json'),JSON.stringify(result,null,2));
  return result;
})()
