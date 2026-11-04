#!/usr/bin/env node
/**
 * The two calls a Send to Claude session makes to the OS (docs/CLAUDE-TICKETS.md,
 * lib/claude-tickets.ts). Reads OS, ID and TOKEN from the environment so the
 * token never sits on a command line or in a file.
 *
 *   node scripts/claude-ticket.mjs read                 → ticket.json + shot.jpg (if any)
 *   node scripts/claude-ticket.mjs report <state> <note-file> [pr-url] [branch] [reply-file]
 *        [--shot picture]... [--do /screen/path --point data-steve-handle --label "Button Words"]
 *
 * state is fix_ready, needs_you or not_a_bug. Each --shot (PNG, JPEG or WebP,
 * up to four) is put on the ticket first, so James sees them with the report.
 * --do names the screen (and --point the button) the answer is about: the
 * ticket's Do It opens it with Steve's guide on that button.
 * Node 20+ (global fetch, FormData and Blob).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

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
  const shots = [];
  const plain = [];
  const doIt = { path: "", point: "", label: "" };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--shot") shots.push(args[++i]);
    else if (args[i] === "--do") doIt.path = args[++i] ?? "";
    else if (args[i] === "--point") doIt.point = args[++i] ?? "";
    else if (args[i] === "--label") doIt.label = args[++i] ?? "";
    else plain.push(args[i]);
  }
  const [state, noteFile, pr = "", branch = "", replyFile = ""] = plain;
  if (!["fix_ready", "needs_you", "not_a_bug"].includes(state ?? "") || !noteFile) {
    console.error("report <fix_ready|needs_you|not_a_bug> <note-file> [pr-url] [branch] [reply-file] [--shot picture]...");
    process.exit(2);
  }
  for (const file of shots.filter(Boolean)) {
    const ext = file.toLowerCase().split(".").pop();
    const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    const form = new FormData();
    form.set("id", ID);
    form.set("t", TOKEN);
    form.set("file", new Blob([readFileSync(file)], { type }), basename(file));
    const res = await fetch(`${OS}/api/bugs/claude/shot`, { method: "POST", body: form });
    const j = await res.json().catch(() => ({}));
    console.log(res.ok && j.ok ? `Picture ${file} added.` : `Picture ${file} not added: ${j.error ?? res.status}`);
  }
  const body = {
    id: ID,
    t: TOKEN,
    state,
    note: readFileSync(noteFile, "utf8"),
    pr,
    branch,
    reply: replyFile ? readFileSync(replyFile, "utf8") : "",
    do: doIt.path ? doIt : null,
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
