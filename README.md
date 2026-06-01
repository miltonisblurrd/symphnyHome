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
- **Content source** — [`src/data/studio-data.ts`](src/data/studio-data.ts) (shared with MCP tools and chat)
- **Navigation** — [`src/data/site-nav.ts`](src/data/site-nav.ts)

Brand / Style Guide page is intentionally omitted until the full site design is complete.

## MCP

- **Streamable HTTP:** `GET|POST|DELETE /api/mcp/http`
- **Stdio (local):** `npm run mcp:stdio`
- **Discovery JSON:** `/api/mcp`

## Deploy (Cloudflare Workers via OpenNext)

1. Set secrets/env in Cloudflare (at minimum **`ANTHROPIC_API_KEY`** for `/api/chat`).
2. Build and deploy:

```bash
npm run deploy
```

3. **Smoke test after deploy:**
   - `/` — homepage loads; chat streams a reply
   - `/faq`, `/pricing`, `/solutions` — footer links resolve
   - `/api/mcp/http` — MCP Inspector or compatible client connects
   - `npm run mcp:stdio` — stdio server starts locally

4. Attach your custom domain in the Cloudflare dashboard to the worker defined in [`wrangler.json`](wrangler.json).

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local Next.js dev server |
| `npm run dev:clean` | Clear `.next` and start dev |
| `npm run build` | Production build |
| `npm run deploy` | OpenNext build + Wrangler deploy |
| `npm run mcp:stdio` | Symphony MCP server (stdio) |
