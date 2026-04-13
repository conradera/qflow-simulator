This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

**QFlow Simulator** — Smart Virtual Queue Management System (Mukono Health Centre IV). Uses Supabase for persistence and OpenRouter (free models) for AI wait-time estimates.

## Setup (Supabase + OpenRouter)

1. Copy `.env.local.example` to `.env.local` and set:
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from your [Supabase](https://supabase.com) project.
   - `OPENROUTER_API_KEY` from [OpenRouter](https://openrouter.ai) (for AI wait-time estimate).

2. Apply the database schema: in the Supabase dashboard, open **SQL Editor** and run the SQL in `supabase/migrations/20250314000000_initial_schema.sql`. Alternatively, use the Supabase CLI: `supabase db push`.

Without these env vars, the app still runs: queue state is in-memory only and the AI estimate section will show an error.

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
