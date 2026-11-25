import {promises as fs} from 'node:fs';
import {constants} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
export interface Revision {schema:1;id:string;docId:string;time:string;path:string;aliases:string[];kind:string;content:string;baseline:string;deleted:boolean;label?:string}
export class Archive {
  readonly docs=new Map<string,Revision>(); readonly active=new Map<string,string>();
  private queue:Promise<unknown>=Promise.resolve();
  constructor(public root:string){}
  static vaultId(vaultPath:string){return createHash('sha256').update(path.resolve(vaultPath).replaceAll('\\','/').toLowerCase()).digest('hex').slice(0,24);}
  private serial<T>(job:()=>Promise<T>):Promise<T>{const task=this.queue.then(job);this.queue=task.catch(()=>{});return task;}
  async init(){
    await fs.mkdir(this.root,{recursive:true});
    const errors:string[]=[];
    for(const entry of await fs.readdir(this.root,{withFileTypes:true})){
      if(!entry.isDirectory() || !/^[a-f0-9-]{36}$/.test(entry.name))continue;
      const files=(await fs.readdir(path.join(this.root,entry.name))).filter(n=>n.endsWith('.json.gz')).sort().reverse();
      for(const name of files){try{const r=await this.read(entry.name,name);this.docs.set(r.docId,r);break;}catch{errors.push(`${entry.name}/${name}`);}}
    }
    for(const r of [...this.docs.values()].sort((a,b)=>a.id.localeCompare(b.id))) if(!r.deleted)this.active.set(r.path,r.docId);
    if(errors.length) throw new Error(`Unreadable archive revisions (${errors.length}); files preserved. First: ${errors[0]}`);
  }
  get(notePath:string){const id=this.active.get(notePath);return id?this.docs.get(id):undefined;}
  private async read(docId:string,name:string):Promise<Revision>{
    if(!/^[a-f0-9-]{36}$/.test(docId)||!/^\d+-[a-f0-9-]+\.json\.gz$/.test(name))throw Error('Invalid revision path');
    const r=JSON.parse(gunzipSync(await fs.readFile(path.join(this.root,docId,name))).toString('utf8'));
    if(r.schema!==1||r.docId!==docId||typeof r.content!=='string'||typeof r.baseline!=='string'||typeof r.path!=='string'||!Array.isArray(r.aliases)||typeof r.deleted!=='boolean')throw Error('Invalid revision');
    return r;
  }
  async list(docId:string){if(!/^[a-f0-9-]{36}$/.test(docId))throw Error('Invalid document');return (await fs.readdir(path.join(this.root,docId))).filter(n=>/^\d+-[a-f0-9-]+\.json\.gz$/.test(n)).sort().reverse();}
  async load(docId:string,name:string){return this.read(docId,name);}
  save(notePath:string,content:string,kind='edit',options:{baseline?:string;label?:string;docId?:string;deleted?:boolean;oldPath?:string}={}){
    return this.serial(async()=>{
      const old=options.docId?this.docs.get(options.docId):this.get(options.oldPath??notePath);
      const baseline=options.baseline??old?.baseline??content;
      if(old && old.content===content && old.baseline===baseline && old.path===notePath && old.deleted===(options.deleted??false) && kind==='edit')return old;
      const docId=old?.docId??randomUUID();
      const last=old?Number(old.id.split('-')[0]):0;
      const id=`${Math.max(Date.now(),last+1)}-${randomUUID()}`;
      const r:Revision={schema:1,id,docId,time:new Date().toISOString(),path:notePath,aliases:[...new Set([...(old?.aliases??[]),notePath])],kind,content,baseline,deleted:options.deleted??false,...(options.label?{label:options.label}:{})};
      const dir=path.join(this.root,docId);await fs.mkdir(dir,{recursive:true});
      const destination=path.join(dir,`${id}.json.gz`),tmp=`${destination}.tmp`;
      const handle=await fs.open(tmp,'wx');try{await handle.writeFile(gzipSync(JSON.stringify(r)));await handle.sync();}finally{await handle.close();}
      await fs.rename(tmp,destination);
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
        for(const doc of await fs.readdir(root,{withFileTypes:true})){
          if(!doc.isDirectory()||!/^[a-f0-9-]{36}$/.test(doc.name))throw Error(`Unexpected archive entry: ${doc.name}. Existing files were preserved.`);
          for(const file of await fs.readdir(path.join(root,doc.name),{withFileTypes:true})){
            if(file.isFile()&&file.name.endsWith('.tmp'))continue;
            if(!file.isFile()||!/^\d+-[a-f0-9-]+\.json\.gz$/.test(file.name))throw Error('Unexpected archive file. Existing files were preserved.');
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
