export const documentId=/^[a-f0-9-]{36}$/;
const legacyRevision=/^(\d+)-[a-f0-9-]+\.json\.gz$/;
const datedRevision=/^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})\.(\d{3})_UTC([+-])(\d{2})(\d{2})\.json\.gz$/;
export function dateStamp(value:number|Date){
  const date=new Date(value),pad=(n:number,width=2)=>String(n).padStart(width,'0'),offset=-date.getTimezoneOffset();
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}.${pad(date.getMilliseconds(),3)}_UTC${offset<0?'-':'+'}${pad(Math.floor(Math.abs(offset)/60))}${pad(Math.abs(offset)%60)}`;
}
export function safeName(value:string){return value.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/\s+/g,' ').trim().slice(0,60).replace(/[. ]+$/,'')||'Untitled';}
export function revisionName(id:string){return `${dateStamp(Number(id.split('-')[0]))}.json.gz`;}
export function revisionTime(name:string):number|undefined{
  const old=name.match(legacyRevision);if(old)return Number(old[1]);
  const match=name.match(datedRevision);if(!match)return;
  const value=Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}${match[6]}${match[7]}:${match[8]}`);
  return Number.isFinite(value)?value:undefined;
}
export function archiveDirectoryName(name:string){return documentId.test(name)||/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.\d{3}_UTC[+-]\d{4} - .+/.test(name);}
export function sortRevisions(names:string[]){return names.filter(name=>revisionTime(name)!==undefined).sort((a,b)=>revisionTime(b)!-revisionTime(a)!||b.localeCompare(a));}
