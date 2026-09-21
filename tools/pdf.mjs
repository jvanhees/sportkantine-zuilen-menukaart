import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const TYPE={'.html':'text/html','.css':'text/css','.js':'text/javascript'};
const srv=createServer(async(req,res)=>{const pad=join('site',req.url==='/'?'index.html':req.url.split('?')[0]);
  try{const b=await readFile(pad);res.writeHead(200,{'Content-Type':TYPE[extname(pad)]||'application/octet-stream'});res.end(b);}
  catch{res.writeHead(404).end();}}).listen(0);
const b=await chromium.launch({executablePath:process.env.CHROME,args:['--no-sandbox','--disable-gpu']});
const p=await b.newPage({viewport:{width:1920,height:1080}});
await p.goto(`http://127.0.0.1:${srv.address().port}/`,{waitUntil:'networkidle'});
await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(400);
await p.pdf({path:'/tmp/menu.pdf',format:'A4',printBackground:false});
console.log('pdf geschreven');
await b.close(); srv.close();
