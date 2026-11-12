"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Pill } from "@/components/Wire";
import { useNewLook } from "@/lib/use-new-look";
import TicketsNew, { LETTERS, type Bug } from "@/components/new-look/admin/TicketsNew";

/**
 * Tickets: what the pilot agents raise, sorted the way James sorts it.
 *
 *   A  broken - the bot found a fault, or a person says it is
 *   B  a decision, or anything that is not plainly broken
 *   C  a recommendation
 *
 * James, 22 Sep 2026: "if it's a recommendation, it should go as a C.
 * Anything that's broken needs to go as an A, and anything else can go
 * later." The letter is set from the bot's verdict and the kind of report
 * (lib/pilot priorityFor) and changed here by hand. State is the same as on
 * Pre-launch: open, acknowledged, fixed (the reporter is told), won't fix.
 */

const when = (iso: string | null | undefined) =>
  !iso ? "—" : new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/* "Claude" for a ticket sent with Send to Claude (lib/claude-tickets, 4 Nov
   2026), "Bot" for what the old hourly bug bot left on older ones. */
const verdict = (b: Bug) => {
  const who = b.claudeUrl || b.botState === "with_claude" ? "Claude" : "Bot";
  return b.botState === "with_claude" ? "With Claude"
    : b.botState === "looking" ? "Bot is looking"
    : b.botState === "to_fix" ? `${who}: cause found, to fix`
    : b.botState === "fix_ready" && b.state === "fixed" && b.context?.pushedAt ? `${who}: fixed, and live`
    : b.botState === "fix_ready" && b.context?.pushedAt ? `${who}: fix pushed, going live`
    : b.botState === "fix_ready" ? `${who}: fix ready for you to push`
    : b.botState === "needs_you" ? `${who}: needs you`
    : b.botState === "not_a_bug" ? `${who}: not a fault`
    : "";
};


/* A first, then anything not sorted yet, then B and C (James, 15 Oct 2026:
   Richard Callow raised four and none showed). Unsorted went last, under
   every recommendation, so a new ticket never reached the top six on Admin
   or the top of Tickets until the bot had looked at it. */
const TICKET_RANK: Record<string, number> = { A: 0, none: 1, B: 2, C: 3 };

/* Review Later (James, 12 Nov 2026): a ticket given a day sits under Later
   until that day (London), then it is back in Open by itself. */
const londonDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const reviewAtOf = (b: Bug): string | null => {
  const d = b.context?.reviewAt;
  return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
};
const isLater = (b: Bug, today = londonDay()) => {
  const d = reviewAtOf(b);
  return Boolean(d && d > today) && (b.state === "open" || b.state === "ack");
};

export default function Tickets() {
  const [bugs, setBugs] = useState<Bug[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /* Send to Claude (lib/claude-tickets): shown only to the person whose plan
     it runs on, live once the routine is wired up on Railway. canPush: Push
     It Live can merge Claude's fix itself, once GitHub's key is there too. */
  const [claude, setClaude] = useState<{ canSend: boolean; ready: boolean; canPush: boolean }>({ canSend: false, ready: false, canPush: false });
  const [claudeSaid, setClaudeSaid] = useState<Record<string, string>>({});
  const [pushSaid, setPushSaid] = useState<Record<string, string>>({});
  const [show, setShow] = useState<"open" | "later" | "all">("open");
  const [letter, setLetter] = useState<"A" | "B" | "C" | "none" | "all">("all");

  const load = () =>
    fetch("/api/bugs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { bugs: Bug[]; claude?: { canSend: boolean; ready: boolean; canPush?: boolean } }) => {
        setBugs(j.bugs);
        if (j.claude) setClaude({ canSend: j.claude.canSend, ready: j.claude.ready, canPush: Boolean(j.claude.canPush) });
      })
      .catch(() => setErr("Couldn't load the tickets."));
  useEffect(() => { void load(); }, []);

  /* Their screen and what they added, here rather than on Pre-launch (James,
     2 Oct 2026: "I have to go to pre-launch to sort the tickets"). Both are
     fetched when asked for: a screenshot each would make the list heavy, and
     recording links last five minutes (lib/bug-media). */
  const [shots, setShots] = useState<Record<string, string | null>>({});
  const [media, setMedia] = useState<Record<string, Array<{ id: string; mime: string; url: string; source?: "reporter" | "claude" }> | null>>({});
  async function loadShot(id: string) {
    if (id in shots) return;
    /* "" while it loads, null when there is none, else the picture. */
    setShots((m) => ({ ...m, [id]: "" }));
    const j = await fetch(`/api/admin/bug-shot?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    setShots((m) => ({ ...m, [id]: j?.shot ?? null }));
  }
  async function loadMedia(id: string) {
    setMedia((m) => ({ ...m, [id]: null }));
    const j = await fetch(`/api/bugs/media?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    setMedia((m) => ({ ...m, [id]: j?.media ?? [] }));
  }

  /* /admin/tickets?open=<id> lands on one ticket with its screen showing -
     the link the bug emails now carry. */
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setOpenId(new URLSearchParams(window.location.search).get("open"));
  }, []);
  useEffect(() => {
    if (!bugs || !openId) return;
    const b = bugs.find((x) => x.id === openId);
    if (!b) return;
    if (b.state === "fixed" || b.state === "wontfix") setShow("all");
    else if (isLater(b)) setShow("later");
    void loadShot(openId);
    window.setTimeout(() => document.getElementById(`ticket-${openId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bugs, openId]);

  /* Claude's own pictures of a fix show with its report, without a press:
     the report is the overview James reads instead of opening the session
     (4 Nov 2026). Their links last five minutes, so they load with the page. */
  useEffect(() => {
    if (!bugs) return;
    for (const b of bugs) {
      if ((b.claudeShots ?? 0) > 0 && b.claudeUrl && (b.state === "open" || b.state === "ack") && !(b.id in media)) void loadMedia(b.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bugs]);

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch("/api/bugs", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...body }) });
    await load();
  }

  /* One press: the ticket goes to a Claude Code session on James's own plan
     and leaves the open list until Claude has something for him. What went
     wrong, if anything, is said on the ticket itself. */
  async function sendToClaude(id: string) {
    setClaudeSaid((m) => ({ ...m, [id]: "Sending…" }));
    const j = await fetch("/api/bugs/claude", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) })
      .then((r) => r.json().catch(() => ({ ok: false })))
      .catch(() => ({ ok: false })) as { ok?: boolean; error?: string };
    setClaudeSaid((m) => ({ ...m, [id]: j.ok ? "" : j.error || "Couldn't send it to Claude." }));
    await load();
  }

  /* Push It Live: Claude's pull request merged from here (lib/github-pr), so
     the fix deploys and the ticket closes itself when it boots. */
  async function pushClaude(id: string) {
    setPushSaid((m) => ({ ...m, [id]: "Pushing…" }));
    const j = await fetch("/api/bugs/claude/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) })
      .then((r) => r.json().catch(() => ({ ok: false })))
      .catch(() => ({ ok: false })) as { ok?: boolean; error?: string };
    setPushSaid((m) => ({ ...m, [id]: j.ok ? "" : j.error || "Couldn't push it." }));
    await load();
  }

  /* The new look (lib/new-look "admin", 24 Oct 2026). Null until known. */
  const look = useNewLook("admin");
  if (look === null) return <p className="mt-6 text-[12.5px] text-muted">Loading the tickets…</p>;
  if (look && (err || !bugs)) return <TicketsNew state={err ? { err, retry: () => { setErr(null); void load(); } } : "loading"} />;

  if (err) return <p className="mt-6 text-[12.5px] text-accent-dark">{err}</p>;
  if (!bugs) return <p className="mt-6 text-[12.5px] text-muted">Loading the tickets…</p>;

  /* People first, then what the OS logged about itself. */
  const people = bugs.filter((b) => b.kind !== "auto");
  const auto = bugs.filter((b) => b.kind === "auto");
  const today = londonDay();
  const pick = (list: Bug[]) =>
    list
      .filter((b) => (show === "all" ? true : show === "later" ? isLater(b, today) : (b.state === "open" || b.state === "ack") && !isLater(b, today)))
      .filter((b) => (letter === "all" ? true : letter === "none" ? !b.priority : b.priority === letter))
      .sort((a, b) => TICKET_RANK[a.priority ?? "none"] - TICKET_RANK[b.priority ?? "none"] || b.createdAt.localeCompare(a.createdAt));
  /* The counts are what is in front of James now: not what he put off till later. */
  const now = people.filter((b) => b.state !== "fixed" && b.state !== "wontfix" && !isLater(b, today));
  const counts = { A: now.filter((b) => b.priority === "A").length,
                   B: now.filter((b) => b.priority === "B").length,
                   C: now.filter((b) => b.priority === "C").length,
                   none: now.filter((b) => !b.priority).length };
  const laterCount = bugs.filter((b) => isLater(b, today)).length;

  if (look) {
    return (
      <TicketsNew
        state={{ people, auto, pick, counts, laterCount, show, setShow, letter, setLetter, shots, media, loadShot, loadMedia, openId, patch, verdict, claude, claudeSaid, sendToClaude, pushSaid, pushClaude }}
      />
    );
  }

  const row = (b: Bug) => (
    <li key={b.id} id={`ticket-${b.id}`} className={`rounded-xl border p-3 ${b.id === openId ? "border-accent-dark ring-2 ring-accent-dark/20" : "border-line/70"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
            <Pill tone={b.priority === "A" ? "accent" : "neutral"}>{b.priority ? `${b.priority} · ${LETTERS.find((l) => l.id === b.priority)?.sub}` : "Not sorted"}</Pill>
            <Pill tone={b.state === "open" ? "accent" : "neutral"}>{b.state === "ack" ? "acknowledged" : b.state}</Pill>
            <span className="text-muted">
              {b.kind === "auto" ? `${b.path || "on the server"}${(b.occurrences ?? 1) > 1 ? ` · seen ${b.occurrences} times` : ""}` : `${b.kind} · ${b.reporterEmail || "—"} on ${b.path || "—"}`}
              {b.media ? ` · ${b.media} attached` : ""}
            </span>
          </div>
          <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed">{b.body}</p>
          {b.botState && (
            <p className={`mt-1.5 text-[11.5px] leading-relaxed ${b.botState === "to_fix" || b.botState === "fix_ready" ? "text-emerald-900" : b.botState === "needs_you" ? "text-amber-900" : "text-muted"}`}>
              <span className="font-semibold">{verdict(b)}</span>
              {b.botAt ? ` · ${when(b.botAt)}` : ""}
              {b.botNote ? ` - ${b.botNote.split("\n")[0]}` : ""}
            </p>
          )}
        </div>
        <span className="shrink-0 text-[11px] text-muted">{when(b.lastSeenAt && b.lastSeenAt !== b.createdAt ? b.lastSeenAt : b.createdAt)}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11.5px]">
        {LETTERS.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => void patch(b.id, { priority: b.priority === l.id ? null : l.id })}
            className={`rounded-full border px-2.5 py-1 font-semibold transition-colors ${b.priority === l.id ? "border-ink bg-ink text-page" : "border-line/80 hover:border-ink/40"}`}
            title={l.sub}
          >
            {l.label}
          </button>
        ))}
        <span className="mx-1 text-muted">·</span>
        {(["open", "ack", "fixed", "wontfix"] as const).filter((s) => s !== b.state).map((s) => (
          <button key={s} type="button" onClick={() => void patch(b.id, { state: s })} className="rounded-full border border-line/80 px-2.5 py-1 transition-colors hover:border-ink/40">
            {s === "ack" ? "Acknowledge" : s === "fixed" ? "Fixed, tell them" : s === "wontfix" ? "Won't fix" : "Reopen"}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-3">
          {!(b.id in shots) && (
            <button type="button" onClick={() => void loadShot(b.id)} className="text-muted underline underline-offset-2 hover:text-ink">
              See their screen
            </button>
          )}
          {(b.media ?? 0) > 0 && !media[b.id] && (
            <button type="button" onClick={() => void loadMedia(b.id)} className="font-semibold text-accent-dark underline underline-offset-2">
              {b.id in media ? "Opening…" : `Watch what they added (${b.media})`}
            </button>
          )}
        </span>
      </div>
      {b.id in shots &&
        (shots[b.id] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shots[b.id]!} alt={`The screen when ${b.reporterEmail || "the OS"} reported this`} className="mt-3 w-full rounded-lg border border-line/70" />
        ) : (
          <p className="mt-2 text-[11px] text-muted">{shots[b.id] === "" ? "Opening their screen…" : "No picture with this one."}</p>
        ))}
      {media[b.id] &&
        (media[b.id]!.length ? (
          <div className="mt-3 space-y-2">
            {media[b.id]!.map((m) =>
              m.mime.startsWith("video/") ? (
                <video key={m.id} src={m.url} controls playsInline className="w-full rounded-lg border border-line/70" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={m.id} src={m.url} alt={`Added by ${b.reporterEmail}`} className="w-full rounded-lg border border-line/70" />
              )
            )}
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-muted">What they added could not be opened.</p>
        ))}
    </li>
  );

  return (
    <>
      <h1 className="hand text-[24px] leading-tight">Tickets</h1>
      <p className="mt-1 text-[12.5px] text-muted">
        What people raise. A is broken, C is a recommendation, B is everything else. The bot sorts a fault when it has looked; an idea is a C the moment it lands. Change a letter by pressing it.
      </p>

      <div className="fade-up mt-4 grid gap-3 sm:grid-cols-4">
        {(["A", "B", "C", "none"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setLetter(letter === k ? "all" : k)}
            className={`rounded-[18px] border p-4 text-left transition-colors ${letter === k ? "border-ink" : "border-line/50 bg-white hover:border-ink/30"}`}
          >
            <p className="text-[11px] uppercase tracking-wide text-muted">{k === "none" ? "Not sorted" : `${k} · ${LETTERS.find((l) => l.id === k)?.sub}`}</p>
            <p className="hand mt-1 text-[26px] leading-none">{counts[k]}</p>
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 text-[12px]">
        <button type="button" onClick={() => setShow("open")} className={`rounded-full border px-3 py-1 ${show === "open" ? "border-ink bg-ink text-page" : "border-line/80"}`}>Open</button>
        <button type="button" onClick={() => setShow("later")} className={`rounded-full border px-3 py-1 ${show === "later" ? "border-ink bg-ink text-page" : "border-line/80"}`}>Later ({laterCount})</button>
        <button type="button" onClick={() => setShow("all")} className={`rounded-full border px-3 py-1 ${show === "all" ? "border-ink bg-ink text-page" : "border-line/80"}`}>Everything</button>
      </div>

      <section className="fade-up mt-4 rounded-[22px] border border-line/50 bg-white p-5">
        <h2 className="hand text-[17px] leading-tight">Raised by people</h2>
        {pick(people).length === 0 ? (
          <p className="mt-2 text-[12.5px] text-muted">Nothing here. Steve sits in the bottom-right of every screen; what they report through him lands here.</p>
        ) : (
          <ul className="mt-3 space-y-2">{pick(people).map(row)}</ul>
        )}
      </section>

      <section className="fade-up mt-4 rounded-[22px] border border-line/50 bg-white p-5">
        <h2 className="hand text-[17px] leading-tight">Logged by the OS itself</h2>
        {pick(auto).length === 0 ? (
          <p className="mt-2 text-[12.5px] text-muted">Nothing open.</p>
        ) : (
          <ul className="mt-3 space-y-2">{pick(auto).map(row)}</ul>
        )}
      </section>
    </>
  );
}
