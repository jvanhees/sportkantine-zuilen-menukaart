const CFG = Object.assign({ refreshMs: 60000, oudNaMs: 45 * 60000 }, window.MENU_CONFIG || {});
const CACHE = 'menukaart.laatste';

const RANGES = {
  menu:       { range: 'menu!A:G',        verplicht: ['naam', 'prijs', 'categorie', 'toon', 'op'] },
  categorien: { range: 'categorien!A:B',  verplicht: ['categorie', 'toon'] },
  teksten:    { range: 'teksten!A:B',     verplicht: ['sleutel', 'waarde'] },
};

const euro = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });
const klok = d => d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
const el = id => document.getElementById(id);

function bouwUrl() {
  const p = new URLSearchParams();
  Object.values(RANGES).forEach(r => p.append('ranges', r.range));
  p.set('valueRenderOption', 'UNFORMATTED_VALUE');
  p.set('key', CFG.apiKey);
  p.set('_', Date.now());
  return `https://sheets.googleapis.com/v4/spreadsheets/${CFG.sheetId}/values:batchGet?${p}`;
}

// De API laat lege cellen aan het eind van een rij weg, dus rijen komen ongelijk van lengte binnen.
function naObjecten(waarden) {
  const [kop = [], ...rijen] = waarden || [];
  const namen = kop.map(k => String(k).trim().toLowerCase());
  return {
    namen,
    rijen: rijen
      .filter(r => r.some(c => c !== '' && c != null))
      .map(r => Object.fromEntries(namen.map((n, i) => [n, r[i] ?? '']))),
  };
}

async function haalOp() {
  const res = await fetch(bouwUrl());
  if (!res.ok) throw new Error(`Sheets API ${res.status}`);
  const data = await res.json();

  const uit = {};
  Object.entries(RANGES).forEach(([naam, spec], i) => {
    const tab = naObjecten(data.valueRanges?.[i]?.values);
    // Een verkeerde tab levert geen foutmelding op, alleen andere kolommen. Daarom controleren.
    const mist = spec.verplicht.filter(k => !tab.namen.includes(k));
    if (mist.length) throw new Error(`tab ${naam} mist kolom(men): ${mist.join(', ')}`);
    uit[naam] = tab.rijen;
  });
  return uit;
}

const waar = v => v === true || String(v).trim().toLowerCase() === 'true';

function model(data) {
  const teksten = Object.fromEntries(
    data.teksten.map(r => [String(r.sleutel).trim().toLowerCase(), r.waarde])
  );

  const items = data.menu
    .filter(r => waar(r.toon) && String(r.naam).trim())
    .map(r => ({
      naam: String(r.naam).trim(),
      categorie: String(r.categorie).trim(),
      prijs: r.prijs === '' || r.prijs == null ? null : Number(r.prijs),
      op: waar(r.op),
      opIsOp: waar(r['op=op']),
    }));

  const cats = data.categorien
    .filter(r => waar(r.toon) && String(r.categorie).trim())
    .map(r => String(r.categorie).trim());

  const bekend = new Set(cats);
  const groepen = cats
    .map(c => ({ titel: c, items: items.filter(i => i.categorie === c) }))
    .filter(g => g.items.length);

  const rest = items.filter(i => !bekend.has(i.categorie));
  if (rest.length) groepen.push({ titel: null, items: rest });

  return { teksten, groepen };
}

function tekst(node, waarde) {
  const v = (waarde ?? '').toString().trim();
  node.textContent = v;
  node.hidden = !v;
}

function teken({ teksten, groepen }) {
  document.title = teksten.titel || 'Menukaart';
  tekst(el('titel'), teksten.titel);
  tekst(el('ondertitel'), teksten.ondertitel);
  tekst(el('mededeling'), teksten.mededeling);
  tekst(el('footer'), teksten.footer);
  const label = (teksten.label_op_is_op || 'op = op').toString().trim();

  el('kaart').replaceChildren(...groepen.map(g => {
    const sectie = document.createElement('section');
    sectie.className = 'groep';

    if (g.titel) {
      const h = document.createElement('h2');
      h.textContent = g.titel;
      sectie.append(h);
    }

    g.items.forEach(i => {
      const rij = document.createElement('div');
      rij.className = i.op ? 'regel op' : 'regel';

      const naam = document.createElement('span');
      naam.className = 'naam';
      naam.textContent = i.naam;
      rij.append(naam);

      if (i.opIsOp) {
        const tag = document.createElement('span');
        tag.className = 'opisop';
        tag.textContent = label;
        rij.append(tag);
      }

      const vul = document.createElement('span');
      vul.className = 'vul';
      rij.append(vul);

      const prijs = document.createElement('span');
      prijs.className = 'prijs';
      prijs.textContent = i.prijs == null ? '' : euro.format(i.prijs);
      rij.append(prijs);

      sectie.append(rij);
    });
    return sectie;
  }));

  pasSchaalAan();
}

function pasSchaalAan() {
  const root = document.documentElement;
  let s = 1;
  root.style.setProperty('--schaal', s);
  while (document.body.scrollHeight > window.innerHeight && s > 0.45) {
    s -= 0.04;
    root.style.setProperty('--schaal', s);
  }
}

function toonStatus(op, gelukt) {
  const s = el('status');
  s.textContent = `bijgewerkt om ${klok(new Date(op))}`;
  s.classList.toggle('oud', !gelukt || Date.now() - op > CFG.oudNaMs);
}

async function ronde() {
  try {
    const data = await haalOp();
    localStorage.setItem(CACHE, JSON.stringify({ op: Date.now(), data }));
    teken(model(data));
    toonStatus(Date.now(), true);
  } catch (e) {
    console.error(e);
    const bewaard = localStorage.getItem(CACHE);
    if (!bewaard) {
      el('kaart').textContent = `Menukaart kon niet geladen worden: ${e.message}`;
      return;
    }
    const { op, data } = JSON.parse(bewaard);
    teken(model(data));
    toonStatus(op, false);
  }
}

function plaatsNachtelijkeHerstart() {
  const nu = new Date();
  const doel = new Date(nu);
  doel.setHours(4, 0, 0, 0);
  if (doel <= nu) doel.setDate(doel.getDate() + 1);
  setTimeout(() => location.reload(), doel - nu);
}

el('printknop').addEventListener('click', () => window.print());
if (new URLSearchParams(location.search).has('kiosk')) el('printknop').hidden = true;
window.addEventListener('resize', pasSchaalAan);

if (!CFG.sheetId || !CFG.apiKey) {
  el('kaart').textContent = 'config.js ontbreekt of is niet ingevuld (sheetId / apiKey).';
} else {
  ronde();
  setInterval(ronde, CFG.refreshMs);
  plaatsNachtelijkeHerstart();
}
