const CFG = Object.assign({ refreshMs: 60000, oudNaMs: 45 * 60000 }, window.MENU_CONFIG || {});
const CACHE = 'menukaart.laatste';
const KOLOMMEN = 3;
const MIN_SCHAAL = 0.35;
const MAX_SCHAAL = 2.4;
let laatsteModel = null;

const RANGES = {
  menu:       { range: 'menu!A:H',        verplicht: ['naam', 'prijs', 'categorie', 'toon', 'op'] },
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
      beschrijving: String(r.beschrijving ?? '').trim(),
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

  const blokken = groepen.map(g => {
    const sectie = document.createElement('section');
    sectie.className = 'groep';

    if (g.titel) {
      const h = document.createElement('h2');
      h.textContent = g.titel;
      sectie.append(h);
    }

    g.items.forEach(i => {
      const blok = document.createElement('div');
      blok.className = i.op ? 'item op' : 'item';

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

      blok.append(rij);

      if (i.beschrijving) {
        const tekstje = document.createElement('p');
        tekstje.className = 'beschrijving';
        tekstje.textContent = i.beschrijving;
        blok.append(tekstje);
      }

      sectie.append(blok);
    });
    return sectie;
  });

  laatsteModel = { teksten, groepen };
  vulKaart(blokken);
}

// Zoekt de grootste schaal die nog op het scherm past, zodat de kolommen het beeld
// vullen in plaats van bovenaan te blijven hangen.
function telOmkeringen(kolom) {
  let n = 0;
  for (let i = 0; i < kolom.length; i++)
    for (let j = i + 1; j < kolom.length; j++) if (kolom[i] > kolom[j]) n++;
  return n;
}

function verdeelGretig(hoogtes, n) {
  const som = new Array(n).fill(0);
  const kolom = hoogtes.map(function (h) {
    let k = 0;
    for (let i = 1; i < n; i++) if (som[i] < som[k]) k = i;
    som[k] += h;
    return k;
  });
  return { max: Math.max(...som), kolom };
}

// Zoekt de verdeling met de kortste hoogste kolom, want die bepaalt hoe groot de
// tekst kan worden. Bij gelijke hoogte wint de verdeling die de categorievolgorde
// het minst omgooit.
function verdeel(hoogtes, n) {
  const g = hoogtes.length;
  if (!g) return { max: 0, kolom: [] };
  if (Math.pow(n, g) > 60000) return verdeelGretig(hoogtes, n);

  const kolom = new Array(g);
  const som = new Array(n).fill(0);
  let beste = null;

  const zoek = function (i) {
    if (i === g) {
      const max = Math.max.apply(null, som);
      if (beste && max > beste.max + 0.5) return;
      const omkeringen = telOmkeringen(kolom);
      if (!beste || max < beste.max - 0.5 || omkeringen < beste.omkeringen)
        beste = { max: max, omkeringen: omkeringen, kolom: kolom.slice() };
      return;
    }
    for (let k = 0; k < n; k++) {
      kolom[i] = k;
      som[k] += hoogtes[i];
      zoek(i + 1);
      som[k] -= hoogtes[i];
    }
  };
  zoek(0);
  return beste;
}

// CSS-kolommen fragmenteren op een manier die niet betrouwbaar te meten is; een
// overlopende kolom verdween buiten beeld. Daarom de verdeling hier zelf doen.
function vulKaart(blokken) {
  const kaart = el('kaart');
  const root = document.documentElement;

  const kolommen = [];
  for (let i = 0; i < KOLOMMEN; i++) {
    const d = document.createElement('div');
    d.className = 'kolom';
    kolommen.push(d);
  }
  kaart.replaceChildren(...kolommen);
  if (!blokken.length) return;
  kolommen[0].append(...blokken);

  const meet = () => {
    const marge = parseFloat(getComputedStyle(blokken[0]).marginBottom) || 0;
    return blokken.map(b => b.getBoundingClientRect().height + marge);
  };
  const past = schaal => {
    root.style.setProperty('--schaal', schaal);
    return verdeel(meet(), KOLOMMEN).max <= kaart.clientHeight + 1;
  };

  let klein = MIN_SCHAAL;
  if (past(MAX_SCHAAL)) {
    klein = MAX_SCHAAL;
  } else {
    let groot = MAX_SCHAAL;
    for (let i = 0; i < 16; i++) {
      const mid = (klein + groot) / 2;
      if (past(mid)) klein = mid; else groot = mid;
    }
    root.style.setProperty('--schaal', klein);
  }

  const kolom = verdeel(meet(), KOLOMMEN).kolom;
  blokken.forEach((b, i) => kolommen[kolom[i]].append(b));
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
const opnieuw = () => laatsteModel && teken(laatsteModel);
window.addEventListener('resize', opnieuw);
if (document.fonts) document.fonts.ready.then(opnieuw);

if (!CFG.sheetId || !CFG.apiKey) {
  el('kaart').textContent = 'config.js ontbreekt of is niet ingevuld (sheetId / apiKey).';
} else {
  ronde();
  setInterval(ronde, CFG.refreshMs);
  plaatsNachtelijkeHerstart();
}
