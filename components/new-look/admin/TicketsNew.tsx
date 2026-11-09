"use client";

import { useState } from "react";
import FloatSheet, { FloatCard, FloatFoot } from "@/components/new-look/FloatSheet";
import { Badge, type Tone } from "@/components/new-look/Parts";
import { ErrorLine, Loading, Section, Tab, nd, when } from "@/components/new-look/admin/bits";

/**
 * Admin > Issues > Tickets in the new look (24 Oct 2026). A broken, B
 * everything else, C a recommendation, as the old page. The list, the counts,
 * the letters, the states, their screen and what they added all come from the
 * page (app/(os)/admin/tickets) and go back through its own calls.
 */

export type Bug = {
  id: string;
  reporterEmail: string;
  body: string;
  path: string;
  kind: string;
  state: string;
  createdAt: string;
  occurrences?: number;
  lastSeenAt?: string | null;
  botState?: string;
  botNote?: string;
  botAt?: string | null;
  media?: number;
  priority: "A" | "B" | "C" | null;
  botPr?: string;
  context?: Record<string, unknown> | null;
  /** The claude.ai session it was sent to (lib/claude-tickets). */
  claudeUrl?: string;
  /** Pictures Claude put on it to show its fix. */
  claudeShots?: number;
};

export const LETTERS: Array<{ id: "A" | "B" | "C"; label: string; sub: string }> = [
  { id: "A", label: "A", sub: "Broken" },
  { id: "B", label: "B", sub: "Later" },
  { id: "C", label: "C", sub: "Recommendation" },
];

type Letter = "A" | "B" | "C" | "none" | "all";
type Media = Array<{ id: string; mime: string; url: string; source?: "reporter" | "claude" }>;

type Ready = {
  people: Bug[];
  auto: Bug[];
  pick: (list: Bug[]) => Bug[];
  counts: Record<"A" | "B" | "C" | "none", number>;
  show: "open" | "all";
  setShow: (v: "open" | "all") => void;
  letter: Letter;
  setLetter: (v: Letter) => void;
  shots: Record<string, string | null>;
  media: Record<string, Media | null>;
  loadShot: (id: string) => Promise<void>;
  loadMedia: (id: string) => Promise<void>;
  openId: string | null;
  patch: (id: string, body: Record<string, unknown>) => Promise<void>;
  verdict: (b: Bug) => string;
  /** Send to Claude (lib/claude-tickets): who may press it, whether it is wired up, and whether Push It Live can merge. */
  claude: { canSend: boolean; ready: boolean; canPush: boolean };
  /** What went wrong on a press, by ticket; "Sending…" while it goes. */
  claudeSaid: Record<string, string>;
  sendToClaude: (id: string) => Promise<void>;
  /** Push It Live (lib/github-pr): what went wrong, by ticket; "Pushing…" while it goes. */
  pushSaid: Record<string, string>;
  pushClaude: (id: string) => Promise<void>;
};

/* Claude's report, in the parts docs/CLAUDE-TICKETS.md asks it for (James,
   4 Nov 2026: "an overview of what they fixed, how they fixed it"). A note
   without them, an older one or the bug bot's, shows as it came. */
const PARTS: Array<{ label: string; starts: RegExp }> = [
  { label: "What Was Wrong", starts: /^what was wrong\b/i },
  { label: "What Claude Changed", starts: /^what i changed\b/i },
  { label: "Check Once It's Live", starts: /^check once it'?s live\b/i },
  { label: "What Claude Couldn't Check", starts: /^i couldn'?t check\b/i },
];

function reportParts(note: string): { lead: string; parts: Array<{ label: string; text: string }>; rest: string } {
  const [first = "", ...lines] = note.trim().split("\n");
  const parts: Array<{ label: string; text: string[] }> = [];
  const rest: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    const hit = PARTS.find((p) => p.starts.test(line));
    if (hit) {
      const after = line.includes(":") ? line.slice(line.indexOf(":") + 1).trim() : "";
      parts.push({ label: hit.label, text: after ? [after] : [] });
    } else if (parts.length) parts[parts.length - 1].text.push(raw);
    else rest.push(raw);
  }
  return {
    lead: first.trim(),
    parts: parts
      .map((p) => {
        const text = p.text.join("\n").trim();
        return { label: p.label, text: text ? text[0]!.toUpperCase() + text.slice(1) : "" };
      })
      .filter((p) => p.text),
    rest: rest.join("\n").trim(),
  };
}

/* The button Claude's answer is about (lib/claude-tickets ClaudeDo, checked on
   the way in): Do It opens that screen with Steve's guide on it. */
type ClaudeDo = { path: string; point: string; label: string };
const claudeDo = (b: Bug): ClaudeDo | null => {
  const d = b.context?.claudeDo as { path?: unknown; point?: unknown; label?: unknown } | undefined;
  if (!d || typeof d.path !== "string" || !d.path.startsWith("/") || d.path.startsWith("//")) return null;
  return { path: d.path, point: typeof d.point === "string" ? d.point : "", label: typeof d.label === "string" ? d.label : "" };
};
const doHref = (d: ClaudeDo) => (d.point ? `${d.path}${d.path.includes("?") ? "&" : "?"}steve=point:${d.point}` : d.path);

/** "kirstie.mulholland@…" to "Kirstie", for "Kirstie is told when it does". */
const firstName = (email: string) => {
  const w = (email.split("@")[0] ?? "").split(/[._-]/)[0] ?? "";
  return w ? w[0]!.toUpperCase() + w.slice(1) : "";
};

const STATE_WORD: Record<string, { word: string; tone: Tone }> = {
  open: { word: "Open", tone: "accent" },
  ack: { word: "Acknowledged", tone: "warning" },
  fixed: { word: "Fixed", tone: "good" },
  wontfix: { word: "Won't fix", tone: "neutral" },
};

const ACTION: Record<string, string> = { open: "Reopen", ack: "Acknowledge", fixed: "Fixed, Tell Them", wontfix: "Won't Fix" };

export default function TicketsNew({ state }: { state: "loading" | { err: string; retry: () => void } | Ready }) {
  /* Fixed, Tell Them asks for "how we fixed it" first (9 Nov 2026, lib/ticket-fixed). */
  const [telling, setTelling] = useState<Bug | null>(null);
  /* Which ticket is asking "Push it live?", and whose own recordings are open. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [watching, setWatching] = useState<Record<string, true>>({});
  if (state === "loading") {
    return (
      <Tab>
        <Loading what="Loading the tickets…" />
      </Tab>
    );
  }
  if ("err" in state) {
    return (
      <Tab>
        <ErrorLine onRetry={state.retry}>{state.err}</ErrorLine>
      </Tab>
    );
  }
  const { people, auto, pick, counts, show, setShow, letter, setLetter, shots, media, loadShot, loadMedia, openId, patch, verdict, claude, claudeSaid, sendToClaude, pushSaid, pushClaude } = state;
  const open = (b: Bug) => b.state === "open" || b.state === "ack";
  const withClaude = (b: Bug) => open(b) && b.botState === "with_claude";
  /* Back from Claude with something for James: a fix to push, a question, or
     an answer to send. Only tickets that went to Claude; the old bot's verdicts
     stay on their rows. */
  const backFromClaude = (b: Bug) => open(b) && Boolean(b.claudeUrl) && ["fix_ready", "needs_you", "not_a_bug"].includes(b.botState ?? "");
  const claudeReply = (b: Bug) =>
    typeof b.context?.claudeReply === "string" && !b.context?.replySentAt ? (b.context.claudeReply as string) : "";
  const theirs = (b: Bug) => (media[b.id] ?? []).filter((m) => m.source !== "claude");

  /* What Claude did, read here instead of in its session (James, 4 Nov 2026:
     "it almost kind of bypasses the need to go into Claude if I don't need
     to"): the answer, its parts, its pictures, then Push It Live or Open in
     Claude. Pushed, it says so until the deploy boots and closes the ticket. */
  const report = (b: Bug) => {
    const r = reportParts(b.botNote ?? "");
    const who = firstName(b.reporterEmail) || "whoever reported it";
    const pics = (media[b.id] ?? []).filter((m) => m.source === "claude");
    const pushedAt = typeof b.context?.pushedAt === "string" ? (b.context.pushedAt as string) : "";
    const pushedBy = typeof b.context?.pushedBy === "string" ? (b.context.pushedBy as string) : "";
    const late = Boolean(pushedAt) && Date.now() - new Date(pushedAt).getTime() > 30 * 60_000;
    const canOfferPush = b.botState === "fix_ready" && !pushedAt && claude.canSend;
    const doIt = claudeDo(b);
    return (
      <div className="nl-adm-claude nl-adm-report">
        <p className="nl-meta">
          <span className="nl-strong">{verdict(b)}</span>
          {b.botAt ? `, ${when(b.botAt)}` : ""}
        </p>
        {r.lead && <p className="nl-adm-report-lead">{nd(r.lead)}</p>}
        {r.parts.length > 0 && (
          <dl className="nl-adm-report-parts">
            {r.parts.map((p) => (
              <div key={p.label}>
                <dt>{p.label}</dt>
                <dd>{nd(p.text)}</dd>
              </div>
            ))}
          </dl>
        )}
        {r.rest && <p className="nl-adm-report-rest">{nd(r.rest)}</p>}
        {(b.claudeShots ?? 0) > 0 &&
          (pics.length ? (
            <div className="nl-adm-report-pics">
              {pics.map((m) => (
                <a key={m.id} href={m.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt="Claude's picture of the fix" />
                </a>
              ))}
            </div>
          ) : media[b.id] === null || !(b.id in media) ? (
            <Loading what="Opening Claude's pictures…" />
          ) : (
            <p className="nl-meta">Claude&apos;s pictures could not be opened.</p>
          ))}
        {b.botState === "fix_ready" && pushedAt && (
          <p className={`nl-meta${late ? " nl-adm-warn" : ""}`}>
            {late
              ? `Pushed by ${pushedBy || "you"} ${when(pushedAt)}, but not live after half an hour. Look at Railway.`
              : `Pushed by ${pushedBy || "you"} ${when(pushedAt)}. It goes live in a few minutes, and ${who} is told when it does.`}
          </p>
        )}
        {confirming === b.id && canOfferPush && (
          <p className="nl-meta nl-strong">Push it live? It goes live in about four minutes, and {who} is told when it does.</p>
        )}
        <div className="nl-adm-row-acts">
          {doIt && (
            <a
              href={doHref(doIt)}
              title={doIt.point ? "Opens the screen with Steve pointing at the button" : "Opens the screen Claude's answer is about"}
              className={`nl-btn nl-btn--sm ${b.botState === "fix_ready" ? "nl-btn--secondary" : "nl-btn--primary"}`}
            >
              {doIt.label ? `Do It: ${doIt.label}` : "Open the Screen"}
            </a>
          )}
          {canOfferPush &&
            (confirming === b.id ? (
              <>
                <button type="button" onClick={() => { setConfirming(null); void pushClaude(b.id); }} className="nl-btn nl-btn--primary nl-btn--sm">
                  Yes, Push It
                </button>
                <button type="button" onClick={() => setConfirming(null)} className="nl-btn nl-btn--quiet nl-btn--sm">
                  Not Yet
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={!claude.canPush || pushSaid[b.id] === "Pushing…"}
                title={claude.canPush ? "Merges Claude's fix into the live OS" : "Not connected yet: GitHub's key goes on Railway"}
                onClick={() => setConfirming(b.id)}
                className="nl-btn nl-btn--primary nl-btn--sm"
              >
                {pushSaid[b.id] === "Pushing…" ? "Pushing…" : "Push It Live"}
              </button>
            ))}
          {b.claudeUrl && (
            <a href={b.claudeUrl} target="_blank" rel="noreferrer" className={`nl-btn nl-btn--sm ${b.botState === "needs_you" && !doIt ? "nl-btn--primary" : "nl-btn--secondary"}`}>
              Open in Claude
            </a>
          )}
          {b.botState === "fix_ready" && b.botPr && (
            <a href={b.botPr} target="_blank" rel="noreferrer" className="nl-btn nl-btn--quiet nl-btn--sm">
              See the Change
            </a>
          )}
        </div>
        {pushSaid[b.id] && pushSaid[b.id] !== "Pushing…" && <p className="nl-meta nl-adm-warn">{pushSaid[b.id]}</p>}
        {canOfferPush && !claude.canPush && (
          <p className="nl-meta">Push It Live works once GitHub&apos;s key is on Railway. Until then, See the Change opens it on GitHub to merge.</p>
        )}
      </div>
    );
  };

  const row = (b: Bug) => {
    const st = STATE_WORD[b.state] ?? { word: b.state, tone: "neutral" as Tone };
    const v = verdict(b);
    return (
      <li key={b.id} id={`ticket-${b.id}`} className={b.id === openId ? "is-picked" : undefined}>
        <div className="nl-adm-row-main">
          <div className="nl-adm-row-line">
            <span className={`nl-adm-prio${b.priority === "A" ? " is-a" : b.priority ? " is-set" : ""}`} title={b.priority ? LETTERS.find((l) => l.id === b.priority)?.sub : "Not sorted"}>
              {b.priority ?? "?"}
            </span>
            <Badge tone={st.tone} bare>
              {st.word}
            </Badge>
            <span className="nl-meta">
              {b.kind === "auto"
                ? `${b.path || "On the server"}${(b.occurrences ?? 1) > 1 ? `, seen ${b.occurrences} times` : ""}`
                : `${b.kind}, ${b.reporterEmail || "unknown"} on ${b.path || "an unknown screen"}`}
              {b.media ? `, ${b.media} attached` : ""}
            </span>
          </div>
          <p className="nl-adm-quote">{nd(b.body)}</p>
          {backFromClaude(b) ? (
            report(b)
          ) : b.botState && (
            <p className={`nl-meta${b.botState === "needs_you" ? " nl-adm-warn" : ""}`}>
              <span className="nl-strong">{v}</span>
              {b.botAt ? `, ${when(b.botAt)}` : ""}
              {b.botNote ? `. ${nd(b.botNote.split("\n")[0])}` : ""}
            </p>
          )}
          {claudeReply(b) && (
            <div className="nl-adm-claude">
              <p className="nl-meta"><span className="nl-strong">Claude&apos;s answer for {b.reporterEmail || "them"}</span></p>
              <p className="nl-adm-quote">{nd(claudeReply(b))}</p>
            </div>
          )}
          <div className="nl-adm-row-acts">
            {claude.canSend && open(b) && b.botState !== "with_claude" && !b.context?.pushedAt && (
              <button
                type="button"
                disabled={!claude.ready || claudeSaid[b.id] === "Sending…"}
                title={claude.ready ? "A Claude Code session on your plan works this ticket and comes back with a fix to push, a question or an answer" : "Not connected yet: the routine's address and key go on Railway"}
                onClick={() => void sendToClaude(b.id)}
                className={`nl-btn nl-btn--sm ${b.claudeUrl ? "nl-btn--quiet" : "nl-btn--primary"}`}
              >
                {claudeSaid[b.id] === "Sending…" ? "Sending…" : b.claudeUrl ? "Send to Claude Again" : "Send to Claude"}
              </button>
            )}
            {b.botState === "with_claude" && b.claudeUrl && (
              <a href={b.claudeUrl} target="_blank" rel="noreferrer" className="nl-btn nl-btn--secondary nl-btn--sm">
                Watch Claude
              </a>
            )}
            {b.botState === "fix_ready" && b.botPr && !backFromClaude(b) && (
              <a href={b.botPr} target="_blank" rel="noreferrer" className="nl-btn nl-btn--secondary nl-btn--sm">
                See the Change
              </a>
            )}
            {claudeReply(b) && (
              <button type="button" onClick={() => void patch(b.id, { sendReply: true })} className="nl-btn nl-btn--primary nl-btn--sm">
                Send Claude&apos;s Answer
              </button>
            )}
            <div role="group" aria-label="Priority" className="nl-toggle nl-adm-seg">
              {LETTERS.map((l) => (
                <button key={l.id} type="button" title={l.sub} aria-pressed={b.priority === l.id} onClick={() => void patch(b.id, { priority: b.priority === l.id ? null : l.id })} className={b.priority === l.id ? "is-on" : undefined}>
                  {l.label}
                </button>
              ))}
            </div>
            {(["open", "ack", "fixed", "wontfix"] as const)
              .filter((x) => x !== b.state)
              .map((x) => (
                <button key={x} type="button" onClick={() => (x === "fixed" ? setTelling(b) : void patch(b.id, { state: x }))} className="nl-btn nl-btn--quiet nl-btn--sm">
                  {ACTION[x]}
                </button>
              ))}
            {!(b.id in shots) && (
              <button type="button" onClick={() => void loadShot(b.id)} className="nl-btn nl-btn--quiet nl-btn--sm">
                See Their Screen
              </button>
            )}
            {(b.media ?? 0) > 0 && !watching[b.id] && (
              <button
                type="button"
                onClick={() => {
                  setWatching((w) => ({ ...w, [b.id]: true }));
                  if (!media[b.id]) void loadMedia(b.id);
                }}
                className="nl-btn nl-btn--secondary nl-btn--sm"
              >
                {`Watch What They Added (${b.media})`}
              </button>
            )}
          </div>
          {claudeSaid[b.id] && claudeSaid[b.id] !== "Sending…" && <p className="nl-meta nl-adm-warn">{claudeSaid[b.id]}</p>}
          {b.id in shots &&
            (shots[b.id] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shots[b.id]!} alt={`The screen when ${b.reporterEmail || "the OS"} reported this`} className="nl-adm-shot" />
            ) : shots[b.id] === "" ? (
              <Loading what="Opening their screen…" />
            ) : (
              <p className="nl-meta nl-adm-after">No picture with this one.</p>
            ))}
          {watching[b.id] && media[b.id] === null && <Loading what="Opening what they added…" />}
          {watching[b.id] &&
            media[b.id] &&
            (theirs(b).length ? (
              <div>
                {theirs(b).map((m) =>
                  m.mime.startsWith("video/") ? (
                    <video key={m.id} src={m.url} controls playsInline className="nl-adm-shot" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={m.id} src={m.url} alt={`Added by ${b.reporterEmail}`} className="nl-adm-shot" />
                  )
                )}
              </div>
            ) : (
              <p className="nl-meta nl-adm-after">What they added could not be opened.</p>
            ))}
        </div>
        <div className="nl-adm-row-side">
          <span className="nl-mono">{when(b.lastSeenAt && b.lastSeenAt !== b.createdAt ? b.lastSeenAt : b.createdAt)}</span>
        </div>
      </li>
    );
  };

  /* Sent to Claude: out of the way until Claude has something (James, 4 Nov
     2026: "automatically get rid of that ticket for me"). Back from Claude:
     above everything, because each one is a single press for James. */
  const everyOpen = [...people, ...auto];
  const ready = show === "open" ? everyOpen.filter(backFromClaude) : [];
  const working = show === "open" ? everyOpen.filter(withClaude) : [];
  const parked = new Set([...ready, ...working].map((b) => b.id));
  const mine = pick(people).filter((b) => !parked.has(b.id));
  const os = pick(auto).filter((b) => !parked.has(b.id));

  return (
    <Tab>
      <p className="nl-meta nl-adm-lede">What people raise. A is broken, C is a recommendation, B is everything else; an idea is a C the moment it lands. Change a letter by pressing it. Send to Claude hands a ticket to Claude, and it comes back here with a fix to push, a question or an answer.</p>

      <ul className="nl-adm-figs" aria-label="Open tickets by letter">
        {(["A", "B", "C", "none"] as const).map((k) => (
          <li key={k}>
            <button type="button" aria-pressed={letter === k} onClick={() => setLetter(letter === k ? "all" : k)}>
              <b className={counts[k] ? undefined : "is-quiet"}>{counts[k]}</b>
              <span>{k === "none" ? "Not sorted" : `${k}, ${LETTERS.find((l) => l.id === k)?.sub}`}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="nl-adm-bar">
        <div role="radiogroup" aria-label="Which tickets" className="nl-toggle">
          <button type="button" role="radio" aria-checked={show === "open"} onClick={() => setShow("open")} className={show === "open" ? "is-on" : undefined}>
            Open
          </button>
          <button type="button" role="radio" aria-checked={show === "all"} onClick={() => setShow("all")} className={show === "all" ? "is-on" : undefined}>
            Everything
          </button>
        </div>
        {letter !== "all" && (
          <button type="button" className="nl-link" onClick={() => setLetter("all")}>
            Show every letter
          </button>
        )}
      </div>

      {claude.canSend && !claude.ready && (
        <p className="nl-meta nl-adm-warn">Send to Claude is built but not connected yet: the routine&apos;s address and key go on Railway.</p>
      )}

      {ready.length > 0 && (
        <Section title={<>Back From Claude <span className="nl-count">{ready.length}</span></>}>
          <ul className="nl-adm-rows">{ready.map(row)}</ul>
        </Section>
      )}

      <Section title={<>Raised by People <span className="nl-count">{mine.length}</span></>}>
        {mine.length === 0 ? <p className="nl-empty">Nothing here. Steve sits in the bottom right of every screen; what people report through him lands here.</p> : <ul className="nl-adm-rows">{mine.map(row)}</ul>}
      </Section>

      <Section title={<>Logged by the OS Itself <span className="nl-count">{os.length}</span></>}>
        {os.length === 0 ? <p className="nl-empty">Nothing open.</p> : <ul className="nl-adm-rows">{os.map(row)}</ul>}
      </Section>

      {working.length > 0 && (
        /* Opened for a link to one of them (?open=), so the row it lands on shows. */
        <details className="nl-adm-more nl-adm-after" {...(working.some((b) => b.id === openId) ? { open: true } : {})}>
          <summary>
            With Claude ({working.length}). Each comes back to the top when Claude has a fix, a question or an answer.
          </summary>
          <ul className="nl-adm-rows">{working.map(row)}</ul>
        </details>
      )}
      {telling && <TellThem bug={telling} onClose={() => setTelling(null)} onSend={async (story) => { await patch(telling.id, { state: "fixed", story }); setTelling(null); }} />}
    </Tab>
  );
}


/**
 * Fixed, Tell Them (9 Nov 2026): the plain-English "how we fixed it" goes to
 * the person in the email and from Steve. Claude's own version is there when
 * a Claude session wrote one (context.fixStory); otherwise James writes it,
 * or leaves it empty and they just hear it's fixed.
 */
function TellThem({ bug, onClose, onSend }: { bug: Bug; onClose: () => void; onSend: (story: string) => Promise<void> }) {
  const had = typeof bug.context?.fixStory === "string" ? (bug.context.fixStory as string) : "";
  const [story, setStory] = useState(had);
  const [busy, setBusy] = useState(false);
  const who = bug.reporterEmail.split("@")[0].split(/[._-]/)[0].replace(/^./, (c) => c.toUpperCase());
  return (
    <FloatSheet
      title="Fixed, Tell Them"
      onClose={onClose}
      dismissible={!busy}
      question={`How did we fix it, for ${who}?`}
      lede="Two or three plain sentences: what was going wrong, in their words, and what's different now. It goes in the email and from Steve the next time they're in the OS."
      foot={
        <FloatFoot left={<span className="nl-meta">{story.trim() ? "They'll get this, the email and Steve" : "Empty: they just hear it's fixed"}</span>}>
          <button type="button" className="nl-btn nl-btn--secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="nl-btn nl-btn--primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onSend(story.trim());
              setBusy(false);
            }}
          >
            {busy ? "Sending…" : "Mark Fixed and Tell Them"}
          </button>
        </FloatFoot>
      }
    >
      <FloatCard>
        <span className="nl-fs-label">They told us</span>
        <p className="mt-1.5 line-clamp-4 text-[13.5px] leading-relaxed text-muted">{bug.body}</p>
      </FloatCard>
      <FloatCard>
        <label className="block">
          <span className="nl-fs-label">How we fixed it{had ? <em> (written by Claude, change anything)</em> : null}</span>
          <textarea
            className="nl-fs-input mt-1.5"
            rows={5}
            maxLength={1500}
            value={story}
            onChange={(e) => setStory(e.target.value)}
            placeholder="The Save button was quietly failing when a landlord had no email address. It now saves either way and tells you if anything is missing."
          />
        </label>
      </FloatCard>
    </FloatSheet>
  );
}
