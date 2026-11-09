export const XML_LIMITS = Object.freeze({bytes:8*1024*1024,nodes:100000,depth:64,tag:262144});
export function xmlFailure(code,message) { return Object.assign(new Error(message),{code}); }
/** Lexical budgets precede either native or browser XML parser. This does not claim well-formedness. */
export function safeXmlText(bytes) {
  if (!(typeof bytes === 'string' || bytes instanceof Uint8Array || bytes instanceof ArrayBuffer)) throw xmlFailure('XML_INPUT','Ожидался XML в UTF-8.');
  if (typeof bytes !== 'string') { const input=bytes instanceof ArrayBuffer?new Uint8Array(bytes):bytes; if(input.byteLength>XML_LIMITS.bytes) throw xmlFailure('XML_LIMIT','XML превышает 8 MiB.'); try { bytes=new TextDecoder('utf-8',{fatal:true}).decode(input); } catch { throw xmlFailure('XML_INPUT','XML должен использовать UTF-8.'); } }
  if(new TextEncoder().encode(bytes).length>XML_LIMITS.bytes) throw xmlFailure('XML_LIMIT','XML превышает 8 MiB.');
  if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(bytes)||/http:\/\/www\.w3\.org\/2001\/XInclude/.test(bytes)) throw xmlFailure('XML_UNSAFE','DTD, внешние сущности и XInclude запрещены.');
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(bytes)) throw xmlFailure('XML_INPUT','Недопустимый символ XML.');
  const encoding=bytes.match(/^\uFEFF?\s*<\?xml\s[^?]*encoding\s*=\s*['"]([^'"]+)/i)?.[1];
  if(encoding&&!/^utf-8$/i.test(encoding)) throw xmlFailure('XML_INPUT','Поддерживается только XML UTF-8.');
  let at=0,depth=0,nodes=0;
  while((at=bytes.indexOf('<',at))!==-1) {
    if(bytes.startsWith('<!--',at)||bytes.startsWith('<![CDATA[',at)) { const end=bytes.startsWith('<!--',at)?'-->':']]>'; const next=bytes.indexOf(end,at+4); if(next<0) throw xmlFailure('XML_SYNTAX','Незавершённый комментарий или CDATA.'); at=next+end.length; continue; }
    if(bytes.startsWith('<?',at)) { const end=bytes.indexOf('?>',at+2); if(end<0) throw xmlFailure('XML_SYNTAX','Незавершённая XML инструкция.'); if(!/^<\?xml\s/.test(bytes.slice(at,end))) throw xmlFailure('XML_UNSAFE','XML processing instructions запрещены.'); at=end+2; continue; }
    let quote='',end=at+1;
    for(;end<bytes.length;end++) { const c=bytes[end]; if(quote) { if(c===quote) quote=''; } else if(c==='"'||c==="'") quote=c; else if(c==='>') break; if(end-at>XML_LIMITS.tag) throw xmlFailure('XML_LIMIT','XML tag превышает предел.'); }
    if(end===bytes.length) throw xmlFailure('XML_SYNTAX','Незавершённый XML tag.');
    if(bytes[at+1]==='/') depth--; else { if(++nodes>XML_LIMITS.nodes) throw xmlFailure('XML_LIMIT','Слишком много XML узлов.'); if(++depth>XML_LIMITS.depth) throw xmlFailure('XML_LIMIT','XML слишком глубоко вложен.'); if(bytes[end-1]==='/') depth--; }
    at=end+1;
  }
  return bytes;
}
