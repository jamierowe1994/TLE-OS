"use client";

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
};

export const LETTERS: Array<{ id: "A" | "B" | "C"; label: string; sub: string }> = [
  { id: "A", label: "A", sub: "Broken" },
  { id: "B", label: "B", sub: "Later" },
  { id: "C", label: "C", sub: "Recommendation" },
];

type Letter = "A" | "B" | "C" | "none" | "all";
type Media = Array<{ id: string; mime: string; url: string }>;

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
  /** Send to Claude (lib/claude-tickets): who may press it, and whether it is wired up. */
  claude: { canSend: boolean; ready: boolean };
  /** What went wrong on a press, by ticket; "Sending…" while it goes. */
  claudeSaid: Record<string, string>;
  sendToClaude: (id: string) => Promise<void>;
};

const STATE_WORD: Record<string, { word: string; tone: Tone }> = {
  open: { word: "Open", tone: "accent" },
  ack: { word: "Acknowledged", tone: "warning" },
  fixed: { word: "Fixed", tone: "good" },
  wontfix: { word: "Won't fix", tone: "neutral" },
};

const ACTION: Record<string, string> = { open: "Reopen", ack: "Acknowledge", fixed: "Fixed, Tell Them", wontfix: "Won't Fix" };

export default function TicketsNew({ state }: { state: "loading" | { err: string; retry: () => void } | Ready }) {
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
  const { people, auto, pick, counts, show, setShow, letter, setLetter, shots, media, loadShot, loadMedia, openId, patch, verdict, claude, claudeSaid, sendToClaude } = state;
  const open = (b: Bug) => b.state === "open" || b.state === "ack";
  const withClaude = (b: Bug) => open(b) && b.botState === "with_claude";
  /* Back from Claude with something for James: a fix to push, a question, or
     an answer to send. Only tickets that went to Claude; the old bot's verdicts
     stay on their rows. */
  const backFromClaude = (b: Bug) => open(b) && Boolean(b.claudeUrl) && ["fix_ready", "needs_you", "not_a_bug"].includes(b.botState ?? "");
  const claudeReply = (b: Bug) =>
    typeof b.context?.claudeReply === "string" && !b.context?.replySentAt ? (b.context.claudeReply as string) : "";

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
          {b.botState && (
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
            {claude.canSend && open(b) && b.botState !== "with_claude" && (
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
            {b.botState === "fix_ready" && b.botPr && (
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
                <button key={x} type="button" onClick={() => void patch(b.id, { state: x })} className="nl-btn nl-btn--quiet nl-btn--sm">
                  {ACTION[x]}
                </button>
              ))}
            {!(b.id in shots) && (
              <button type="button" onClick={() => void loadShot(b.id)} className="nl-btn nl-btn--quiet nl-btn--sm">
                See Their Screen
              </button>
            )}
            {(b.media ?? 0) > 0 && !media[b.id] && (
              <button type="button" onClick={() => void loadMedia(b.id)} className="nl-btn nl-btn--secondary nl-btn--sm">
                {b.id in media ? "Opening…" : `Watch What They Added (${b.media})`}
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
          {media[b.id] &&
            (media[b.id]!.length ? (
              <div>
                {media[b.id]!.map((m) =>
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
      <p className="nl-meta nl-adm-lede">What people raise. A is broken, C is a recommendation, B is everything else. The bot sorts a fault when it has looked; an idea is a C the moment it lands. Change a letter by pressing it.</p>

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
        <details className="nl-adm-more nl-adm-after">
          <summary>
            With Claude ({working.length}). Each comes back to the top when Claude has a fix, a question or an answer.
          </summary>
          <ul className="nl-adm-rows">{working.map(row)}</ul>
        </details>
      )}
    </Tab>
  );
}
