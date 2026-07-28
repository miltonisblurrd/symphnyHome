#!/usr/bin/env node
/** Run: node scripts/test-cubby-claude.mjs */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const text = readFileSync(resolve(process.cwd(), ".env"), "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx);
    let value = trimmed.slice(idx + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnv();

const apiKey = process.env.INSPIRED_CLOSETS_ANTHROPIC_API_KEY?.trim();
const model = process.env.INSPIRED_CLOSETS_ANTHROPIC_MODEL?.trim() || "claude-sonnet-5";

console.log("Model:", model);
console.log("API key set:", Boolean(apiKey));

if (!apiKey) {
  console.error("FAIL: INSPIRED_CLOSETS_ANTHROPIC_API_KEY missing");
  process.exit(1);
}

console.log("\n1) Direct Anthropic API test...");
const direct = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  },
  body: JSON.stringify({
    model,
    max_tokens: 50,
    messages: [{ role: "user", content: "Reply with exactly: Cubby live test OK" }],
  }),
});

const directJson = await direct.json();
if (direct.status === 200 && directJson.content?.[0]?.text) {
  console.log("   OK:", directJson.content[0].text.trim());
} else {
  console.log("   FAIL HTTP", direct.status);
  console.log("   ", JSON.stringify(directJson).slice(0, 400));
}

console.log("\n2) Local /api/inspired-closets/cubby test...");
try {
  const res = await fetch("http://127.0.0.1:3000/api/inspired-closets/cubby", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: "Reply with exactly: Cubby API route OK",
      period: "This week",
    }),
  });
  const json = await res.json();
  console.log("   HTTP", res.status);
  console.log("   source:", json.source);
  if (json.error) console.log("   error:", json.error);
  console.log("   answer:", (json.answer ?? "").slice(0, 120));
} catch (e) {
  console.log("   FAIL: dev server not running on :3000");
}
