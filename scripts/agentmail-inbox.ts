// DEEYOUNG PRO — AgentMail receive-side CLI (signup automation support).
// The app's email.ts only SENDS. For account-signup automation we also need:
//   create inbox → poll inbox → extract verification links.
// Zero-dep Bun script. Auth via AGENTMAIL_API_KEY env var (never logged).
//
// Usage:
//   bun scripts/agentmail-inbox.ts list
//   bun scripts/agentmail-inbox.ts create --local deeyoung.alpaca
//   bun scripts/agentmail-inbox.ts poll --inbox deeyoung.alpaca@agentmail.to --match alpaca

const BASE = process.env.AGENTMAIL_API_URL || "https://api.agentmail.to/v0";
const KEY = process.env.AGENTMAIL_API_KEY;

if (!KEY) {
  console.error("AGENTMAIL_API_KEY not set — paste it into .env first");
  process.exit(1);
}

const H = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" } as const;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...H, ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`AgentMail ${path} → ${res.status}: ${body.slice(0, 200)}`);
  return (body ? JSON.parse(body) : {}) as T;
}

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const cmd = process.argv[2];

if (cmd === "list") {
  const org = await api<{ inboxes?: Array<{ inbox_id?: string; email?: string; display_name?: string }> }>("/inboxes");
  for (const ib of org.inboxes ?? []) console.log(`- ${ib.email ?? ib.inbox_id} (${ib.display_name ?? "no name"})`);
  if (!org.inboxes?.length) console.log("(no inboxes yet)");
} else if (cmd === "create") {
  const local = arg("--local") ?? `deeyoung.${Date.now().toString(36)}`;
  const inbox = await api<{ inbox_id?: string; email?: string }>("/inboxes", {
    method: "POST",
    body: JSON.stringify({ local_part: local, display_name: "DeeYoung Pro" }),
  });
  console.log(`created: ${inbox.email ?? inbox.inbox_id}`);
} else if (cmd === "poll") {
  const inbox = arg("--inbox") ?? "";
  const match = (arg("--match") ?? "").toLowerCase();
  if (!inbox) { console.error("--inbox required"); process.exit(1); }
  const msgs = await api<{ messages?: Array<{ inbox_id?: string; message_id?: string; from?: string; subject?: string; timestamp?: string }> }>(
    `/inboxes/${encodeURIComponent(inbox)}/messages`,
  );
  const rows = (msgs.messages ?? []).filter((m) =>
    !match || `${m.subject ?? ""} ${m.from ?? ""}`.toLowerCase().includes(match));
  for (const m of rows) {
    console.log(`- [${m.timestamp ?? "?"}] from=${m.from ?? "?"} subject=${m.subject ?? "?"} id=${m.message_id ?? "?"}`);
  }
  if (!rows.length) console.log("(no matching messages yet)");
} else if (cmd === "delete") {
  const inbox = arg("--inbox") ?? "";
  if (!inbox) { console.error("--inbox required"); process.exit(1); }
  await api(`/inboxes/${encodeURIComponent(inbox)}`, { method: "DELETE" });
  console.log(`deleted: ${inbox}`);
} else if (cmd === "links") {
  // Extract all URLs from a specific message body (verification links)
  const inbox = arg("--inbox") ?? "";
  const messageId = arg("--message") ?? "";
  if (!inbox || !messageId) { console.error("--inbox and --message required"); process.exit(1); }
  const m = await api<{ text?: string; html?: string; subject?: string }>(
    `/inboxes/${encodeURIComponent(inbox)}/messages/${encodeURIComponent(messageId)}`,
  );
  const haystack = `${m.text ?? ""}\n${m.html ?? ""}`;
  const urls = [...haystack.matchAll(/https?:\/\/[^\s"'<>\\)]+/g)].map((u) => u[0]);
  const uniq = [...new Set(urls)].filter((u) => !/\.(png|jpg|jpeg|gif|svg|ico|css|woff2?)/i.test(u));
  console.log(`subject: ${m.subject ?? "?"}`);
  for (const u of uniq) console.log(u);
  if (!uniq.length) console.log("(no links found)");
} else {
  console.log("commands: list | create --local <name> | poll --inbox <email> [--match <substr>] | links --inbox <email> --message <id>");
}
