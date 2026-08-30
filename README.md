# Trackr

A trading journal and portfolio tracker built for one person. Forex CFDs traded
discretionarily on CMC Markets, plus long-term ASX holdings, in one place.

Not a product. No sign-up flow, no marketing pages, no multi-tenancy.

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

## Migrating from the previous version

Open **Settings**. If any trades are still on the old schema, a migration panel
appears. It:

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

The model is a single constant at the top of `src/lib/ai.ts` if you want to
change it — pricing at [anthropic.com/pricing](https://www.anthropic.com/pricing).

```
src/
  lib/          calc, ai, csv, images, firebase, migration, serialize
  store/        Auth / Trade / Holdings contexts
  components/   ui, trade, charts, layout, ai
  pages/        Desk, Trades, Analysis, Portfolio, Settings, SignIn
  types/        the whole data model
api/quotes.ts   ASX price proxy (Vercel function)
```

```bash
npm run typecheck   # tsc, no emit
npm run build       # typecheck + production build
```
