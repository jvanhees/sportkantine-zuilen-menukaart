// Rendert site/ in een echte browser en rapporteert of alles past.
// Gebruik: node tools/shot.mjs [uitvoer.png] [breedte] [hoogte]
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const EXE = process.env.CHROME
  || '/home/jvh/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell';

const [uit = 'schermafdruk.png', breedte = 1920, hoogte = 1080] = process.argv.slice(2);
const TYPE = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.txt': 'text/plain' };

const server = createServer(async (req, res) => {
  const pad = join('site', req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  try {
    const body = await readFile(pad);
    res.writeHead(200, { 'Content-Type': TYPE[extname(pad)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('niet gevonden'); }
}).listen(0);

const poort = server.address().port;
const b = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu'] });
const p = await b.newPage({ viewport: { width: +breedte, height: +hoogte } });
p.on('pageerror', e => console.log('  [pagefout]', e.message));
p.on('console', m => m.type() === 'error' && console.log('  [console]', m.text()));

await p.goto(`http://127.0.0.1:${poort}/`, { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(400);

const r = await p.evaluate(() => {
  const kaart = document.getElementById('kaart');
  const groepen = [...kaart.children];
  const kolomVan = new Map();
  groepen.forEach(g => {
    const x = Math.round(g.getBoundingClientRect().left);
    kolomVan.set(x, [...(kolomVan.get(x) || []), g.querySelector('h2')?.textContent || '(geen kop)']);
  });
  const onder = Math.max(...groepen.map(g => g.getBoundingClientRect().bottom));
  return {
    schaal: +getComputedStyle(document.documentElement).getPropertyValue('--schaal'),
    rootPx: getComputedStyle(document.documentElement).fontSize,
    breedteOverloop: kaart.scrollWidth - kaart.clientWidth,
    hoogteOverloop: Math.round(onder - kaart.getBoundingClientRect().bottom),
    kolommen: [...kolomVan.values()],
    items: document.querySelectorAll('.regel').length,
  };
});

console.log(JSON.stringify(r, null, 2));
const ok = r.breedteOverloop <= 1 && r.hoogteOverloop <= 1;
console.log(ok ? '\nOK: alles past binnen het scherm' : '\nFOUT: er valt iets buiten beeld');

await p.screenshot({ path: uit });
await b.close(); server.close();
process.exit(ok ? 0 : 1);
