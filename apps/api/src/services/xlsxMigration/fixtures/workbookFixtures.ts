import { XLSX_IMPORT_V1_SCHEMA } from "@miclub/shared";

type FixtureOptions={swappedHeaders?:boolean;missingRequiredCell?:boolean;formula?:boolean;sharedHeaders?:boolean;movementValues?:Record<string,string>};
const xml=(value:string)=>value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const cell=(coordinate:string,value:string,type="inlineStr")=>`<c r="${coordinate}" t="${type}">${type==="inlineStr"?`<is><t>${xml(value)}</t></is>`:`<v>${value}</v>`}</c>`;

function zip(files:Record<string,string>):Buffer {
  const locals:Buffer[]=[]; const centrals:Buffer[]=[]; let offset=0;
  for(const [name,text] of Object.entries(files)) {
    const filename=Buffer.from(name),data=Buffer.from(text);
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt32LE(0,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(filename.length,26);
    locals.push(local,filename,data);
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt32LE(0,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(filename.length,28);central.writeUInt32LE(offset,42);
    centrals.push(central,filename); offset+=local.length+filename.length+data.length;
  }
  const directory=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,directory,end]);
}

export function workbookFixture(options:FixtureOptions={}):Buffer {
  const schemas=Object.values(XLSX_IMPORT_V1_SCHEMA.sheets);
  const shared:string[]=[];
  const worksheets=schemas.map((schema,sheetIndex)=>{
    const headers=schema.columns.map((column,index)=>{
      const header=options.swappedHeaders&&sheetIndex===0&&index<2?schema.columns[1-index].header:column.header;
      if(options.sharedHeaders){shared.push(header);return cell(column.headerCell,String(shared.length-1),"s");}
      return cell(column.headerCell,header);
    }).join("");
    const values:Record<string,string>=sheetIndex===0
      ? {date:"2026-08-14",type:"INGRESOS",category:"Cuotas",concept:"Mensual",amount:"1234.50",status:"COMPLETADO"}
      : {date:"2026-08-14",firstName:"Ana",lastName:"Pérez",document:"123",activity:"Tenis",fee:"10,50",status:"ACTIVA"};
    if(sheetIndex===0)Object.assign(values,options.movementValues);
    const data=schema.columns.map((column)=>{
      if(options.missingRequiredCell&&sheetIndex===0&&column.key==="concept") return "";
      const value=values[column.key]; if(value===undefined)return "";
      const coordinate=column.dataCell;
      if(options.formula&&sheetIndex===0&&column.key==="amount") return `<c r="${coordinate}"><f>1+1</f><v>2</v></c>`;
      return cell(coordinate,value,column.type==="decimal"?"n":"inlineStr");
    }).join("");
    return `<worksheet><sheetData><row r="1">${headers}</row><row r="2">${data}</row></sheetData></worksheet>`;
  });
  const files:Record<string,string>={
    "xl/workbook.xml":`<workbook xmlns:r="r"><sheets>${schemas.map((schema,index)=>`<sheet name="${schema.name}" r:id="rId${index+1}"/>`).join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels":`<Relationships>${schemas.map((_,index)=>`<Relationship Id="rId${index+1}" Target="worksheets/sheet${index+1}.xml"/>`).join("")}</Relationships>`,
    ...Object.fromEntries(worksheets.map((sheet,index)=>[`xl/worksheets/sheet${index+1}.xml`,sheet])),
  };
  if(options.sharedHeaders)files["xl/sharedStrings.xml"]=`<sst>${shared.map((value)=>`<si><t>${xml(value)}</t></si>`).join("")}</sst>`;
  return zip(files);
}

export const maliciousZipFixture=()=>zip({"../xl/workbook.xml":"hostile"});
