# QuizPath

Grade 10/11 Science quiz platform — MVP foundation. See `docs/mvp-product-spec.md` for the
product spec and `CLAUDE.md` for stack choices and architecture notes.

## Prerequisites

- Node.js 20+
- A Postgres 16 database
- A [Clerk](https://clerk.com) application with **Google** enabled as the only social
  connection (User & Authentication → Social Connections in the Clerk Dashboard), and
  email/password disabled

## Setup

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL and Clerk keys
npm run db:push              # create tables from src/db/schema.ts
npm run db:seed              # seed the placeholder Science taxonomy (Grade 10 & 11)
npm run dev
```

Open http://localhost:3000 — the landing page doubles as the sign-in screen (marketing
panel + "Continue with Google" side by side); after Google auth you'll land on onboarding
(pick a grade) then the dashboard. The app shell has four sections: Dashboard, Practice
(sub-topic picker + quiz-taking flow, spec section 5), Progress (stats + mastery bar
chart), and Profile (account details, editable grade).

### Running tests

Integration tests run against a separate `quizpath_test` database so they never touch dev
data:

```bash
createdb -U quizpath quizpath_test   # one-time
npm test                             # pushes the schema onto it, then runs vitest
```

### Clerk webhook (optional for local dev)

`/api/webhooks/clerk` keeps the `users` table in sync with Clerk as a backstop; the app also
upserts the user lazily on first request, so the webhook isn't required for the local flow
to work. To wire it up (e.g. via the Clerk Dashboard + a tunnel like ngrok), point a
`user.created`/`user.updated` webhook at that route and set `CLERK_WEBHOOK_SIGNING_SECRET`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm run start` | Production build / start |
| `npm run lint` | ESLint |
| `npm run db:push` | Push `src/db/schema.ts` to Postgres (dev) |
| `npm run db:generate` / `db:migrate` | Generate & apply versioned SQL migrations |
| `npm run db:seed` | Seed the placeholder Science taxonomy + placeholder MCQs |
| `npm run db:studio` | Drizzle Studio (browse the DB) |
| `npm test` | Run the vitest integration suite against `quizpath_test` |

## Feature flags

`PAYWALL_ENABLED` (env var, default `false`) gates the not-yet-built subscription
entitlement checks. The `subscriptions` table exists in the schema but is unused until that
work starts.
