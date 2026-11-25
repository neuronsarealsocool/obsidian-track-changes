import {promises as fs} from 'node:fs';
import {constants} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {mapAreaRange} from './area-history';
import {archiveDirectoryName,dateStamp,documentId,revisionName,revisionTime,safeName,sortRevisions} from './archive-names';
export interface SavedArea {id:string;from:number;to:number;previousText:string}
export interface AreaRestore {id:string;before:{from:number;to:number};after:{from:number;to:number};beforeRevisionId:string;previousText:string}
export type AreaTransition=Omit<AreaRestore,'previousText'>;
export interface Revision {schema:1;id:string;docId:string;time:string;path:string;aliases:string[];kind:string;content:string;baseline:string;deleted:boolean;label?:string;areaAnchors?:SavedArea[];areaRestore?:AreaRestore;areaChanges?:AreaTransition[]}
export class Archive {
  readonly docs=new Map<string,Revision>(); readonly active=new Map<string,string>();
  private queue:Promise<unknown>=Promise.resolve();
  private folders=new Map<string,string>();
  constructor(public root:string,private vaultIdentity?:{id:string;name:string}){}
  static vaultId(vaultPath:string){return createHash('sha256').update(path.resolve(vaultPath).replaceAll('\\','/').toLowerCase()).digest('hex').slice(0,24);}
  private serial<T>(job:()=>Promise<T>):Promise<T>{const task=this.queue.then(job);this.queue=task.catch(()=>{});return task;}
  async init(){
    if(this.vaultIdentity){
      try{await fs.access(this.root);}catch(error){
        if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
        const parent=path.dirname(this.root);await fs.mkdir(parent,{recursive:true});
        const matches:string[]=[];
        for(const entry of await fs.readdir(parent,{withFileTypes:true}))if(entry.isDirectory()){
          try{const metadata=JSON.parse(await fs.readFile(path.join(parent,entry.name,'.vault.json'),'utf8'));if(metadata.vaultId===this.vaultIdentity.id)matches.push(path.join(parent,entry.name));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
        }
        if(matches.length>1)throw Error('More than one archive matches this vault. Choose the intended history folder in settings.');
        if(matches.length===1)this.root=matches[0];
      }
    }
    await fs.mkdir(this.root,{recursive:true});
    if(this.vaultIdentity){try{const metadata=JSON.parse(await fs.readFile(path.join(this.root,'.vault.json'),'utf8'));if(metadata.vaultId!==this.vaultIdentity.id)throw Error('This history folder belongs to a different vault.');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
    this.docs.clear();this.active.clear();this.folders.clear();
    const errors:string[]=[];
    for(const entry of await fs.readdir(this.root,{withFileTypes:true})){
      if(!entry.isDirectory()||!archiveDirectoryName(entry.name))continue;
      const files=sortRevisions(await fs.readdir(path.join(this.root,entry.name)));
      for(const name of files){try{const r=await this.readAt(entry.name,name);if(this.folders.has(r.docId))throw Error('Duplicate document archive');this.folders.set(r.docId,entry.name);this.docs.set(r.docId,r);break;}catch{errors.push(`${entry.name}/${name}`);}}
    }
    for(const r of [...this.docs.values()].sort((a,b)=>a.id.localeCompare(b.id))) if(!r.deleted)this.active.set(r.path,r.docId);
    if(errors.length) throw new Error(`Unreadable archive revisions (${errors.length}); files preserved. First: ${errors[0]}`);
    await this.readableLayout();
  }
  get(notePath:string){const id=this.active.get(notePath);return id?this.docs.get(id):undefined;}
  directory(docId:string){if(!documentId.test(docId))throw Error('Invalid document');return path.join(this.root,this.folders.get(docId)??docId);}
  private async readAt(folder:string,name:string,docId?:string):Promise<Revision>{
    if(revisionTime(name)===undefined||path.basename(folder)!==folder||!archiveDirectoryName(folder))throw Error('Invalid revision path');
    const r=JSON.parse(gunzipSync(await fs.readFile(path.join(this.root,folder,name))).toString('utf8'));
    if(r.schema!==1||!documentId.test(r.docId)||(docId&&r.docId!==docId)||typeof r.id!=='string'||Number(r.id.split('-')[0])!==revisionTime(name)||typeof r.content!=='string'||typeof r.baseline!=='string'||typeof r.path!=='string'||!Array.isArray(r.aliases)||typeof r.deleted!=='boolean')throw Error('Invalid revision');
    const range=(value:any,limit=Number.MAX_SAFE_INTEGER)=>value&&Number.isSafeInteger(value.from)&&Number.isSafeInteger(value.to)&&value.from>=0&&value.to>=value.from&&value.to<=limit;
    if(r.areaAnchors!==undefined&&(!Array.isArray(r.areaAnchors)||r.areaAnchors.some((area:any)=>!range(area,r.content.length)||typeof area.id!=='string'||typeof area.previousText!=='string')))throw Error('Invalid area history markers');
    if(r.areaRestore!==undefined){const area=r.areaRestore;if(!range(area.before)||!range(area.after,r.content.length)||typeof area.id!=='string'||typeof area.beforeRevisionId!=='string'||typeof area.previousText!=='string')throw Error('Invalid area restoration');}
    if(r.areaChanges!==undefined&&(!Array.isArray(r.areaChanges)||r.areaChanges.some((area:any)=>!range(area.before)||!range(area.after,r.content.length)||typeof area.id!=='string'||typeof area.beforeRevisionId!=='string')))throw Error('Invalid area transitions');
    return r;
  }
  async list(docId:string){return sortRevisions(await fs.readdir(this.directory(docId)));}
  async load(docId:string,name:string){if(!documentId.test(docId))throw Error('Invalid revision path');return this.readAt(this.folders.get(docId)??docId,name,docId);}
  private async availableFolder(base:string,current?:string){
    let candidate=base,index=2;
    while(candidate!==current){try{await fs.access(path.join(this.root,candidate));candidate=`${base} (${index++})`;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')break;throw error;}}
    return candidate;
  }
  private async readableLayout(){
    for(const [id,r] of this.docs){
      const names=await this.list(id),folder=this.folders.get(id)!;
      for(const name of names){if(!/^\d+-[a-f0-9-]+\.json\.gz$/.test(name))continue;const revision=await this.readAt(folder,name,id),readable=revisionName(revision.id);if(name===readable)continue;
        try{await fs.access(path.join(this.root,folder,readable));throw Error('A readable revision filename already exists. No history was overwritten.');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
        await fs.rename(path.join(this.root,folder,name),path.join(this.root,folder,readable));
      }
      const title=r.path.split('/').pop()?.replace(/\.md$/i,'')??'Untitled';
      const readable=documentId.test(folder)?await this.availableFolder(`${dateStamp(revisionTime(names.at(-1)!)!)} - ${safeName(title)}`,folder):folder;
      if(readable!==folder){await fs.rename(path.join(this.root,folder),path.join(this.root,readable));this.folders.set(id,readable);}
    }
    if(this.vaultIdentity){
      let created=(await fs.stat(this.root)).birthtime.toISOString();
      try{const metadata=JSON.parse(await fs.readFile(path.join(this.root,'.vault.json'),'utf8'));if(metadata.vaultId!==this.vaultIdentity.id)throw Error('This history folder belongs to a different vault.');if(typeof metadata.created!=='string'||!Number.isFinite(Date.parse(metadata.created)))throw Error('Invalid vault archive creation date.');created=metadata.created;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
      const metadata=path.join(this.root,'.vault.json');
      try{await fs.access(metadata);}catch(error){
        if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
        const temporary=`${metadata}.${randomUUID()}.tmp`,handle=await fs.open(temporary,'wx');
        try{await handle.writeFile(JSON.stringify({schema:1,vaultId:this.vaultIdentity.id,name:this.vaultIdentity.name,created},null,2));await handle.sync();}finally{await handle.close();}
        await fs.rename(temporary,metadata);
      }
      const oldRoot=this.root,vaultName=safeName(this.vaultIdentity.name),leaf=path.basename(oldRoot);
      const stampPattern=/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.\d{3}_UTC[+-]\d{4}(?: \(\d+\))?$/;
      if(leaf.startsWith(`${vaultName} - `)&&stampPattern.test(leaf.slice(vaultName.length+3)))return;
      const existingStamp=leaf.match(/^(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.\d{3}_UTC[+-]\d{4}) - /)?.[1];
      const parent=path.dirname(oldRoot),base=`${vaultName} - ${existingStamp??dateStamp(new Date(created))}`;
      let target=path.join(parent,base),index=2;
      while(target!==oldRoot){try{await fs.access(target);target=path.join(parent,`${base} (${index++})`);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')break;throw error;}}
      if(target!==oldRoot){await fs.rename(oldRoot,target);this.root=target;}
    }
  }
  save(notePath:string,content:string,kind='edit',options:{baseline?:string;label?:string;docId?:string;deleted?:boolean;oldPath?:string;areaRestore?:AreaRestore}={}){
    return this.serial(async()=>{
      const old=options.docId?this.docs.get(options.docId):this.get(options.oldPath??notePath);
      const baseline=options.baseline??old?.baseline??content;
      if(old && old.content===content && old.baseline===baseline && old.path===notePath && old.deleted===(options.deleted??false) && kind==='edit')return old;
      const docId=old?.docId??randomUUID();
      const last=old?Number(old.id.split('-')[0]):0;
      const id=`${Math.max(Date.now(),last+1)}-${randomUUID()}`;
      let areaAnchors=old?.areaAnchors;
      const areaChanges:AreaTransition[]=[];
      if(old&&old.content!==content&&areaAnchors)areaAnchors=areaAnchors.flatMap(area=>{
        const mapped=mapAreaRange(old.content,content,area);if(!mapped.range)return [];
        if(area.from===area.to)mapped.range.to=mapped.range.from;
        areaChanges.push({id:area.id,before:{from:area.from,to:area.to},after:mapped.range,beforeRevisionId:old.id});
        return [{...area,...mapped.range}];
      });
      if(options.areaRestore){
        const restored=options.areaRestore;
        areaAnchors=[...(areaAnchors??[]).filter(area=>area.id!==restored.id),{id:restored.id,...restored.after,previousText:restored.previousText}];
      }
      const r:Revision={schema:1,id,docId,time:new Date().toISOString(),path:notePath,aliases:[...new Set([...(old?.aliases??[]),notePath])],kind,content,baseline,deleted:options.deleted??false,...(options.label?{label:options.label}:{}),...(areaAnchors?{areaAnchors}:{}),...(options.areaRestore?{areaRestore:options.areaRestore}:{}),...(areaChanges.length?{areaChanges}:{})};
      const folder=this.folders.get(docId)??await this.availableFolder(`${dateStamp(Number(id.split('-')[0]))} - ${safeName(notePath.split('/').pop()?.replace(/\.md$/i,'')??'Untitled')}`);
      const dir=path.join(this.root,folder);await fs.mkdir(dir,{recursive:true});
      const destination=path.join(dir,revisionName(id)),tmp=`${destination}.tmp`;
      const handle=await fs.open(tmp,'wx');try{await handle.writeFile(gzipSync(JSON.stringify(r)));await handle.sync();}finally{await handle.close();}
      await fs.rename(tmp,destination);
      this.folders.set(docId,folder);
      if(old)this.active.delete(old.path);
      this.docs.set(docId,r);if(!r.deleted)this.active.set(notePath,docId);return r;
    });
  }
  async idle(){await this.queue;}
  /** Keep writers queued until all immutable revisions are copied and verified.
   * Never delete the old archive or overwrite conflicting destination data. */
  relocate(destination:string,commit:()=>Promise<void>){
    return this.serial(async()=>{
      const source=path.resolve(this.root),target=path.resolve(destination);
      const nested=(parent:string,child:string)=>{const relative=path.relative(parent,child);return relative===''||(!relative.startsWith(`..${path.sep}`)&&relative!=='..'&&!path.isAbsolute(relative));};
      if(source!==target&&(nested(source,target)||nested(target,source)))throw Error('Choose a history folder outside the current vault archive.');
      await fs.mkdir(target,{recursive:true});
      const [sourceReal,targetReal]=await Promise.all([fs.realpath(source),fs.realpath(target)]);
      if(sourceReal===targetReal){await commit();return;}
      if(nested(sourceReal,targetReal)||nested(targetReal,sourceReal))throw Error('Choose a history folder outside the current vault archive.');
      const inventory=async(root:string)=>{
        const files:string[]=[];
        const preserved=async(relative:string)=>{for(const item of await fs.readdir(path.join(root,relative),{withFileTypes:true})){const child=path.join(relative,item.name);if(item.isDirectory())await preserved(child);else if(item.isFile())files.push(child);else throw Error('A preserved archive contains a link. Existing files were preserved.');}};
        for(const doc of await fs.readdir(root,{withFileTypes:true})){
          if(doc.isFile()&&doc.name.startsWith('.vault.json.')&&doc.name.endsWith('.tmp'))continue;
          if(doc.isFile()&&doc.name==='.vault.json'){files.push(doc.name);continue;}
          if(doc.isDirectory()&&doc.name.startsWith('_preserved-')){await preserved(doc.name);continue;}
          if(!doc.isDirectory()||!archiveDirectoryName(doc.name))throw Error(`Unexpected archive entry: ${doc.name}. Existing files were preserved.`);
          for(const file of await fs.readdir(path.join(root,doc.name),{withFileTypes:true})){
            if(file.isFile()&&file.name.endsWith('.tmp'))continue;
            if(!file.isFile()||revisionTime(file.name)===undefined)throw Error('Unexpected archive file. Existing files were preserved.');
            files.push(path.join(doc.name,file.name));
          }
        }
        return files;
      };
      const files=await inventory(source),expected=new Set(files);
      for(const file of await inventory(target)){
        if(!expected.has(file)||(await fs.readFile(path.join(source,file))).compare(await fs.readFile(path.join(target,file)))!==0)
          throw Error('The destination contains different history. Choose an empty history folder; nothing was overwritten.');
      }
      for(const file of files){
        const from=path.join(source,file),to=path.join(target,file);
        await fs.mkdir(path.dirname(to),{recursive:true});
        try{await fs.copyFile(from,to,constants.COPYFILE_EXCL);}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
        if(!(await fs.readFile(from)).equals(await fs.readFile(to)))throw Error('History verification failed. The original archive is still active.');
        const handle=await fs.open(to,'r+');try{await handle.sync();}finally{await handle.close();}
      }
      const verified=new Archive(target);await verified.init();
      if(verified.docs.size!==this.docs.size||[...this.docs].some(([id,r])=>verified.docs.get(id)?.id!==r.id))throw Error('The copied archive state does not match. The original archive is still active.');
      await commit();this.root=target;
    });
  }
}
