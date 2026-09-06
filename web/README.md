Gary's web app uses Next.js. Follow the repository's `AGENTS.md` and the installed Next docs before changing rendering or deployment behavior.

## Database outages and deployment builds

Public database reads in `lib/gary/supabase.ts` wait for a request through
`connection()`. Their explicit Next fetch cache remains enabled, including
last-good responses during failed background refreshes. Data-backed pages
render at request time; builds do not require a healthy production database.

Database-backed sitemaps use `app/sitemap-data/[inventory]/route.ts` with an
empty `generateStaticParams()` list and ten-minute ISR. The public archive,
index, and game-shard URLs rewrite to this route. They generate on first
request and keep their last successful XML if regeneration fails. A cold
outage must return an error, never a successful empty inventory. Do not move
these back into build-time metadata generators: Next 16.3 can also classify
prerendered `.xml` outputs as static files and discard their ISR interval.

Run `npm run smoke:sitemaps` from the repository root. It builds a disposable
copy with a local database returning HTTP 503, verifies cold failures, primes
real XML, checks last-good data during a second outage, and confirms new dates
appear after recovery. The test shortens cache intervals only in that copy,
uses dummy credentials and Next's font fixture hook, and cleans up its servers.
CI runs it alongside the normal web unit, type, and fixture-page checks.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
