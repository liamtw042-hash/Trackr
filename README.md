# Fills

A trading journal and portfolio tracker built for one person. Forex CFDs traded
discretionarily on CMC Markets, plus long-term ASX holdings, in one place.

Not a product. No sign-up flow, no marketing pages, no multi-tenancy.

*(Previously called Trackr. Backup files written under the old name still
restore — `inspectBackup` accepts both format tags and always will.)*

---

## What it does

**Logging** — the part everything else depends on. Three ways in:

1. **Screenshot a CMC ticket.** A vision model reads the pair, direction, entry,
   stop, target and size, and pre-fills the form. Every field carries a
   confidence score, and anything it couldn't read is left blank rather than
   guessed. You confirm before it saves.
2. **CSV import.** Bulk import a CMC export. Columns are matched by keyword
   (CMC's headers differ between reports), the mapping is shown before anything
   is written, and re-importing an overlapping date range is safe — duplicates
   are detected and skipped.
3. **Manual entry.** Position size derives from risk % and stop distance; R:R
   and P&L compute live. `⌘↵` saves.

Mechanical data and context are deliberately separate. The top of the form is
everything needed to save a valid trade, in about ten seconds. Rules, notes,
emotion and chart screenshots go in later from the trade detail view.

**The rules checklist** — the five rules of the strategy, tracked per trade:
zone had 3+ touches, rejection candle at the zone, with the daily trend, at
least 2:1 R:R, risked ~1%. Each is yes / no / unanswered — a blank is a real
option, distinct from "I broke this rule", because conflating the two would
quietly wreck the adherence analysis. Analysis then shows what each individual
rule is worth in average R.

**AI features** (all optional, all via the Anthropic API):
- Ticket extraction, as above.
- **Chart reading** — describes what's visible in an entry or exit screenshot
  and flags where it disagrees with the rules you ticked. Framed as a second
  opinion: it's told it cannot count zone touches from a windowed chart or read
  EMAs that aren't plotted, and it says so rather than inventing a number.
- **Post-trade review** — judges process against your rules, not outcome. A
  rule-following loss is a good trade and it will say so.
- **Pattern finding** — locked until 20 closed trades, with a progress bar
  showing how far off you are. Marks a finding "strong" only with 10+ trades
  per side; everything else is "tentative", and it lists what it still can't
  answer.
- **Ask your journal** — natural-language questions answered from your own
  trades, always with the sample size stated.

**Compare** — pick two groups on Analysis (by setup, direction or session) and
get the *difference* between them with a confidence interval, not two averages
side by side. Two averages invite the wrong conclusion; the difference has its
own, narrower distribution, and it is the one that answers "is the thing I
changed actually better?". If the interval clears zero the gap is real; if it
straddles zero the page says so in those words.

**Closing out** — an open position closes from the trades table itself: exit
price in, P&L estimated, Enter. The full detail view is one click away for a
trade that deserves rules, notes and screenshots.

**ASX portfolio** — a secondary panel. Holdings entered by hand (NAB Trade has
no API), priced automatically. See the honesty note below.

---

## Setup

```bash
npm install
cp .env.example .env     # then fill it in — instructions are in the file
npm run dev
```

### What you need to configure yourself

| | Where | Needed for |
|---|---|---|
| **Firebase** | [console.firebase.google.com](https://console.firebase.google.com) | Everything. Auth + database. |
| **Anthropic** | [console.anthropic.com](https://console.anthropic.com) | All AI features. App works without it. |
| **Cloudinary** | [cloudinary.com](https://cloudinary.com) | Screenshot storage. Trades still save without it. |

**Firebase, step by step:**
1. Create a project → Add app → Web. Copy the config values into `.env`.
2. Build → Authentication → Sign-in method → enable **Email/Password**.
3. Authentication → Users → **Add user**. That's your login. There is no
   registration screen in the app, by design.
4. Build → Firestore Database → Create database → **production mode**.
5. Firestore → Rules → paste the contents of [`firestore.rules`](firestore.rules)
   → Publish.

**Cloudinary:** copy your Cloud Name, then Settings → Upload → Add upload
preset → set Signing Mode to **Unsigned** → save, and put the preset name in
`.env`.

### Deploying

```bash
npx vercel
```

Add every `VITE_*` variable from your `.env` under Project → Settings →
Environment Variables. The ASX quote endpoint (`api/quotes.ts`) is a Vercel
serverless function and deploys automatically.

`vercel.json` routes all non-`/api` paths to `index.html` so client-side routes
survive a refresh. The `(?!api/)` in that pattern is load-bearing — without it
the quote endpoint gets rewritten to the SPA and every price lookup silently
returns HTML.

In plain `npm run dev` there's no serverless runtime, so ASX prices won't load
and holdings fall back to cost basis (clearly labelled). Use `npx vercel dev`
to exercise that path locally.

---

## Currency, and why risk is editable

Every R-multiple in this app is `pnl ÷ riskAmount`, which makes `riskAmount` the
number everything else leans on. It used to be derived as `|entry − stop| ×
units`, and that product is denominated in the pair's **quote** currency:

| Pair | Quote | Derived risk |
| --- | --- | --- |
| EUR/AUD | AUD | correct as-is |
| EUR/USD | USD | out by the USD→AUD rate, ~1.5× |
| NZD/JPY | JPY | out by the JPY→AUD rate, ~112× |

A 112× error in the denominator does not look like an error. It looks like
−0.01R, which is a number, and it drags expectancy, every rule comparison and
the whole R distribution toward zero without ever surfacing as a fault.

`src/lib/fx.ts` resolves the rate from what the trade already knows, in
descending order of trust, and reports which branch it used:

1. **A rate stored on the trade.** CMC puts one on the closing row of its
   export, and the CSV importer reads it. Exact.
2. **Quote currency is AUD.** No conversion applies. Exact.
3. **Back-solved from the broker's P&L.** The price move × units is the result
   in the quote currency and the broker's figure is the same result in AUD, so
   their ratio is the rate that was applied. Lands within about a percent —
   it absorbs commission — and is labelled approximate wherever it is shown.
4. **AUD is the base** (AUD/USD, AUD/JPY): the price *is* the AUD→quote rate,
   so its reciprocal converts back. Uses the trade's own price, not the rate at
   settlement, so also approximate.
5. **Otherwise: nothing.** No guess, no default. The UI asks.

There is deliberately no FX feed. A live rate would make a trade closed in June
depend on today's market, which is worse than no rate at all.

Consequences worth knowing:

- **Risk $ is editable** on every trade, open ones included, and R recomputes
  live as you type it. A stored risk is only ever changed by editing it or by
  importing a file that carries one.
- **The trade detail flags a stale figure** — when the stored risk still equals
  stop × units *and* is more than 5× away from the money that actually moved,
  the input goes red and names the currency it is actually in.
- **Data → Risk currency** finds every affected trade at once, shows what each
  becomes and what it does to expectancy, and repairs them on one confirm. It
  writes risk, risk % and R only; P&L and your balance are untouched.
- **The log form withholds the unit-size suggestion** when it cannot determine
  a rate, and asks for one instead. A wrong size suggestion is worse than none,
  because it looks authoritative.

## Things you should know

**Your Anthropic API key ships to the browser.** There's no backend, so the key
is in the bundle and anyone who can open the deployed page can read it from
devtools. That's an acceptable trade for a private single-user tool, but it
means: keep the deployment URL to yourself, set a spend limit on the key, and
rotate it if the URL ever leaks. If you later want this properly locked down,
the fix is to move the Anthropic calls into serverless functions alongside
`api/quotes.ts` — the code in `src/lib/ai.ts` would move almost unchanged.

**Screenshot extraction is good, not perfect.** It reads a clean CMC position
panel reliably. It struggles with low-resolution crops, heavy compression, and
panels showing several positions at once (it takes the first and warns you).
This is why nothing saves without your confirmation and why unread fields stay
blank — a plausible wrong price that looks right is worse than an empty box.

**Chart reading has hard limits, and the prompt enforces them.** A vision model
cannot count how many times a zone has been touched from one screenshot — the
earlier touches are off-screen. It cannot verify 50/200 EMA alignment unless
the EMAs are actually drawn on the chart. It's instructed to say so rather than
guess, and to raise a disagreement only on a clear contradiction. Treat it as a
prompt to look again, not a verdict.

**ASX prices come from Yahoo Finance's undocumented chart endpoint**, proxied
through `api/quotes.ts` because no free ASX API is callable from a browser
(none send CORS headers). Roughly 20 minutes delayed. There is no SLA — it can
break or start rate-limiting without warning, and some codes (LICs, ETFs,
recently renamed tickers) don't resolve. When a price is missing the row falls
back to cost basis and says **no price** rather than showing a stale figure as
current. Fine for tracking a long-term holding; don't trade off it. Swapping
providers means editing only `api/quotes.ts` — keep the response shape.

**P&L for cross pairs is taken from the broker, not computed.** Converting a
GBP/JPY move into AUD needs the AUD/JPY rate at the moment of close, which
isn't recoverable from entry and exit price alone. So the $ figure comes from
CMC (via CSV or typed in) wherever possible, and price-derived P&L is only ever
shown as an estimate. **R-multiple is the primary metric throughout** — `pnl ÷
risk` is exact regardless of quote currency, which is why the dashboard leads
with expectancy in R rather than dollars.

**Sample sizes are shown everywhere, and small ones are visibly dimmed.** A
100% win rate on three trades is noise, and the UI is built to stop that
reading as an edge: breakdown rows under five trades are dimmed, rule
comparisons print "too few" instead of a difference when either side is under
five, and pattern analysis won't run at all under 20 closed trades.

---

## Backing up, exporting and resetting

All of it lives on the **Data** page — its own item in the top nav, between ASX
and Settings. Nothing here is buried in a settings panel, because backing up a
journal is a routine act rather than a preference.

**Export** is the first thing on the page, and everything below it is safer to
reach having been there.

- **JSON** — the complete backup. Every field on every trade, plus holdings and
  your profile. This is what Restore reads.
- **CSV** — trades only, one row each, flattened for a spreadsheet. Rules become
  one column per rule (`followed` / `broken` / blank). Cannot be restored from.

Both download straight to your machine; nothing is uploaded anywhere.

**Import CSV** and **Restore from backup** are both additive and neither can
lose anything. Restore reuses the original document ids, so restoring the same
file twice overwrites rather than duplicating.

**Reset** sits below a rule, at the bottom, and is the only place red appears.
Two options, described in full rather than toggled:

- **Reset the balance, keep the trades** — sets the starting and current balance
  to a new figure and redraws the equity curve from it. Nothing is deleted.
- **Wipe everything and start again** — permanently deletes every trade (and,
  optionally, ASX holdings), then sets the balance.

The destructive option cannot be run until a backup exists — either taken on
this page in the current session, or explicitly confirmed as held elsewhere —
and then requires the exact number of trades about to be deleted typed back.
The counts are shown before the confirmation, so if the number is not the one
you expected, that is the point at which you stop. Firestore has no undo.

Screenshots already uploaded to Cloudinary are not removed by a reset — it
deletes the journal, not the image host.

---

## Migrating from the previous version

Open **Settings → Maintenance**. If any trades are still on the old schema, a
migration panel appears. It:

- maps every v1 field to its v2 equivalent
- matches old free-text checklist entries to the five fixed rule keys by keyword
- leaves anything it can't match **unanswered** rather than guessing — a wrong
  `false` would corrupt the rule analysis
- appends old AI summaries to that trade's notes instead of dropping them
- is idempotent: already-migrated trades are skipped, so it's safe to re-run

Nothing is deleted. The v1 checklist fields are cleared only after their content
has been mapped forward.

There's also a **Recompute balance** action there, if the running balance ever
drifts out of step with your trade history.

---

## Stack

React 18 · TypeScript · Vite · Tailwind · Firebase Auth + Firestore ·
Cloudinary · Anthropic API (`claude-opus-5`) · Recharts · Vercel

Type is Instrument Sans for everything set in the sans and Geist Mono for every
number, both as variable fonts served from the bundle. The design tokens —
palette, elevation, type scale, motion curves — live in `tailwind.config.js`,
and the plane/label/control classes built on them in `src/index.css`.

The model is a single constant at the top of `src/lib/ai.ts` if you want to
change it — pricing at [anthropic.com/pricing](https://www.anthropic.com/pricing).

```
src/
  lib/          calc, fx, edge, ai, csv, images, firebase, migration, serialize
  store/        Auth / Trade / Holdings contexts
  components/   ui, trade, charts, analysis, data, layout, ai
  pages/        Desk, Trades, Analysis, Portfolio, Data, Settings, SignIn
  types/        the whole data model
api/quotes.ts   ASX price proxy (Vercel function)
```

`edge.ts` holds the only confidence-interval implementation in the codebase, on
purpose. It is a seeded percentile bootstrap rather than a t-interval, because
an R distribution built on a trailed stop is a cluster of −1R losses with a thin
right tail, and a t-interval on that is wrong in exactly the direction that
flatters the trader. The seed is fixed so the figure does not drift between
renders. Everything that reports uncertainty — the Desk headline, the Analysis
expectancy, the A/B comparison — goes through it, so two screens can never
disagree about the same trades.

```bash
npm run typecheck   # tsc, no emit
npm run lint        # eslint, zero warnings tolerated
npm run build       # typecheck + production build
```
