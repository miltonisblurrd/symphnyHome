type SlackUser = {
  id: string;
  name: string;
  is_bot?: boolean;
  deleted?: boolean;
  real_name?: string;
  profile?: {
    display_name?: string;
    real_name?: string;
  };
};

const ASSIGNEE_ALIASES: Record<string, string[]> = {
  Frank: ["frank"],
  Des: ["des", "dez"],
  Lulu: ["lulu"],
  Craig: ["craig"],
  Marcus: ["marcus"],
  Gavin: ["gavin"],
};

let cachedUsers: { fetchedAt: number; users: SlackUser[] } | null = null;
const CACHE_MS = 5 * 60 * 1000;

function getSlackConfig() {
  const token = process.env.INSPIRED_CLOSETS_SLACK_BOT_TOKEN?.trim();
  const channel = process.env.INSPIRED_CLOSETS_SLACK_DEFAULT_CHANNEL?.trim();
  if (!token || !channel) return null;
  return { token, channel };
}

function parseUserMapFromEnv(): Record<string, string> {
  const raw = process.env.INSPIRED_CLOSETS_SLACK_USER_MAP?.trim();
  if (!raw) return {};

  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

async function listWorkspaceUsers(token: string): Promise<SlackUser[]> {
  if (cachedUsers && Date.now() - cachedUsers.fetchedAt < CACHE_MS) {
    return cachedUsers.users;
  }

  const users: SlackUser[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL("https://slack.com/api/users.list");
    url.searchParams.set("limit", "200");
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json()) as {
      ok: boolean;
      members?: SlackUser[];
      response_metadata?: { next_cursor?: string };
      error?: string;
    };

    if (!payload.ok) {
      throw new Error(payload.error ?? "Failed to list Slack users");
    }

    users.push(
      ...(payload.members ?? []).filter((member) => !member.is_bot && !member.deleted),
    );
    cursor = payload.response_metadata?.next_cursor || undefined;
  } while (cursor);

  cachedUsers = { fetchedAt: Date.now(), users };
  return users;
}

export async function resolveSlackUserId(assignee: string): Promise<string | null> {
  const config = getSlackConfig();
  if (!config) return null;

  const envMap = parseUserMapFromEnv();
  if (envMap[assignee]) return envMap[assignee];

  try {
    const aliases = ASSIGNEE_ALIASES[assignee] ?? [normalize(assignee)];
    const users = await listWorkspaceUsers(config.token);

    for (const user of users) {
      const candidates = [
        user.name,
        user.real_name,
        user.profile?.display_name,
        user.profile?.real_name,
        user.profile?.real_name?.split(" ")[0],
      ]
        .filter(Boolean)
        .map((value) => normalize(value as string));

      if (aliases.some((alias) => candidates.includes(alias))) {
        return user.id;
      }
    }
  } catch {
    // User lookup is optional — posting to #ops-alerts still works with @Name text.
    return null;
  }

  return null;
}

export type InspiredClosetsNotifyInput = {
  assignee: string;
  title: string;
  severity: string;
  todoLabel: string;
  notifyMessage: string;
  requestedBy?: string;
};

export async function postInspiredClosetsSlackNotification(
  input: InspiredClosetsNotifyInput,
): Promise<{ ok: true; channel: string; mention: string } | { ok: false; error: string }> {
  const config = getSlackConfig();
  if (!config) {
    return { ok: false, error: "Slack is not configured." };
  }

  const slackUserId = await resolveSlackUserId(input.assignee);
  const mention = slackUserId ? `<@${slackUserId}>` : `@${input.assignee}`;
  const requester = input.requestedBy ?? "Gavin";

  const text = [
    `${mention} — action needed from ${requester}'s Ops Hub`,
    "",
    `*${input.title}* (${input.severity.toUpperCase()})`,
    input.todoLabel,
    "",
    input.notifyMessage,
  ].join("\n");

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel: config.channel,
      text,
      mrkdwn: true,
    }),
  });

  const payload = (await response.json()) as {
    ok: boolean;
    channel?: string;
    error?: string;
  };

  if (!payload.ok) {
    return { ok: false, error: payload.error ?? "Slack post failed" };
  }

  return { ok: true, channel: payload.channel ?? config.channel, mention };
}
