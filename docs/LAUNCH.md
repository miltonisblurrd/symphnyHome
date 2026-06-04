# Symphony Studio — launch checklist

## Your action items

### Domain & email
1. Add custom domain in Cloudflare → attach to Worker from `wrangler.json`.
2. Set `NEXT_PUBLIC_SITE_URL=https://symphonystudio.io` (or your apex) in Cloudflare env.
3. Configure DNS (apex + `www` redirect to canonical host).
4. Set up `hello@`, `privacy@`, and `legal@` on your domain (Google Workspace, Fastmail, etc.).

### Booking & contact
1. Create a Calendly (or HubSpot) discovery event.
2. Set `NEXT_PUBLIC_BOOKING_URL` to that link.
3. Optional: set `CONTACT_WEBHOOK_URL` to Slack, Zapier, or Formspree endpoint so contact form submissions notify you (otherwise logged server-side).

### Secrets (Cloudflare)
- `ANTHROPIC_API_KEY` — homepage chat
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_BOOKING_URL`
- `CONTACT_WEBHOOK_URL` (optional)

### Legal (attorney review)
Terms and Privacy are drafted for Nevada (`Symphony Studio, LLC`, Clark County venue). **Have a Nevada business attorney review** before treating them as final—especially if you change entity type, add employees, or handle regulated data.

Update in `src/lib/site-config.ts`:
- `legalName` if not an LLC
- `venueCounty` if registered office is not Clark County

### Images
Hero assets live in `public/heroes/`:
- `hero-orchestra-dither-gold.png` — grand hall + dither
- `hero-orchestra-dither-pit.png` — podium / pit
- `hero-orchestra-dither-wide.png` — full orchestra wide
- `public/og-orchestra-dither.png` — social share

Swap filenames in `src/data/marketing-heroes.ts` per page if you add more art.

### Proof video
Drop client-approved testimonial at `public/media/about-testimonial.mp4` or update `src/data/about-content.ts`.

---

## SOC 2 & ISO — what you actually need

**You do not need SOC 2 or ISO certification to launch a marketing site.** Buyers ask when you sell enterprise software that processes *their* data at scale.

| Framework | When it matters | Typical path |
|-----------|-----------------|--------------|
| **SOC 2 Type I** | First enterprise deals ask “do you have SOC 2?” | 3–6 months with Vanta/Drata + auditor; policies + controls snapshot |
| **SOC 2 Type II** | Proof controls work over 6–12 months | Audit period after Type I |
| **ISO 27001** | Global enterprises, EU-heavy deals | Heavier ISMS; often 6–12+ months |

**Practical order for Symphony Studio today:**
1. Ship site + contracts + privacy (done in repo).
2. Use reputable vendors (Cloudflare, Anthropic) with their SOC 2 reports available under NDA.
3. Document your own security story on `/security` (orchestration layer, access, audit)—already on site.
4. When revenue from enterprise clients justifies cost (~$15k–$50k+/year with tooling), start **SOC 2 Type I** via compliance automation (Vanta, Secureframe, Drata).
5. Consider **ISO 27001** only if customers explicitly require it or you expand internationally.

**What helps before certification:**
- Written security & incident response policy (internal doc)
- Subprocessor list (Cloudflare, Anthropic, email provider)
- DPAs with clients who share customer data
- Business insurance (E&O, cyber liability)

---

## Deploy smoke test

```bash
npm run deploy
```

- `/` — chat streams a reply
- `/contact` — form + booking link
- `/terms`, `/privacy` — full legal text
- `/sitemap.xml`, `/robots.txt`
- Share link preview (OG image)
- 404 page
