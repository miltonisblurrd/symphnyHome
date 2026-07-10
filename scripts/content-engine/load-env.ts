import fs from "node:fs";
import path from "node:path";

/** Load .env.local then .env without overwriting existing process.env. */
export function loadDotEnv(repoRoot: string) {
  for (const file of [".env.local", ".env"]) {
    const full = path.join(repoRoot, file);
    if (!fs.existsSync(full)) continue;

    const text = fs.readFileSync(full, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;

      const key = trimmed.slice(0, eq).trim();
      if (process.env[key] !== undefined) continue;

      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}
