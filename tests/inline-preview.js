// Optional visual QA fixture. Evaluate in Obsidian with an absolute
// __trackChangesTestDirectory. No existing vault note is read or modified.
(async()=>{
  globalThis.__trackChangesPreview?.close();
  const real=app.plugins.plugins['track-changes'];
  const instance=new real.constructor(app,real.manifest);
  instance.archive=new real.archive.constructor(require('path').join(globalThis.__trackChangesTestDirectory,`preview-${Date.now()}`));
  await instance.archive.init();instance.ready=true;instance.refreshEditors=()=>{};instance.refreshViews=()=>{};
  const base='That is the original introduction.\nA supporting line from the earlier revision.\n\nA second paragraph stays here.\n\nEverything else remains the same.';
  const text='That is the revised introduction.\n\nA second paragraph now has a change.\n\nEverything else remains the same.';
  await instance.capture('preview.md',base);
  const active=app.workspace.getLeavesOfType('markdown').find(l=>l.view.editor?.cm).view.editor.cm;
  const State=active.state.constructor,View=active.constructor;
  const dialog=document.createElement('dialog');dialog.className='tc-preview-dialog';
  dialog.style.cssText='width:660px;max-width:90vw;padding:24px;background:var(--background-primary);color:var(--text-normal);border:1px solid var(--background-modifier-border);border-radius:12px;box-shadow:var(--shadow-l);';
  const header=document.createElement('div');header.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;';dialog.appendChild(header);
  const heading=document.createElement('h2');heading.textContent='Review changes in place';heading.style.margin='0';header.appendChild(heading);
  const close=document.createElement('button');close.textContent='Close';header.appendChild(close);
  const label=document.createElement('p');label.textContent='Sample note · hover over highlighted text to review its changes';label.style.cssText='color:var(--text-muted);margin:0 0 12px;font-size:var(--font-ui-small);';dialog.appendChild(label);
  const editorHost=document.createElement('div');editorHost.style.cssText='padding:16px;border-radius:6px;background:var(--background-secondary);font-family:var(--font-text);font-size:17px;line-height:1.65;';dialog.appendChild(editorHost);
  document.body.appendChild(dialog);dialog.showModal();
  const cm=new View({state:State.create({doc:base,extensions:[real.editorContextField.init(()=>({file:{path:'preview.md'}})),instance.extension()]}),parent:editorHost});
  cm.scrollDOM.style.fontFamily='var(--font-text)';
  instance.editorFor=p=>p==='preview.md'?{getValue:()=>cm.state.doc.toString(),setValue:value=>cm.dispatch({changes:{from:0,to:cm.state.doc.length,insert:value}})}:undefined;
  cm.dispatch({changes:{from:0,to:cm.state.doc.length,insert:text}});
  const cleanup=()=>{cm.destroy();dialog.remove();instance.onunload();delete globalThis.__trackChangesPreview;};
  close.onclick=()=>dialog.close();dialog.addEventListener('close',cleanup,{once:true});
  globalThis.__trackChangesPreview={dialog,cm,close:()=>dialog.close()};
  await new Promise(r=>setTimeout(r,150));
  const bounds=dialog.getBoundingClientRect();
  return {x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height,cards:dialog.querySelectorAll('.tc-inline-review').length};
})()
