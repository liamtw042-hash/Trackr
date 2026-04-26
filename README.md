# Trackr — Professional Trading Journal

A full-featured, AI-powered trading journal built with React, Firebase, and Claude. Track every trade, analyse your patterns, and get personalised coaching from AI — all for free.

![Trackr Dashboard](https://via.placeholder.com/1200x600/0a0f1e/3b82f6?text=Trackr+Trading+Journal)

## Features

- **AI Trade Analysis** — Upload a chart screenshot and Claude vision auto-fills trade details and rates the setup against your personal strategy
- **Morning Briefing** — Daily AI summary of your recent performance and what to watch for today
- **Pattern Detection** — Identifies behavioural patterns like "You lose 80% of trades on Fridays"
- **Streak Protection** — Warning when you're on a 3+ loss streak before you submit a new trade
- **Trade Replay** — Compare entry vs exit screenshots with AI execution feedback
- **Weekly Summary** — Auto-generated Monday performance review
- **Full Analytics** — 8 charts including equity curve, drawdown, emotion vs performance, time-of-day analysis
- **Calendar Heatmap** — GitHub-style trading activity grid
- **Milestone Celebrations** — Animated modal on 1st, 10th, 50th, 100th trades and first winning week
- **CSV Export** — Download all trades as a spreadsheet
- **Import Historical Stats** — Bring in your pre-Trackr trading history

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Styling | Tailwind CSS v3 |
| Auth & Database | Firebase (Auth + Firestore + Storage) |
| Charts | Recharts |
| AI | Claude Sonnet 4.6 (Anthropic API) |
| Deployment | Vercel |

---

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- A [Firebase](https://console.firebase.google.com) project
- An [Anthropic API key](https://console.anthropic.com)

### 1. Clone and install

```bash
git clone https://github.com/your-username/trackr.git
cd trackr
npm install
```

### 2. Set up Firebase

1. Go to [Firebase Console](https://console.firebase.google.com) and create a new project
2. Enable **Authentication** → Sign-in method → Email/Password
3. Enable **Firestore Database** → Start in production mode
4. Enable **Storage** (for trade screenshots)
5. Go to Project Settings → Your apps → Add web app → copy the config

#### Firestore Security Rules

In Firebase Console → Firestore → Rules, paste:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /trades/{tradeId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }
  }
}
```

#### Storage Security Rules

In Firebase Console → Storage → Rules, paste:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /screenshots/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### 3. Configure environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Firebase — from your Firebase project settings
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123

# Anthropic — from console.anthropic.com
VITE_ANTHROPIC_API_KEY=sk-ant-...
```

> **Note:** The `VITE_` prefix is required for Vite to expose variables to the browser. Never commit your `.env` file — it's in `.gitignore`.

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Deployment to Vercel

### Option A — Vercel CLI

```bash
npm install -g vercel
vercel
```

### Option B — GitHub integration (recommended)

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import your repo
3. Vercel auto-detects Vite — no build config needed
4. Add your environment variables under **Settings → Environment Variables**:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_ANTHROPIC_API_KEY`
5. Click **Deploy**

The `vercel.json` at the root handles SPA routing so all routes work on refresh.

### Authorised domains

After deploying, add your Vercel domain to Firebase:

Firebase Console → Authentication → Settings → Authorised domains → Add domain

---

## Project Structure

```
src/
├── components/
│   ├── auth/          Login, Register, Onboarding, AuthLayout
│   ├── dashboard/     MorningBriefing, WeeklySummary, PatternInsights,
│   │                  EquityCurve, CalendarHeatmap, MilestoneModal
│   ├── layout/        Layout, Sidebar, Header
│   ├── trades/        AddTradeModal, TradeDetailModal
│   └── shared/        LoadingScreen, ErrorBoundary, SkeletonCard
├── context/
│   ├── AuthContext    Firebase Auth + user profile (Firestore)
│   └── TradeContext   Real-time trade feed + computed stats
├── firebase/
│   └── config.js      Firebase app initialisation
├── hooks/
│   └── useMilestones  Milestone detection + Firestore persistence
├── pages/
│   ├── Dashboard      Stats, charts, AI briefing, heatmap
│   ├── TradeLog       Filterable table, CSV export, detail modal
│   ├── Analytics      8 performance charts + pattern insights
│   └── Settings       Profile, risk, strategy, import, danger zone
├── services/
│   ├── aiService      Claude API: analysis, briefing, patterns, replay
│   └── storageService Firebase Storage upload + image compression
└── utils/
    ├── tradeCalculations  P&L, R-multiple, risk, position size
    ├── strategyParser     Extract rules from plain-text strategy
    └── mergeStats         Combine live + imported historical stats
```

---

## AI Features & API Usage

All AI calls go through `src/services/aiService.js` using `@anthropic-ai/sdk` with `dangerouslyAllowBrowser: true`.

| Feature | Function | When called |
|---|---|---|
| Chart analysis | `analyzeTradeScreenshot` | On screenshot upload in Add Trade |
| Morning briefing | `generateMorningBriefing` | Once per day (cached by date) |
| Weekly summary | `generateWeeklySummary` | Once per week (cached by week) |
| Pattern detection | `detectPatterns` | Once per week (cached by week) |
| Trade replay | `analyzeTradeReplay` | On demand in Trade Detail |

AI calls are cached in `localStorage` to minimise API usage. Briefings are cached for the current day, summaries and patterns for the current week.

> **Production note:** For a production app, AI calls should go through a server-side proxy (Vercel Edge Functions or API routes) to protect your API key. The current browser-side implementation is suitable for personal use.

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | ✓ | Firebase web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | ✓ | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | ✓ | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | ✓ | Firebase Storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | ✓ | Firebase sender ID |
| `VITE_FIREBASE_APP_ID` | ✓ | Firebase app ID |
| `VITE_ANTHROPIC_API_KEY` | ✓ | Anthropic API key for Claude |

---

## Local Development Tips

```bash
# Install dependencies
npm install

# Start dev server (hot reload)
npm run dev

# Production build
npm run build

# Preview production build locally
npm run preview
```

The app runs on port 5173 by default. Firebase emulators are not configured — the app connects to your real Firebase project in all environments.

---

## Licence

MIT — use it, fork it, build on it.
