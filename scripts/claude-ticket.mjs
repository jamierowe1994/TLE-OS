#!/usr/bin/env node
/**
 * The two calls a Send to Claude session makes to the OS (docs/CLAUDE-TICKETS.md,
 * lib/claude-tickets.ts). Reads OS, ID and TOKEN from the environment so the
 * token never sits on a command line or in a file.
 *
 *   node scripts/claude-ticket.mjs read                 → ticket.json + shot.jpg (if any)
 *   node scripts/claude-ticket.mjs report <state> <note-file> [pr-url] [branch] [reply-file]
 *
 * state is fix_ready, needs_you or not_a_bug. Node 20+ (global fetch).
 */
import { readFileSync, writeFileSync } from "node:fs";

const { OS, ID, TOKEN } = process.env;
if (!OS || !ID || !TOKEN) {
  console.error("Set OS, ID and TOKEN from the message that started this session.");
  process.exit(2);
}
const [cmd, ...args] = process.argv.slice(2);

if (cmd === "read") {
  const res = await fetch(`${OS}/api/bugs/claude?id=${encodeURIComponent(ID)}&t=${encodeURIComponent(TOKEN)}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.ok) {
    console.error(`The OS said ${res.status}: ${j.error ?? "no answer"}`);
    process.exit(1);
  }
  const { shot, ...ticket } = j.ticket;
  if (typeof shot === "string" && shot.startsWith("data:image/")) {
    writeFileSync("shot.jpg", Buffer.from(shot.split(",")[1], "base64"));
    ticket.shot = "shot.jpg";
  }
  writeFileSync("ticket.json", JSON.stringify(ticket, null, 2));
  console.log(`ticket.json written${ticket.shot ? ", screen saved as shot.jpg" : ", no screenshot"}; ${ticket.media.length} attachment(s).`);
} else if (cmd === "report") {
  const [state, noteFile, pr = "", branch = "", replyFile = ""] = args;
  if (!["fix_ready", "needs_you", "not_a_bug"].includes(state ?? "") || !noteFile) {
    console.error("report <fix_ready|needs_you|not_a_bug> <note-file> [pr-url] [branch] [reply-file]");
    process.exit(2);
  }
  const body = {
    id: ID,
    t: TOKEN,
    state,
    note: readFileSync(noteFile, "utf8"),
    pr,
    branch,
    reply: replyFile ? readFileSync(replyFile, "utf8") : "",
  };
  const res = await fetch(`${OS}/api/bugs/claude`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.ok) {
    console.error(`The OS said ${res.status}: ${j.error ?? "no answer"}`);
    process.exit(1);
  }
  console.log(`Reported ${state}.`);
} else {
  console.error("read | report");
  process.exit(2);
}
