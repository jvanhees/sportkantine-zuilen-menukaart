const TAB = { sumup: 'sumup', menu: 'menu', cat: 'categorien', tekst: 'teksten' };

const MENU_KOPPEN  = ['op', 'op=op', 'toon', 'naam', 'categorie', 'prijs', 'item_id'];
const CAT_KOPPEN   = ['categorie', 'toon'];
const TEKST_KOPPEN = ['sleutel', 'waarde'];

const SUMUP_NAAM  = 'Item name';
const SUMUP_PRIJS = 'Price';
const SUMUP_CAT   = 'Category';
const SUMUP_ID    = 'Item id (Do not change)';

const KOL = { op: 1, opIsOp: 2, toon: 3, naam: 4, categorie: 5, prijs: 6, id: 7 };

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Menukaart')
    .addItem('Bijwerken vanuit sumup', 'bijwerken')
    .addSeparator()
    .addItem('Tabbladen aanmaken', 'setup')
    .addItem('Categorieen overnemen uit sumup', 'neemCategorieenOver')
    .addToUi();
}

function kolomLetter(n) {
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - r - 1) / 26; }
  return s;
}

function tabOfMaak(naam, koppen) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(naam);
  if (!sh) sh = ss.insertSheet(naam);
  if (koppen && sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, koppen.length).setValues([koppen]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function setup() {
  tabOfMaak(TAB.sumup, null);
  const menu = tabOfMaak(TAB.menu, MENU_KOPPEN);
  const cat = tabOfMaak(TAB.cat, CAT_KOPPEN);
  const tekst = tabOfMaak(TAB.tekst, TEKST_KOPPEN);

  if (tekst.getLastRow() < 2) {
    tekst.getRange(2, 1, 5, 2).setValues([
      ['titel', 'Menukaart'],
      ['ondertitel', ''],
      ['mededeling', ''],
      ['footer', 'Alleen pinnen'],
      ['label_op_is_op', 'op = op'],
    ]);
  }
  if (cat.getLastRow() < 2) cat.getRange(2, 2).insertCheckboxes();

  menu.setColumnWidth(KOL.id, 60);
  herstelOpmaak_(menu);
  SpreadsheetApp.getActive().toast('Tabbladen klaar. Importeer de SumUp-CSV in het tabblad "sumup".');
}

function herstelOpmaak_(menu) {
  const n = Math.max(menu.getLastRow() - 1, 0);
  if (!n) return;

  menu.getRange(2, KOL.op, n, 3).insertCheckboxes();

  const cat = SpreadsheetApp.getActive().getSheetByName(TAB.cat);
  const regel = SpreadsheetApp.newDataValidation()
    .requireValueInRange(cat.getRange(2, 1, Math.max(cat.getMaxRows() - 1, 1), 1), true)
    .setAllowInvalid(true)
    .build();
  menu.getRange(2, KOL.categorie, n, 1).setDataValidation(regel);
}

function leesSumup_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(TAB.sumup);
  if (!sh || sh.getLastRow() < 2) throw new Error('Tabblad "sumup" is leeg. Importeer eerst de CSV.');

  const waarden = sh.getDataRange().getValues();
  const kop = waarden[0].map(String);
  const idx = {};
  [SUMUP_NAAM, SUMUP_PRIJS, SUMUP_CAT, SUMUP_ID].forEach(function (naam) {
    const i = kop.indexOf(naam);
    if (i === -1) throw new Error('Kolom "' + naam + '" niet gevonden in tabblad "sumup".');
    idx[naam] = i;
  });

  const items = {};
  waarden.slice(1).forEach(function (r) {
    const id = String(r[idx[SUMUP_ID]]).trim();
    if (id) items[id] = { categorie: String(r[idx[SUMUP_CAT]]).trim() };
  });

  return {
    items: items,
    naamKol: kolomLetter(idx[SUMUP_NAAM] + 1),
    prijsKol: kolomLetter(idx[SUMUP_PRIJS] + 1),
    idKol: kolomLetter(idx[SUMUP_ID] + 1),
  };
}

function bijwerken() {
  const ss = SpreadsheetApp.getActive();
  const menu = ss.getSheetByName(TAB.menu);
  const cat = ss.getSheetByName(TAB.cat);
  if (!menu || !cat) throw new Error('Tabbladen ontbreken. Draai eerst "Tabbladen aanmaken".');

  const sumup = leesSumup_();
  const bekendeCats = {};
  cat.getRange(2, 1, Math.max(cat.getLastRow() - 1, 1), 1).getValues()
    .forEach(function (r) { const c = String(r[0]).trim(); if (c) bekendeCats[c] = true; });

  const rijen = menu.getLastRow() - 1;
  const huidig = rijen > 0 ? menu.getRange(2, KOL.id, rijen, 1).getValues().map(function (r) { return String(r[0]).trim(); }) : [];

  const verdwenen = [];
  for (let i = huidig.length - 1; i >= 0; i--) {
    if (huidig[i] && !sumup.items[huidig[i]]) { menu.deleteRow(i + 2); verdwenen.push(huidig[i]); }
  }

  const aanwezig = {};
  huidig.forEach(function (id) { if (id && sumup.items[id]) aanwezig[id] = true; });

  const nieuw = Object.keys(sumup.items).filter(function (id) { return !aanwezig[id]; });
  if (nieuw.length) {
    const start = menu.getLastRow() + 1;
    const rows = nieuw.map(function (id, i) {
      const r = start + i;
      const zoek = 'MATCH($' + kolomLetter(KOL.id) + r + ',' + TAB.sumup + '!$' + sumup.idKol + ':$' + sumup.idKol + ',0)';
      const seed = sumup.items[id].categorie;
      return [
        false, false, true,
        '=IFERROR(INDEX(' + TAB.sumup + '!$' + sumup.naamKol + ':$' + sumup.naamKol + ',' + zoek + '),"")',
        bekendeCats[seed] ? seed : '',
        '=IFERROR(INDEX(' + TAB.sumup + '!$' + sumup.prijsKol + ':$' + sumup.prijsKol + ',' + zoek + '),"")',
        id,
      ];
    });
    menu.getRange(start, 1, rows.length, MENU_KOPPEN.length).setValues(rows);
  }

  herstelOpmaak_(menu);
  ss.toast(nieuw.length + ' nieuw, ' + verdwenen.length + ' verwijderd, ' + Object.keys(aanwezig).length + ' ongewijzigd.', 'Bijgewerkt', 8);
}

// Eenmalig bij het inrichten. Bewust niet onderdeel van bijwerken(): nieuwe categorieen
// horen een keuze te zijn, anders verdwijnt het signaal van ongesorteerde items onderaan.
function neemCategorieenOver() {
  const ss = SpreadsheetApp.getActive();
  const cat = ss.getSheetByName(TAB.cat);
  if (!cat) throw new Error('Tabblad "categorien" ontbreekt. Draai eerst "Tabbladen aanmaken".');

  const sh = ss.getSheetByName(TAB.sumup);
  if (!sh || sh.getLastRow() < 2) throw new Error('Tabblad "sumup" is leeg. Importeer eerst de CSV.');

  const waarden = sh.getDataRange().getValues();
  const i = waarden[0].map(String).indexOf(SUMUP_CAT);
  if (i === -1) throw new Error('Kolom "' + SUMUP_CAT + '" niet gevonden in tabblad "sumup".');

  const bestaand = {};
  cat.getRange(2, 1, Math.max(cat.getLastRow() - 1, 1), 1).getValues()
    .forEach(function (r) { const c = String(r[0]).trim(); if (c) bestaand[c] = true; });

  const nieuw = [];
  waarden.slice(1).forEach(function (r) {
    const c = String(r[i]).trim();
    if (c && !bestaand[c]) { bestaand[c] = true; nieuw.push(c); }
  });
  if (!nieuw.length) { ss.toast('Geen nieuwe categorieen gevonden.'); return; }

  nieuw.sort();
  const start = Math.max(cat.getLastRow(), 1) + 1;
  cat.getRange(start, 1, nieuw.length, 2)
     .setValues(nieuw.map(function (c) { return [c, true]; }));
  cat.getRange(start, 2, nieuw.length, 1).insertCheckboxes();

  ss.toast(nieuw.length + ' categorieen toegevoegd. Sleep de rijen in de gewenste volgorde.', 'Klaar', 8);
}
