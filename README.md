# Volleybar menukaart

Digitale menukaart voor op een tv, met printknop voor A4. Data komt uit een Google
Sheet die gevuld wordt met de SumUp item-export.

SumUp is de bron voor **naam en prijs**. De sheet bepaalt **categorieën, volgorde,
uitverkocht en alle teksten** — dat kan SumUp niet.

## Inrichten

### 1. Sheet en script

1. Maak een nieuwe Google Sheet in een **club-account**, niet in een persoonlijk account.
2. Extensies → Apps Script, plak `apps-script/Code.gs`, sla op.
3. Herlaad de sheet. Menu **Menukaart → Tabbladen aanmaken**.
4. Selecteer het tabblad `sumup`. Bestand → Importeren → Uploaden → de SumUp-CSV →
   *Replace current sheet*. Plak de CSV niet met de hand; dan komt alles in één kolom.
5. **Menukaart → Categorieen overnemen uit sumup**, en sleep de rijen in `categorien`
   in de volgorde zoals ze op de kaart moeten staan.
6. **Menukaart → Bijwerken vanuit sumup**.

Bij elke volgende export: stap 4 en 6 herhalen. Het script raakt bestaande rijen
niet aan, dus vinkjes, categorieën en volgorde blijven staan. Nieuwe items komen
onderaan zonder categorie te staan en zijn direct zichtbaar op het scherm — dat is
het signaal om ze in te delen.

### 2. Delen

Delen → Iedereen met de link → Lezer.

Let op: dit deelt **alle** tabbladen, ook `sumup`. De SumUp-export heeft een kolom
`Cost price`. Zolang die leeg is valt er niets te lekken; ga je inkoopprijzen invullen,
haal die kolom er dan uit.

### 3. API-key

1. Nieuw project in console.cloud.google.com, **zonder billing-account**. Geen
   gekoppelde kaart betekent dat er niets in rekening gebracht kán worden; boven de
   quota (300 reads/min) falen aanroepen met HTTP 429.
2. Google Sheets API inschakelen.
3. Credentials → API key. Daarna beperken:
   - Application restrictions → Websites → `https://<gebruiker>.github.io/*`
   - API restrictions → Google Sheets API

### 4. GitHub

1. Repo aanmaken, deze map pushen.
2. Settings → Secrets and variables → Actions:
   - `SHEET_ID` — het id uit de sheet-URL
   - `SHEETS_API_KEY`
3. Settings → Pages → Source: **GitHub Actions**.

`config.js` wordt bij elke deploy uit de secrets gegenereerd en staat niet in git.
De key is daarna wel zichtbaar in de gepubliceerde `config.js` — dat is inherent aan
een statische pagina en de reden dat de key beperkt en read-only is.

## Tabbladen

| tabblad | inhoud |
|---|---|
| `sumup` | Ruwe CSV-export. Wordt volledig overschreven, niets met de hand aanpassen. |
| `menu` | `op`, `op=op`, `toon`, `naam`, `categorie`, `prijs`, `item_id`, `beschrijving`. Naam, prijs en beschrijving zijn formules uit `sumup`; de rest is van jou. Rijvolgorde is de volgorde binnen een categorie. |
| `categorien` | `categorie`, `toon`. Rijvolgorde is de volgorde op de kaart. |
| `teksten` | `sleutel`, `waarde`. Sleutels: `titel`, `ondertitel`, `mededeling`, `footer`, `label_op_is_op`. |

Items zonder categorie, of met een categorie die niet in `categorien` staat, komen
onderaan de kaart zonder kop.

De beschrijving komt uit de SumUp-kolom *Description (Online Store and Invoices only)*,
te vullen in SumUp bij het item. Leeg laten betekent geen regel onder het item. Typ je
er met de hand iets overheen, dan blijft dat staan bij een volgende import — net als bij
een handmatig overschreven prijs.

## Pagina

- De kolommen worden door CSS gevuld (`flex-flow: column wrap`). JavaScript zoekt
  alleen de grootste tekstmaat die nog past, en verhoogt het aantal kolommen als
  drie niet genoeg is.
- Ververst elke 60 seconden. Bij een storing blijft de laatste versie staan; de
  tijdstempel rechtsonder kleurt na 45 minuten.
- `?kiosk` verbergt de printknop.
- Herlaadt zichzelf om 04:00 zodat codewijzigingen doorkomen.
- Ctrl+P of de printknop geeft A4. Uitverkochte items staan er zonder streep door op.

## Lokaal

```
cp site/config.example.js site/config.js   # vul sheetId en apiKey in
python3 -m http.server -d site 8000
```

Let op: de API-key is beperkt tot de Pages-origin, dus vanaf localhost werkt de
echte sheet niet. Voor lokaal testen kun je in `site/config.js` ook `window.fetch`
vervangen door een vaste kopie van de sheetdata.

`site/config.js` staat in `.gitignore`.

## Layout testen

De kaart schaalt zichzelf zodat alles precies op het scherm past. Dat is niet met
het blote oog te controleren, dus er staat een browser-harnas in `tools/`:

```
npm install
npm run shot      # rendert site/ op 1920x1080, schrijft schermafdruk.png
npm run stress    # 18 combinaties van hoeveelheid en schermformaat
npm run pdf       # rendert de A4-print naar /tmp/menu.pdf
```

`npm run shot` en `npm run stress` geven een exitcode ongelijk aan nul zodra er
iets buiten beeld valt, en rapporteren de gekozen schaal en kolomindeling.

Dit draait op de chromium uit de Playwright-cache. Die mist drie
toegankelijkheidsbibliotheken, die eenmalig zonder root klaargezet zijn in
`~/.local/lib/chrome-extra`:

```
cd /tmp && for p in libatk1.0-0t64 libatk-bridge2.0-0t64 libatspi2.0-0t64; do apt-get download $p; done
for d in *.deb; do dpkg-deb -x "$d" x/; done
mkdir -p ~/.local/lib/chrome-extra && cp -r x/usr/lib/x86_64-linux-gnu/* ~/.local/lib/chrome-extra/
```
