// Controleert of de kaart bij uiteenlopende hoeveelheden en schermen binnen beeld blijft.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const EXE = process.env.CHROME
  || '/home/jvh/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell';
const TYPE = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };

let FIXTURE = null;
const server = createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/config.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    return res.end(`window.MENU_CONFIG={sheetId:"t",apiKey:"t"};const D=${JSON.stringify(FIXTURE)};`
      + `window.fetch=async()=>({ok:true,status:200,json:async()=>D});`);
  }
  const pad = join('site', url === '/' ? 'index.html' : url);
  try {
    const body = await readFile(pad);
    res.writeHead(200, { 'Content-Type': TYPE[extname(pad)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end(); }
}).listen(0);
const poort = server.address().port;

const maak = (cats, perCat, beschrijving) => {
  const menu = [['op','op=op','toon','naam','categorie','prijs','item_id','beschrijving']];
  for (let c = 0; c < cats; c++)
    for (let i = 0; i < perCat; i++)
      menu.push([i % 7 === 0, i % 5 === 0, true, `Een productnaam ${c}-${i}`, `Categorie ${c}`,
                 1.5 + i * 0.1, `id${c}-${i}`, beschrijving ? 'Fles 33cl, uit de koeling' : '']);
  return { valueRanges: [
    { values: menu },
    { values: [['categorie','toon'], ...Array.from({length: cats}, (_, c) => [`Categorie ${c}`, true])] },
    { values: [['sleutel','waarde'], ['titel','Testkaart'], ['ondertitel','Onderregel'],
               ['mededeling','Een mededeling'], ['footer','Alleen pinnen'], ['label_op_is_op','op = op']] },
  ]};
};

const b = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox','--disable-gpu'] });
let stuk = 0;

for (const [w, h] of [[1920,1080],[1366,768],[3840,2160]]) {
  for (const [cats, perCat, beschr] of [[1,2,false],[3,6,true],[5,8,true],[6,12,true],[9,14,true],[4,30,true]]) {
    FIXTURE = maak(cats, perCat, beschr);
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto(`http://127.0.0.1:${poort}/`, { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(250);
    const r = await p.evaluate(() => {
      const k = document.getElementById('kaart');
      const g = [...k.children];
      const onder = g.length ? Math.max(...g.map(x => x.getBoundingClientRect().bottom)) : 0;
      return { schaal: +getComputedStyle(document.documentElement).getPropertyValue('--schaal'),
               br: k.scrollWidth - k.clientWidth,
               ho: Math.round(onder - k.getBoundingClientRect().bottom) };
    });
    const ok = r.br <= 1 && r.ho <= 1;
    if (!ok) stuk++;
    console.log(`${ok ? 'OK  ' : 'FOUT'} ${String(w).padStart(4)}x${h}  ${cats}cat x ${perCat}  `
      + `schaal ${r.schaal.toFixed(2)}  overloop b/h ${r.br}/${r.ho}`);
    await p.close();
  }
}
await b.close(); server.close();
console.log(stuk ? `\n${stuk} gevallen vallen buiten beeld` : '\nAlle gevallen passen');
process.exit(stuk ? 1 : 0);
