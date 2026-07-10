import type { CalendarPack } from "./calendar.js";

export function buildContentEnginePrompt(topic: CalendarPack, repoRoot: string): string {
  const datePrefix = new Date().toISOString().slice(0, 10);
  const workflowNote =
    topic.workflow === "blog-first"
      ? "Use blog-first workflow: anchor blog.md, supporting guide/faq, then shorter companion youtube-script.md."
      : "Use reference-first workflow: blog.md, guide.md, faq.md, then WWDC youtube-script.md synthesized from all three.";

  return `You are running the Symphony Content Engine for Symphony Studio.

## Skill (read first)
Read and follow exactly:
- ${repoRoot}/.cursor/skills/symphony-content-engine/SKILL.md
- ${repoRoot}/.cursor/skills/symphony-content-engine/reference.md
- ${repoRoot}/.cursor/skills/symphony-content-engine/seo-aeo.md
- ${repoRoot}/.cursor/skills/symphony-content-engine/quality-checklist.md
- ${repoRoot}/.cursor/skills/symphony-content-engine/examples/missing-layer/ (gold tone + SEO reference)

## SEO / AEO / LLM (reference layer — mandatory)
Follow seo-aeo.md for blog.md, guide.md, faq.md, metadata.json:
- Blog: direct answer after H1, TL;DR, question H2s, listicle, table, Key takeaways; cornerstone ≥1,500 words
- FAQ: 14+ questions (cornerstone), direct answer first, question-form H2s
- Guide: HowTo frontmatter, 5+ steps, estimatedMinutes
- metadata.json: secondaryKeywords, aeQueries, readingTimeMinutes, canonicalPath, published, schema

## Brand source (read before writing)
- ${repoRoot}/src/data/studio-data.ts (brand, symphonyModel, philosophy, llmGuidance, services, faq)

## Calendar topic
- id: ${topic.id}
- day: ${topic.day}
- title: ${topic.title}
- type: ${topic.type}
- workflow: ${topic.workflow}
- theme: ${topic.theme} (${topic.themeLabel})
- talkingPoints: ${topic.talkingPoints.join("; ")}
${topic.showNotes?.length ? `- showNotes: ${topic.showNotes.join("; ")}` : ""}

## Workflow
${workflowNote}

## Output directory
Write the full pack ONLY under:
${repoRoot}/content/packs/${datePrefix}-${topic.id}/

Required files:
- blog.md
- guide.md
- faq.md
- youtube-script.md (education-first: ~85% teach / ~15% soft CTA; Acts 1–2 no Symphony pitch; Act 2 beat "What [topic] actually is"; Act 3 land idea then one soft CTA; see SKILL.md + examples/missing-layer/youtube-script.md)
- metadata.json (valid JSON per reference.md schema including SEO fields)
- image-prompts.md (one 16:9 article image prompt per visual-style.md — same image for blog hero, guide thumbnail, /news hero)

## Rules
- Do NOT edit src/, public/, or app routes unless a file must be updated for CTA paths only.
- No fabricated named clients; use composite examples.
- Voice: orchestration not automation/vendor; we orchestrate, we do not sell software/AI.
- youtube-script.md must be written LAST, education-first (not a sales video), and must not contradict blog/guide/faq.
- ${topic.id === "business-has-a-brain" ? "Show MCP behavior on screen, not code." : ""}

## Finish
1. Run quality-checklist mentally and fix gaps.
2. Update ${repoRoot}/.cursor/skills/symphony-content-engine/calendar.json: set pack id "${topic.id}" status to "generated".
3. Reply with: pack path, one-line thesis, and reminder to film youtube-script.md.`;
}
