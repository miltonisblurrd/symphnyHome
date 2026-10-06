This is a [Next.js](https://nextjs.org) project for Symphony Studio — marketing site, homepage chat, and MCP server.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Use `npm run dev:clean` if you see missing chunk errors after a config change (`rm -rf .next` then dev).

## Site structure

- **Home** (`/`) — hero, chat, MCP note
- **Marketing pages** — under `src/app/(site)/` (About, Pricing, Solutions, FAQ, etc.)
- **Content source** — `[src/data/studio-data.ts](src/data/studio-data.ts)` (shared with MCP tools and chat)
- **Navigation** — `[src/data/site-nav.ts](src/data/site-nav.ts)`

Brand / Style Guide page is intentionally omitted until the full site design is complete.

## MCP

- **Streamable HTTP:** `GET|POST|DELETE /api/mcp/http`
- **Stdio (local):** `npm run mcp:stdio`
- **Discovery JSON:** `/api/mcp`

## Deploy (Vercel)

1. Set environment variables in the Vercel project (at minimum `ANTHROPIC_API_KEY` for `/api/chat`).
2. Deploy:

```bash
npm run deploy
```

Production deploys also run when `main` is pushed, if the GitHub repo is connected to Vercel.

1. **Smoke test after deploy:**
  - `/` — homepage loads; chat streams a reply
  - `/faq`, `/pricing`, `/solutions` — footer links resolve
  - `/api/mcp/http` — MCP Inspector or compatible client connects
  - `npm run mcp:stdio` — stdio server starts locally
2. Attach the custom domain in the Vercel project settings.
3. Set environment variables (see `[docs/LAUNCH.md](docs/LAUNCH.md)`):
  - `NEXT_PUBLIC_SITE_URL`
  - `NEXT_PUBLIC_BOOKING_URL`
  - `ANTHROPIC_API_KEY`
  - `CONTACT_WEBHOOK_URL` (optional)

## Hero images

Orchestra + dithered-code heroes are in `public/heroes/`. Per-page assignment is in `[src/data/marketing-heroes.ts](src/data/marketing-heroes.ts)`.

## Legal

Full Terms and Privacy (Nevada) are at `/terms` and `/privacy`. Source: `[src/data/legal-content.ts](src/data/legal-content.ts)`. Have an attorney review before production reliance.

## Content Engine

Blog, guide, FAQ, and YouTube scripts from a 30-day calendar. Skill: `.cursor/skills/symphony-content-engine/`. SDK runner: `[content/README.md](content/README.md)` (`npm run content:next`).

## Scripts


| Command             | Purpose                          |
| ------------------- | -------------------------------- |
| `npm run dev`       | Local Next.js dev server         |
| `npm run dev:clean` | Clear `.next` and start dev      |
| `npm run build`     | Production build                 |
| `npm run deploy`    | Production deploy on Vercel      |
| `npm run mcp:stdio` | Symphony MCP server (stdio)      |


