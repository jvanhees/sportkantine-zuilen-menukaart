# volleybar-menu

Digital signage menu for the Sportkantine Zuilen bar, plus an A4 print of the
same page. Live at https://jvanhees.github.io/sportkantine-zuilen-menukaart/
(TV uses `?kiosk`). Repo: `jvanhees/sportkantine-zuilen-menukaart`.

Code comments, commit messages and README are in Dutch. Keep it that way.

## Data flow

```
SumUp CSV export -> Google Sheet -> Sheets API v4 -> static page on GitHub Pages
```

**SumUp has no catalog API.** The bar runs the native platform (`me.sumup.com`),
whose public API covers only checkouts, transactions, payouts, readers and
merchants. The Goodtill/`thegoodtill.com` API does have products and stock, but
that is a different POS product and does not apply here. Stock tracking is off
for nearly every item anyway. Do not re-research this; the manual CSV export is
the only path.

Sheet tabs: `sumup` (raw CSV paste), `menu`, `categorien`, `teksten`. The
ownership split is the core design decision:

- SumUp owns **naam, prijs, beschrijving** (formulas into the `sumup` tab,
  matched on the stable `Item id` column). Typing a literal over a formula is a
  supported per-row override.
- The sheet owns **categories and their contents, row order, `op`, `op=op`,
  `toon`, all display text**. SumUp cannot express any of these.

`apps-script/Code.gs` syncs row lifecycle only: it appends new `Item id`s and
removes vanished ones, and never rewrites an existing row. That is what makes
checkboxes and manual categorisation survive a monthly re-import. Keep it that
way. Items with a blank or unknown category render at the bottom of the board
with no header, deliberately, as a visible nudge to file them.

## Two bugs that cost several rounds

**Scale lives on `html`, not `body`.** Every size in the stylesheet is in `rem`,
which resolves against the root element. `--schaal` was originally applied to
`body`, so the fit loop drove a knob connected to nothing while the text never
changed size. If auto-sizing ever looks inert, check this first.

**CSS multicolumn is unusable here.** `columns: 3` in a fixed-height container
fragments overflow into a fourth column that falls outside the clip, and neither
`scrollWidth` nor `scrollHeight` reports it, so a whole category silently
vanished. Packing is now `flex-flow: column wrap` with an explicit `--kolommen`
width. Do not go back to `columns`.

JavaScript does exactly one layout job: binary search the largest `--schaal`
that fits, raising `--kolommen` from 3 toward 8 when 3 cannot hold everything.
CSS cannot measure, so this part cannot be CSS. Everything else is CSS.

`--overscan` (default 5, override `?overscan=N`) is in `vw`/`vh` on purpose: it
compensates for the TV cutting its edges and must not shrink with the text.

## Verify layout by rendering it

Several layout fixes were shipped blind and each was wrong in a way one
screenshot would have caught. Render before reasoning.

```
npm run shot      # 1920x1080, reports scale + column split, exits non-zero on overflow
npm run stress    # 18 combinations of content volume x screen size
npm run pdf       # A4 print to /tmp/menu.pdf
```

These drive the chromium in the Playwright cache, which needs three ATK libs
staged in `~/.local/lib/chrome-extra`. Already done on this machine; the README
has the recipe if it goes missing.

## Local preview

The API key is referrer-restricted to the Pages origin, so **localhost cannot
reach the real sheet**. `site/config.js` (gitignored) therefore holds a baked
copy of the sheet data with `window.fetch` stubbed. It goes stale the moment the
sheet changes, which has caused "where did my data go" confusion more than once.
Re-pull it from the live sheet before trusting a local render, or just use the
deployed site, which polls the real sheet every 60s.

## Deploy

Push to `main`. The workflow generates `site/config.js` from the `SHEET_ID` and
`SHEETS_API_KEY` secrets and publishes **only `site/`**. `tools/` and
`package.json` are dev-only and never reach the TV.

Code changes need a browser reload on the TV; the page self-reloads at 04:00.
Data changes need nothing.
