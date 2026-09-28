/** Small bounded multipart reader used after the HTTP body size limit. */
export function parseMultipartPart(raw:Buffer,boundary:string,name:string){
  const marker=Buffer.from(`--${boundary}`);
  for(let at=raw.indexOf(marker);at>=0;at=raw.indexOf(marker,at+marker.length)){
    const headersEnd=raw.indexOf(Buffer.from('\r\n\r\n'),at);
    if(headersEnd<0)break;
    const headers=raw.subarray(at,headersEnd).toString();
    if(headers.includes(`name="${name}"`)){
      const start=headersEnd+4,end=raw.indexOf(Buffer.from(`\r\n--${boundary}`),start);
      if(end<0)break;
      return {data:raw.subarray(start,end),filename:headers.match(/filename="([^"]*)"/)?.[1],mime:headers.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]};
    }
  }
  return null;
}
