export interface Paragraph {from:number;bodyTo:number;to:number;body:string;separator:string;text:string}
export function paragraphs(text:string):Paragraph[]{
  const result:Paragraph[]=[];let from=0,match:RegExpExecArray|null;
  const separators=/\r?\n[\t ]*\r?\n(?:[\t ]*\r?\n)*/g;
  while((match=separators.exec(text))){
    const to=match.index+match[0].length;
    result.push({from,bodyTo:match.index,to,body:text.slice(from,match.index),separator:match[0],text:text.slice(from,to)});from=to;
  }
  if(from<text.length)result.push({from,bodyTo:text.length,to:text.length,body:text.slice(from),separator:'',text:text.slice(from)});
  return result;
}
