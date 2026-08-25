# 🛒 Carrito — Sprint Capacity & Carry‑over Planning

Carrito helps the **Salesforce Platform (MSP) support team** get a realistic picture of sprint
capacity when ad‑hoc, high‑priority work keeps interrupting the plan. It imports ADO (Azure DevOps)
user stories, tracks carry‑over, models PTO + public holidays across a distributed team, and computes
current vs. free capacity for the next sprint — with configurable agile parameters and branded reporting.

## Features

- **ADO CSV import/export** — flexible column mapping, upsert by work‑item ID, automatic carry‑over
  detection, ADO‑compatible and enriched CSV exports.
- **Capacity engine** — per‑member available person‑days = working days − PTO − public holidays,
  × focus factor × seniority modifier; rolled up to a story‑point capacity. Free capacity =
  capacity − committed − carry‑over.
- **PTO & holiday calendar** — per‑member country public holidays (auto) + manual company holidays;
  both reduce capacity and drive UI awareness warnings.
- **Awareness triggers** — over‑commitment, capacity drop vs. a full sprint, member below minimum,
  PTO clustering, high carry‑over ratio — all thresholds configurable.
- **Admin** — team & members (role, seniority, country), roles/seniorities, all agile parameters,
  and company branding (logo + colors) applied to the UI and PDF exports.
- **Reports** — dashboards (velocity, carry‑over trend, capacity vs. commitment), ad‑hoc queries,
  and a branded **PDF** export for the client.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Ant Design v5 · Ant Design Charts · Supabase
(Postgres + Auth + Storage) · `@react-pdf/renderer` · deployed on Vercel.

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in the values (see below)
npm run dev
```

### Environment variables

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable (`sb_publishable_…`) or legacy anon key. Public by design; RLS protects data. |
| `NEXT_PUBLIC_SITE_URL` | Absolute site URL (used by the PDF route). `http://localhost:3000` locally. |

## Database

Run the migration once in **Supabase → SQL Editor**:

```
supabase/migrations/0001_init.sql
```

It creates all tables, row‑level‑security policies, triggers (carry‑over detection, updated_at),
a public `branding` storage bucket, and seed data (default roles, seniorities, settings).

### Bootstrap the first admin

1. Start the app and **Sign up** with your email (creates a `profiles` row automatically).
2. In the SQL Editor, promote yourself (the migration already includes this line — edit the email):

```sql
update public.profiles set role = 'admin' where email = 'you@company.com';
```

Admins can then manage the team, parameters, and branding from the **Admin** section.

## Deploy (Vercel)

1. Push to GitHub, import the repo in Vercel (framework auto‑detected as Next.js).
2. Set the three env vars above for Production/Preview/Development.
3. In **Supabase → Authentication → URL Configuration**, add your Vercel URL to the redirect list
   and set the Site URL.

## Project layout

```
app/                 App Router routes (auth, dashboard, sprints, backlog, calendar, reports, admin)
components/           UI components (layout shell, charts, feature clients)
lib/
  capacity/          Pure capacity engine + DB orchestration
  ado/               ADO CSV parse / export / upsert
  data/              Server data queries & aggregation
  supabase/          Browser/server clients + middleware
  auth/              Profile + role guards
  pdf/               Branded PDF report
supabase/migrations/ SQL schema + RLS
```
