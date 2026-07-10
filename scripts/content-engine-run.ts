#!/usr/bin/env npx tsx
/**
 * Symphony Content Engine — Cursor SDK runner
 *
 * Usage:
 *   CURSOR_API_KEY=cursor_... npm run content:next
 *   npm run content:next -- --topic automation-vs-orchestration
 *   npm run content:next -- --cloud
 *   npm run content:dry-run
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, CursorAgentError } from "@cursor/sdk";
import type { SDKMessage } from "@cursor/sdk";
import {
  findExistingPackDir,
  loadCalendar,
  selectNextTopic,
} from "./content-engine/calendar.js";
import { buildContentEnginePrompt } from "./content-engine/prompt.js";
import { loadDotEnv } from "./content-engine/load-env.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadDotEnv(repoRoot);

function parseArgs(argv: string[]) {
  const flags = {
    dryRun: false,
    cloud: false,
    force: false,
    stream: true,
    topic: undefined as string | undefined,
    repo: process.env.CONTENT_ENGINE_REPO ?? "https://github.com/miltonisblurrd/symphnyHome.git",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--cloud") flags.cloud = true;
    else if (arg === "--force") flags.force = true;
    else if (arg === "--no-stream") flags.stream = false;
    else if (arg === "--topic" || arg === "-t") flags.topic = argv[++i];
    else if (arg === "--repo") flags.repo = argv[++i];
    else if (arg === "--help" || arg === "-h") {
      console.log(`Symphony Content Engine SDK runner

Options:
  --dry-run       Print prompt and topic only; do not call Cursor API
  --cloud         Run on Cursor cloud VM and open a PR (requires repo access)
  --force         Allow regenerating a topic already marked generated
  --no-stream     Use Agent.prompt one-shot instead of streaming
  --topic <id>    Specific calendar id (e.g. automation-vs-orchestration)
  --repo <url>    Git repo URL for cloud mode

Env:
  CURSOR_API_KEY  Required (except --dry-run)
  CONTENT_ENGINE_REPO  Default GitHub URL for --cloud

Scripts:
  npm run content:next
  npm run content:dry-run
`);
      process.exit(0);
    }
  }

  return flags;
}

function printStreamEvent(event: SDKMessage) {
  if (event.type !== "assistant") return;
  for (const block of event.message.content) {
    if (block.type === "text" && block.text) process.stdout.write(block.text);
  }
}

async function runLocalStream(apiKey: string, prompt: string) {
  const agent = await Agent.create({
    apiKey,
    model: { id: "composer-2.5" },
    name: "Symphony Content Engine",
    local: { cwd: repoRoot, settingSources: [] },
  });

  try {
    const run = await agent.send(prompt);
    console.log(`\n[content-engine] run id: ${run.id} agent: ${agent.agentId}\n`);

    for await (const event of run.stream()) {
      printStreamEvent(event);
    }

    const result = await run.wait();
    console.log(`\n\n[content-engine] finished: ${result.status} (${result.durationMs ?? "?"}ms)`);
    if (result.git?.branches?.length) {
      for (const b of result.git.branches) {
        if (b.prUrl) console.log(`[content-engine] PR: ${b.prUrl}`);
      }
    }
    if (result.status === "error") process.exit(2);
  } finally {
    await agent.close();
  }
}

async function runLocalPrompt(apiKey: string, prompt: string) {
  const result = await Agent.prompt(prompt, {
    apiKey,
    model: { id: "composer-2.5" },
    name: "Symphony Content Engine",
    local: { cwd: repoRoot, settingSources: [] },
  });

  console.log(`[content-engine] status: ${result.status}`);
  if (result.result) console.log(result.result);
  if (result.status === "error") process.exit(2);
}

async function runCloud(apiKey: string, prompt: string, repoUrl: string) {
  const result = await Agent.prompt(prompt, {
    apiKey,
    model: { id: "composer-2.5" },
    name: "Symphony Content Engine",
    cloud: {
      repos: [{ url: repoUrl }],
      autoCreatePR: true,
      skipReviewerRequest: true,
    },
  });

  console.log(`[content-engine] cloud status: ${result.status}`);
  if (result.result) console.log(result.result);
  if (result.git?.branches) {
    for (const b of result.git.branches) {
      console.log(`[content-engine] branch: ${b.branch ?? "?"}`);
      if (b.prUrl) console.log(`[content-engine] PR: ${b.prUrl}`);
    }
  }
  if (result.status === "error") process.exit(2);
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const calendar = loadCalendar(repoRoot);
  const topic = selectNextTopic(calendar, {
    topicId: flags.topic,
    includeGenerated: flags.force,
  });

  if (!flags.force && topic.status === "generated") {
    const existing = findExistingPackDir(repoRoot, topic.id);
    if (existing) {
      console.error(
        `Pack already exists: ${existing}\nUse --force to regenerate or pick another --topic.`
      );
      process.exit(1);
    }
  }

  const prompt = buildContentEnginePrompt(topic, repoRoot);

  console.log("[content-engine] topic:", topic.id, "—", topic.title);
  console.log("[content-engine] workflow:", topic.workflow, "| priority:", topic.priority);
  console.log("[content-engine] mode:", flags.cloud ? "cloud+PR" : flags.stream ? "local+stream" : "local+prompt");

  if (flags.dryRun) {
    console.log("\n--- PROMPT (dry run) ---\n");
    console.log(prompt);
    return;
  }

  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey?.trim()) {
    console.error("Missing CURSOR_API_KEY. Get a key from Cursor → Integrations (or team service account).");
    console.error("  export CURSOR_API_KEY='cursor_...'");
    process.exit(1);
  }

  try {
    if (flags.cloud) {
      await runCloud(apiKey.trim(), prompt, flags.repo);
    } else if (flags.stream) {
      await runLocalStream(apiKey.trim(), prompt);
    } else {
      await runLocalPrompt(apiKey.trim(), prompt);
    }

    const updated = loadCalendar(repoRoot);
    const entry = updated.packs.find((p) => p.id === topic.id);
    if (entry?.status === "generated") {
      console.log(`[content-engine] calendar: ${topic.id} → generated`);
    } else {
      console.warn(
        `[content-engine] warning: agent may not have updated calendar.json for ${topic.id}`
      );
    }
  } catch (err) {
    if (err instanceof CursorAgentError) {
      console.error(`[content-engine] startup failed: ${err.message} (retryable=${err.isRetryable})`);
      process.exit(1);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
