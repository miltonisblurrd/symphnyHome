#!/usr/bin/env node
/**
 * Local Slack notify diagnostic — run: node scripts/test-inspired-closets-notify.mjs
 * Reads .env from project root; does not print tokens.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx);
    let value = trimmed.slice(idx + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

const token = process.env.INSPIRED_CLOSETS_SLACK_BOT_TOKEN?.trim();
const channel = process.env.INSPIRED_CLOSETS_SLACK_DEFAULT_CHANNEL?.trim();

if (!token || !channel) {
  console.error("FAIL: Missing INSPIRED_CLOSETS_SLACK_BOT_TOKEN or DEFAULT_CHANNEL in .env");
  process.exit(1);
}

console.log("1) Testing chat.postMessage (direct)...");
const postRes = await fetch("https://slack.com/api/chat.postMessage", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json; charset=utf-8",
  },
  body: JSON.stringify({
    channel,
    text: "Ops Hub diagnostic — direct postMessage test.",
  }),
});
const postJson = await postRes.json();
console.log(postJson.ok ? "   OK: direct post works" : `   FAIL: ${postJson.error}`);

console.log("2) Testing users.list (optional lookup)...");
const usersRes = await fetch("https://slack.com/api/users.list?limit=5", {
  headers: { Authorization: `Bearer ${token}` },
});
const usersJson = await usersRes.json();
console.log(
  usersJson.ok
    ? "   OK: users.list works"
    : `   WARN: users.list failed (${usersJson.error}) — notify still works with @Name text`,
);

console.log("3) Testing local notify API...");
const notifyRes = await fetch("http://localhost:3000/api/inspired-closets/notify", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    assignee: "Frank",
    title: "Diagnostic test",
    severity: "info",
    todoLabel: "Confirm notify pipeline",
    notifyMessage: "If you see this in #ops-alerts, the dashboard notify path works.",
    requestedBy: "Gavin",
  }),
});
const notifyText = await notifyRes.text();
console.log(`   HTTP ${notifyRes.status}`);
try {
  const notifyJson = JSON.parse(notifyText);
  if (notifyJson.ok) {
    console.log("   OK: notify API works");
  } else if (notifyJson.error) {
    console.log(`   FAIL: ${notifyJson.error}`);
  } else {
    console.log(`   Response: ${notifyText.slice(0, 200)}`);
  }
} catch {
  console.log(`   FAIL: non-JSON response (often middleware redirect / dev not running)`);
  console.log(`   Body: ${notifyText.slice(0, 200)}`);
}
