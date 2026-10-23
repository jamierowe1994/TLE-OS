"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import LineIcon from "@/components/LineIcon";
import { Ico } from "@/components/new-look/Parts";
import { searchMatches } from "@/lib/search-match";
import { isGif, previewOf, TEAM_GIFS } from "@/lib/chat-gif";
import { useNewLook } from "@/lib/use-new-look";

/**
 * THE NEW LOOK (lib/new-look "huddles", 23 Oct 2026). Every part below draws
 * itself the old way unless this says otherwise; the page sets it once, so the
 * same panes, rows, composer and picker - with every fetch and handler they
 * hold - serve both looks. Styles in app/new-look/huddles.css (nl-hud-).
 */
const NlCtx = createContext(false);
const useNl = () => useContext(NlCtx);

/**
 * HUDDLES in the OS (Susan via James, 12 Oct 2026): the chats from the phone
 * app's Chats screen, on the desktop, under Dashboard on the sidebar. The same
 * conversations as the phone - lib/chats, /api/m/chats, /api/m/rooms - so a
 * message on either shows on the other. Two tabs, as the phone's two halves:
 *
 *   Team                  General (everybody's; "Ask as a Question" starts a
 *                         thread others answer) and the huddles you are in.
 *   Landlords & Tenants   what customers wrote through their portals, your own
 *                         (an owner sees everyone's). A reply is stored and
 *                         emailed to them, as on the phone.
 *
 * Faces are each person's display photo (initials without one); a huddle's
 * picture is its two people side by side, or a few of them stacked. Emojis in
 * both tabs; GIFs (GIPHY, rated G) in the team's chats only, since a reply to
 * a customer goes out as an email.
 *
 * Wide, the list is a column on the left and the open chat fills the rest; on
 * a phone-width window it is one or the other, with a back arrow. The address
 * keeps your place: ?tab=customers&with=landlord:<id>, or ?room=<id>&thread=<id>.
 */

type Face = { id: string; name: string; photo: string | null };
type Room = { id: string; kind: "general" | "huddle"; name: string; members: number; last: { body: string; who: string; at: string } | null; unread: number; faces: Face[]; archived: boolean };
type Thread = { key: string; kind: "landlord" | "tenant"; name: string; about: string; last: { body: string; from: "customer" | "agent"; at: string }; unread: number; archived: boolean };
type Quote = { id: string; authorId: string; author: string; body: string };
type TeamMsg = { id: string; authorId: string; author: string; photo: string | null; body: string; question: boolean; at: string; replies: number; quote?: Quote | null };
type CustomerMsg = { id: string; from: "customer" | "agent"; body: string; at: string; seen?: boolean };
type Person = { id: string; name: string; photo: string | null; town: string | null; miles: number | null };
type Tab = "team" | "customers";
type Pick = { kind: "room"; id: string; thread: string | null } | { kind: "landlord" | "tenant"; id: string };

const GENERAL = "general";
/* The shell's sidebar count listens for this, so reading here clears it at once. */
const READ_EVENT = "os:chats-read";

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
const dayOf = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
};
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const first = (name: string) => name.split(" ")[0] ?? name;
const initials = (s: string) =>
  s
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

/* ── Faces ──────────────────────────────────────────────────────────────── */

type Tone = "pink" | "sage" | "clay";
const TONES: Record<Tone, string> = {
  pink: "bg-accent-soft text-accent-dark",
  sage: "bg-sage/35 text-brown",
  clay: "bg-[#efe3dc] text-brown",
};
/* A person keeps one tone wherever they appear, so a face reads as them. */
const toneOf = (id: string): Tone => (["pink", "sage", "clay"] as const)[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % 3]!;

function Avatar({ name, photo, size = 36, tone = "pink", ring = false }: { name: string; photo?: string | null; size?: number; tone?: Tone; ring?: boolean }) {
  const nl = useNl();
  if (nl)
    return (
      <span className={`nl-hud-av nl-hud-av--${tone}${ring ? " is-ring" : ""}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }} title={name}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo ? <img src={photo} alt="" loading="lazy" /> : initials(name)}
      </span>
    );
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ${TONES[tone]} ${ring ? "ring-2 ring-card" : ""}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      title={name}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {photo ? <img src={photo} alt="" loading="lazy" className="h-full w-full object-cover" /> : initials(name)}
    </span>
  );
}

/**
 * A huddle's picture (James, 12 Oct 2026): two people side by side; three or
 * more stacked one over the next, the third circle saying "+N" when there are
 * more than three. Fills a fixed slot so names line up down the list.
 */
/* The room everybody is in. lib/chats renames the row itself; this is what the
   screen says while the list is still loading. */
const GENERAL_NAME = "The Letting Experts";

/**
 * The Letting Experts' own face, for the room that is the whole company.
 * The logo rather than a message icon: it is the one chat with a name over the
 * door, and a generic speech bubble made it read as a system notice.
 */
function BrandFace({ size = 38 }: { size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-soft" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/tle-logo.png" alt="" className="h-[72%] w-[72%] object-contain" />
    </span>
  );
}

const SLOT = 66;
/* The new look's slot: the design's faces are smaller. */
const NL_SLOT = 56;
function GroupFace({ faces, members, name, size = 28, slot = SLOT }: { faces: Face[]; members: number; name: string; size?: number; slot?: number }) {
  const nl = useNl();
  if (nl) {
    const more = faces.length >= 3 && members > 3;
    const shown = !faces.length ? [] : members <= 2 || faces.length < 3 ? faces.slice(0, 2) : faces.slice(0, more ? 2 : 3);
    return (
      <span className="nl-hud-slot" style={{ width: slot || undefined }}>
        {!shown.length ? (
          <Avatar name={name} size={34} tone="sage" />
        ) : (
          <span className={`nl-hud-stack${shown.length === 2 && !more && (members <= 2 || faces.length < 3) ? " is-pair" : ""}`}>
            {shown.map((f, i) => (
              <span key={f.id} style={{ zIndex: 3 - i }}>
                <Avatar name={f.name} photo={f.photo} size={size} tone={toneOf(f.id)} ring />
              </span>
            ))}
            {more && (
              <span className="nl-hud-av nl-hud-av--more is-ring" style={{ width: size, height: size }} title={`${members} people`}>
                +{members - 2}
              </span>
            )}
          </span>
        )}
      </span>
    );
  }
  if (!faces.length) return <span className="flex shrink-0 items-center" style={{ width: SLOT }}><Avatar name={name} size={38} tone="sage" /></span>;
  if (members <= 2 || faces.length < 3) {
    return (
      <span className="flex shrink-0 items-center gap-0.5" style={{ width: SLOT }}>
        {faces.slice(0, 2).map((f) => (
          <Avatar key={f.id} name={f.name} photo={f.photo} size={size + 2} tone={toneOf(f.id)} />
        ))}
      </span>
    );
  }
  const more = members > 3;
  const shown = faces.slice(0, more ? 2 : 3);
  return (
    <span className="flex shrink-0 items-center" style={{ width: SLOT }}>
      {shown.map((f, i) => (
        <span key={f.id} className="relative rounded-full" style={{ marginLeft: i ? -9 : 0, zIndex: 3 - i }}>
          <Avatar name={f.name} photo={f.photo} size={size} tone={toneOf(f.id)} ring />
        </span>
      ))}
      {more && (
        <span
          className="relative flex shrink-0 items-center justify-center rounded-full bg-[#e6e1dc] text-[10.5px] font-semibold text-brown ring-2 ring-card"
          style={{ width: size, height: size, marginLeft: -9 }}
          title={`${members} people`}
        >
          +{members - 2}
        </span>
      )}
    </span>
  );
}

function Spinner({ label }: { label: string }) {
  if (useNl())
    return (
      <div className="nl-hud-wait" role="status">
        <i aria-hidden />
        {label}
      </div>
    );
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-[12.5px] text-muted">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />
      {label}
    </div>
  );
}

function Count({ n }: { n: number }) {
  const nl = useNl();
  if (n <= 0) return null;
  if (nl) return <span className="nl-hud-n" aria-label={`${n} unread`}>{n > 99 ? "99+" : n}</span>;
  return <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent-dark px-1.5 text-[11px] font-semibold text-white">{n > 99 ? "99+" : n}</span>;
}

function ErrorBox({ text, onRetry }: { text: string; onRetry?: () => void }) {
  if (useNl())
    return (
      <div className="nl-hud-error" role="alert">
        {text}{" "}
        {onRetry && (
          <button type="button" onClick={onRetry} className="nl-link">
            Try again
          </button>
        )}
      </div>
    );
  return (
    <div className="m-2 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12.5px]">
      {text}{" "}
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-semibold underline">
          Try again
        </button>
      )}
    </div>
  );
}

/* ── The address ───────────────────────────────────────────────────────── */

function readUrl(): { tab: Tab; pick: Pick | null } {
  const sp = new URLSearchParams(window.location.search);
  const w = sp.get("with");
  if (w) {
    const [kind, ...rest] = w.split(":");
    const id = rest.join(":");
    if ((kind === "landlord" || kind === "tenant") && id) return { tab: "customers", pick: { kind, id } };
  }
  if (sp.get("tab") === "customers") return { tab: "customers", pick: null };
  const room = sp.get("room");
  return { tab: "team", pick: room ? { kind: "room", id: room, thread: sp.get("thread") } : null };
}

function urlFor(tab: Tab, pick: Pick | null): string {
  const sp = new URLSearchParams();
  if (pick && pick.kind !== "room") sp.set("with", `${pick.kind}:${pick.id}`);
  else if (tab === "customers") sp.set("tab", "customers");
  else if (pick && pick.kind === "room" && (pick.id !== GENERAL || pick.thread)) {
    sp.set("room", pick.id);
    if (pick.thread) sp.set("thread", pick.thread);
  }
  const qs = sp.toString();
  return qs ? `/huddles?${qs}` : "/huddles";
}

/* ── The page ──────────────────────────────────────────────────────────── */

export default function Huddles() {
  const look = useNewLook("huddles");
  const [data, setData] = useState<{ work: Thread[]; rooms: Room[]; unread: { work: number; play: number } } | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("team");
  const [pick, setPick] = useState<Pick | null>(null);
  /* On a narrow window: the list, or the open chat. */
  const [showChat, setShowChat] = useState(false);
  const [picker, setPicker] = useState<null | { invite: string | null }>(null);
  /* The row slid open to show Archive and Delete (one at a time), and
     whether the list is showing the archived chats. */
  const [swiped, setSwiped] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  useEffect(() => {
    if (!swiped) return;
    const off = (e: MouseEvent) => {
      if (!(e.target as Element).closest?.("[data-swipe-open]")) setSwiped(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setSwiped(null);
    document.addEventListener("mousedown", off);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", off);
      window.removeEventListener("keydown", esc);
    };
  }, [swiped]);

  const load = useCallback(() => {
    fetch("/api/m/chats", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; error?: string; work?: Thread[]; rooms?: Room[]; unread?: { work: number; play: number } }) => {
        if (!j.ok) throw new Error(j.error ?? "Your chats did not load.");
        setData({ work: j.work ?? [], rooms: j.rooms ?? [], unread: j.unread ?? { work: 0, play: 0 } });
        setListError(null);
        window.dispatchEvent(new Event(READ_EVENT));
      })
      .catch((e: Error) => setListError(e.message));
  }, []);

  useEffect(() => {
    const u = readUrl();
    setTab(u.tab);
    setPick(u.pick);
    setShowChat(Boolean(u.pick));
    load();
    const t = window.setInterval(load, 30_000);
    const onPop = () => {
      const p = readUrl();
      setTab(p.tab);
      setPick(p.pick);
      setShowChat(Boolean(p.pick));
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("popstate", onPop);
    };
  }, [load]);

  const go = (nextTab: Tab, next: Pick | null) => {
    setTab(nextTab);
    setPick(next);
    setShowChat(Boolean(next));
    window.history.pushState(null, "", urlFor(nextTab, next));
  };

  /* The chat that is open: on the Team tab, General unless you picked one;
     on the other, the conversation you picked, or none. */
  const open: Pick | null = pick ?? (tab === "team" ? { kind: "room", id: GENERAL, thread: null } : null);

  /* The chat fills the window below the header, so the box you type in is
     always on screen; measured, because the header's height varies by width. */
  const frame = useRef<HTMLDivElement | null>(null);
  const [frameH, setFrameH] = useState<number | null>(null);
  useEffect(() => {
    const fit = () => {
      const el = frame.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      /* To the bottom of the window: the page has no padding under it any
         more, so the composer sits on the edge the way a chat app's does. */
      setFrameH(Math.max(460, Math.round(window.innerHeight - top)));
    };
    fit();
    const t = window.setTimeout(fit, 700);
    window.addEventListener("resize", fit);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", fit);
    };
    /* Measured again once the look is known: the frame is not drawn before. */
  }, [look]);

  const openRoom = open?.kind === "room" ? data?.rooms.find((r) => r.id === open.id) ?? null : null;

  /* THE FOUR SECTIONS. Everything in play is listed at once, so these are
     the four lists rather than "whatever the open tab holds"; archived is a
     single place now, not one per tab, because a chat put away is put away. */
  const roomsHere = (data?.rooms ?? []).filter((r) => !r.archived);
  const workHere = (data?.work ?? []).filter((t) => !t.archived);
  const generalHere = roomsHere.find((r) => r.kind === "general") ?? null;
  const huddlesHere = roomsHere.filter((r) => r.kind === "huddle");
  const landlordsHere = workHere.filter((t) => t.kind === "landlord");
  const tenantsHere = workHere.filter((t) => t.kind === "tenant");
  const archivedRooms = (data?.rooms ?? []).filter((r) => r.archived);
  const archivedWork = (data?.work ?? []).filter((t) => t.archived);
  const archivedHere = [...archivedRooms, ...archivedWork];
  const archivedUnread = archivedHere.reduce((s, c) => s + c.unread, 0);

  /* Archive, bring back or delete, for you alone. */
  const act = async (key: string, action: "archive" | "unarchive" | "delete", what: { name: string; kind: "general" | "huddle" | "landlord" | "tenant" }) => {
    if (action === "delete") {
      const ask =
        what.kind === "huddle"
          ? `Leave and delete ${what.name}? It goes from your chats. Anyone in it can invite you back.`
          : what.kind === "general"
            ? "Delete General from your chats? What has been said so far is cleared for you. It comes back when someone next posts."
            : `Delete your chat with ${what.name}? It goes from your chats and comes back if they write again. Their messages stay on their file.`;
      if (!window.confirm(ask)) return;
    }
    setSwiped(null);
    const r = (await fetch("/api/m/chat-state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, action }) })
      .then((x) => x.json())
      .catch(() => ({ ok: false, error: "No connection. Nothing changed." }))) as { ok?: boolean; error?: string };
    if (!r.ok) {
      window.alert(r.error ?? "That did not work.");
      return;
    }
    const isOpen = open && (open.kind === "room" ? `room:${open.id}` : `${open.kind}:${open.id}`) === key;
    if (isOpen && action !== "unarchive") go(tab, null);
    load();
  };

  /* One customer row, used by Landlords, by Tenants and by Archived. */
  const renderThread = (t: Thread) => {
    const [kind, ...rest] = t.key.split(":");
    const id = rest.join(":");
    const landlord = kind === "landlord";
    return (
      <SwipeRow key={t.key} open={swiped === t.key} onOpen={() => setSwiped(t.key)} onClose={() => setSwiped(null)} actions={actionsFor(t.key, t.archived, { name: t.name, kind: landlord ? "landlord" : "tenant" })}>
        <Row
          active={open?.kind === kind && open.id === id}
          onClick={() => go("customers", { kind: landlord ? "landlord" : "tenant", id })}
          face={
            <span className="flex shrink-0 items-center" style={{ width: SLOT }}>
              <Avatar name={t.name} size={38} tone={landlord ? "pink" : "sage"} />
            </span>
          }
          name={t.name}
          about={landlord ? t.about : ""}
          line={`${t.last.from === "agent" ? "You: " : ""}${t.last.body}`}
          at={t.last.at}
          unread={t.unread}
        />
      </SwipeRow>
    );
  };

  const actionsFor = (key: string, archived: boolean, what: { name: string; kind: "general" | "huddle" | "landlord" | "tenant" }): SwipeAction[] => [
    archived
      ? { label: "Unarchive", icon: "unarchive", tone: "quiet", run: () => void act(key, "unarchive", what) }
      : { label: "Archive", icon: "archive", tone: "quiet", run: () => void act(key, "archive", what) },
    { label: what.kind === "huddle" ? "Leave" : "Delete", icon: "trash", tone: "loud", run: () => void act(key, "delete", what) },
  ];

  /* ── THE NEW LOOK (lib/new-look "huddles", 23 Oct 2026) ─────────────────
     The design's Huddles: the list in a 320px column titled Huddles with New,
     the four sections as quiet headings, Archived at the foot, and the open
     chat beside it with serif bubbles and a rounded box to write in. Same
     chats, same address, same archive and delete, same panes and picker as
     the old screen below, which stays as it is until the switch beds in. */
  if (look === null) {
    return (
      <p className="flex items-center gap-2 py-16 text-[12.5px] text-muted">
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />
        Opening Huddles…
      </p>
    );
  }
  if (look) {
    const roomRow = (r: Room, archived: boolean) => {
      const key = `room:${r.id}`;
      const general = r.kind === "general";
      return (
        <SwipeRow key={key} open={swiped === key} onOpen={() => setSwiped(key)} onClose={() => setSwiped(null)} actions={actionsFor(key, archived, { name: general ? GENERAL_NAME : r.name, kind: r.kind })}>
          <Row
            active={open?.kind === "room" && open.id === r.id}
            onClick={() => go("team", { kind: "room", id: r.id, thread: null })}
            face={
              general ? (
                <span className="nl-hud-slot" style={{ width: NL_SLOT }}>
                  <BrandFace size={34} />
                </span>
              ) : (
                <GroupFace faces={r.faces} members={r.members} name={r.name} size={24} slot={NL_SLOT} />
              )
            }
            name={general ? GENERAL_NAME : r.name}
            line={r.last ? `${first(r.last.who)}: ${previewOf(r.last.body)}` : archived ? "Nothing said yet" : general ? "Everyone is in this one" : `${r.members} people · say hello`}
            at={r.last?.at ?? null}
            unread={r.unread}
          />
        </SwipeRow>
      );
    };
    const threadRow = (t: Thread) => {
      const [kind, ...rest] = t.key.split(":");
      const id = rest.join(":");
      const landlord = kind === "landlord";
      return (
        <SwipeRow key={t.key} open={swiped === t.key} onOpen={() => setSwiped(t.key)} onClose={() => setSwiped(null)} actions={actionsFor(t.key, t.archived, { name: t.name, kind: landlord ? "landlord" : "tenant" })}>
          <Row
            active={open?.kind === kind && open.id === id}
            onClick={() => go("customers", { kind: landlord ? "landlord" : "tenant", id })}
            face={
              <span className="nl-hud-slot" style={{ width: NL_SLOT }}>
                <Avatar name={t.name} size={34} tone={landlord ? "pink" : "sage"} />
              </span>
            }
            name={t.name}
            about={landlord ? t.about : ""}
            line={`${t.last.from === "agent" ? "You: " : ""}${t.last.body}`}
            at={t.last.at}
            unread={t.unread}
          />
        </SwipeRow>
      );
    };
    return (
      <NlCtx.Provider value>
        <div data-look="new" className="nl-hud">
          <div ref={frame} style={{ height: frameH ?? 560 }} className={`nl-hud-frame${showChat ? " is-chat" : ""}`}>
            <aside className="nl-hud-list" aria-label="Your chats">
              {showArchived ? (
                <div className="nl-hud-list-head">
                  <button type="button" onClick={() => setShowArchived(false)} aria-label="Back to your chats" className="nl-iconbtn nl-iconbtn--sm">
                    <Ico name="back" />
                  </button>
                  <h1 className="nl-hud-title is-sub">Archived</h1>
                </div>
              ) : (
                <div className="nl-hud-list-head">
                  <h1 className="nl-hud-title">Huddles</h1>
                  <button type="button" onClick={() => setPicker({ invite: null })} className="nl-btn nl-btn--primary nl-btn--sm">
                    <Ico name="plus" size={14} />
                    New
                  </button>
                </div>
              )}

              <div className="nl-hud-list-scroll">
                {listError && !data ? (
                  <ErrorBox text={listError} onRetry={load} />
                ) : !data ? (
                  <Spinner label="Loading your chats" />
                ) : showArchived ? (
                  <>
                    {archivedRooms.map((r) => roomRow(r, true))}
                    {archivedWork.map((t) => threadRow(t))}
                    {!archivedRooms.length && !archivedWork.length && <Nothing>Nothing archived.</Nothing>}
                  </>
                ) : (
                  <>
                    <SectionHead label="Huddles" n={huddlesHere.reduce((a, r) => a + r.unread, 0)} first />
                    {huddlesHere.length ? huddlesHere.map((r) => roomRow(r, false)) : <Nothing>No huddles yet. Start one with New.</Nothing>}

                    <SectionHead label="Team" n={generalHere?.unread ?? 0} />
                    {generalHere ? roomRow(generalHere, false) : <Nothing>Archived. Bring it back from Archived below.</Nothing>}

                    <SectionHead label="Landlords" n={landlordsHere.reduce((a, t) => a + t.unread, 0)} />
                    {landlordsHere.length ? landlordsHere.map((t) => threadRow(t)) : <Nothing>Nothing from a landlord yet.</Nothing>}

                    <SectionHead label="Tenants" n={tenantsHere.reduce((a, t) => a + t.unread, 0)} />
                    {tenantsHere.length ? tenantsHere.map((t) => threadRow(t)) : <Nothing>Nothing from a tenant yet.</Nothing>}
                  </>
                )}
              </div>

              {data && !showArchived && (
                <div className="nl-hud-foot">
                  <button
                    type="button"
                    onClick={() => {
                      setSwiped(null);
                      setShowArchived(true);
                    }}
                    className="nl-hud-foot-btn"
                  >
                    <ArchiveIcon />
                    <span>Archived{archivedHere.length ? ` (${archivedHere.length})` : ""}</span>
                    <Count n={archivedUnread} />
                  </button>
                  <p>Double-click a chat, or swipe it on a phone, to archive or delete it.</p>
                </div>
              )}
            </aside>

            <section className="nl-hud-thread" aria-label="Conversation">
              {open?.kind === "room" ? (
                <RoomPane
                  key={`${open.id}|${open.thread ?? ""}`}
                  id={open.id}
                  thread={open.thread}
                  groupFaces={openRoom ? { faces: openRoom.faces, members: openRoom.members } : null}
                  onBack={() => (open.thread ? go("team", { kind: "room", id: open.id, thread: null }) : go("team", null))}
                  onOpenThread={(q) => go("team", { kind: "room", id: open.id, thread: q })}
                  onRead={load}
                  onInvite={() => setPicker({ invite: open.id })}
                  onLeft={() => {
                    load();
                    go("team", null);
                  }}
                />
              ) : open ? (
                <CustomerPane key={`${open.kind}:${open.id}`} kind={open.kind} id={open.id} onBack={() => go("customers", null)} onRead={load} />
              ) : (
                <div className="nl-hud-pick">
                  <span className="nl-hud-pick-ico">
                    <LineIcon name="message" size={20} />
                  </span>
                  <p className="nl-hud-pick-title">Pick a Conversation</p>
                  <p className="nl-hud-pick-sub">Pick a huddle, the team room, a landlord or a tenant on the left.</p>
                </div>
              )}
            </section>
          </div>

          {picker && (
            <PeoplePicker
              invite={picker.invite}
              onClose={() => setPicker(null)}
              onDone={(id) => {
                setPicker(null);
                load();
                go("team", { kind: "room", id, thread: null });
              }}
            />
          )}
        </div>
      </NlCtx.Provider>
    );
  }

  return (
    /* FULL BLEED (James, 18 Oct 2026). This sat in a bordered card inside the
       shell's padding, under a page title, and read as an embed of a chat
       rather than as a chat: a 320px list, a narrow column of messages, and
       too little of either on screen to follow a conversation. The title has
       gone - the room's own name is the title, as it is in Teams and Slack -
       and the negative margins cancel the shell's padding so the thing fills
       the window. The margins mirror main's own classes in components/Shell;
       they have to be changed together. */
    <div className="-mb-28 -mt-8 -mx-5 flex flex-col lg:-mx-10 xl:-mr-[84px] 2xl:-ml-14">
      <div ref={frame} style={{ height: frameH ?? 560 }} className="hud flex overflow-hidden border-t border-[var(--hud-line)] bg-[var(--hud-list)]">
        {/* The list. */}
        <aside className={`${showChat ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col border-[var(--hud-line)] bg-[var(--hud-list)] md:w-[300px] md:border-r lg:w-[340px]`}>
          {/* THE RAIL (James, 18 Oct 2026). Two pills that crossed team with
              landlords-and-tenants have become four plain sections down the
              left, in the order he asked for: huddles at the top, then the
              company room, then the two kinds of customer separately. Everything
              is on screen at once, so nothing is a click away behind a tab. */}
          {showArchived ? (
            <div className="flex items-center gap-2 px-4 pb-2 pt-4">
              <button type="button" onClick={() => setShowArchived(false)} aria-label="Back to your chats" className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--hud-line-strong)] text-muted hover:text-ink">
                <LineIcon name="arrow-left" size={13} />
              </button>
              <p className="text-[13px] font-semibold text-ink">Archived</p>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
              <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Chats</p>
              <button
                type="button"
                onClick={() => setPicker({ invite: null })}
                className="flex h-8 items-center gap-1.5 rounded-full bg-ink px-3 text-[12px] font-semibold text-page transition-opacity hover:opacity-85"
              >
                <span className="text-[15px] leading-none">+</span> New
              </button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 pt-1">
            {listError && !data ? (
              <ErrorBox text={listError} onRetry={load} />
            ) : !data ? (
              <Spinner label="Loading your chats" />
            ) : showArchived ? (
              <>
                {archivedRooms.map((r) => (
                  <SwipeRow key={r.id} open={swiped === `room:${r.id}`} onOpen={() => setSwiped(`room:${r.id}`)} onClose={() => setSwiped(null)} actions={actionsFor(`room:${r.id}`, true, { name: r.name, kind: r.kind })}>
                    <Row
                      active={open?.kind === "room" && open.id === r.id}
                      onClick={() => go("team", { kind: "room", id: r.id, thread: null })}
                      face={r.kind === "general" ? <span className="flex shrink-0 items-center" style={{ width: SLOT }}><BrandFace /></span> : <GroupFace faces={r.faces} members={r.members} name={r.name} />}
                      name={r.kind === "general" ? GENERAL_NAME : r.name}
                      line={r.last ? `${first(r.last.who)}: ${previewOf(r.last.body)}` : "Nothing said yet"}
                      at={r.last?.at ?? null}
                      unread={r.unread}
                    />
                  </SwipeRow>
                ))}
                {archivedWork.map((t) => renderThread(t))}
                {!archivedRooms.length && !archivedWork.length && (
                  <p className="mx-2 mt-2 rounded-xl bg-[var(--hud-row-hover)] px-3 py-3 text-[12.5px] leading-snug text-muted">Nothing archived.</p>
                )}
              </>
            ) : (
              <>
                {/* Huddles, at the top. */}
                <SectionHead label="Huddles" n={huddlesHere.reduce((a, r) => a + r.unread, 0)} first />
                {huddlesHere.length ? (
                  huddlesHere.map((r) => (
                    <SwipeRow key={r.id} open={swiped === `room:${r.id}`} onOpen={() => setSwiped(`room:${r.id}`)} onClose={() => setSwiped(null)} actions={actionsFor(`room:${r.id}`, false, { name: r.name, kind: "huddle" })}>
                      <Row
                        active={open?.kind === "room" && open.id === r.id}
                        onClick={() => go("team", { kind: "room", id: r.id, thread: null })}
                        face={<GroupFace faces={r.faces} members={r.members} name={r.name} />}
                        name={r.name}
                        line={r.last ? `${first(r.last.who)}: ${previewOf(r.last.body)}` : `${r.members} people · say hello`}
                        at={r.last?.at ?? null}
                        unread={r.unread}
                      />
                    </SwipeRow>
                  ))
                ) : (
                  <Nothing>No huddles yet. Start one with New.</Nothing>
                )}

                {/* The company room. */}
                <SectionHead label="Team" n={generalHere?.unread ?? 0} />
                {generalHere ? (
                  <SwipeRow open={swiped === `room:${GENERAL}`} onOpen={() => setSwiped(`room:${GENERAL}`)} onClose={() => setSwiped(null)} actions={actionsFor(`room:${GENERAL}`, false, { name: GENERAL_NAME, kind: "general" })}>
                    <Row
                      active={open?.kind === "room" && open.id === GENERAL}
                      onClick={() => go("team", { kind: "room", id: GENERAL, thread: null })}
                      face={
                        <span className="flex shrink-0 items-center" style={{ width: SLOT }}>
                          <BrandFace />
                        </span>
                      }
                      name={GENERAL_NAME}
                      line={generalHere.last ? `${first(generalHere.last.who)}: ${previewOf(generalHere.last.body)}` : "Everyone is in this one"}
                      at={generalHere.last?.at ?? null}
                      unread={generalHere.unread}
                    />
                  </SwipeRow>
                ) : (
                  <Nothing>Archived. Bring it back from Archived below.</Nothing>
                )}

                {/* The two kinds of customer, apart rather than mixed. */}
                <SectionHead label="Landlords" n={landlordsHere.reduce((a, t) => a + t.unread, 0)} />
                {landlordsHere.length ? landlordsHere.map((t) => renderThread(t)) : <Nothing>Nothing from a landlord yet.</Nothing>}

                <SectionHead label="Tenants" n={tenantsHere.reduce((a, t) => a + t.unread, 0)} />
                {tenantsHere.length ? tenantsHere.map((t) => renderThread(t)) : <Nothing>Nothing from a tenant yet.</Nothing>}
              </>
            )}
          </div>

          {/* Archived, at the foot, and how to put a chat there. */}
          {data && !showArchived && (
            <div className="shrink-0 border-t border-[var(--hud-line)] px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  setSwiped(null);
                  setShowArchived(true);
                }}
                className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[12.5px] text-muted transition-colors hover:bg-panel hover:text-ink"
              >
                <ArchiveIcon />
                <span className="flex-1 text-left">Archived{archivedHere.length ? ` (${archivedHere.length})` : ""}</span>
                <Count n={archivedUnread} />
              </button>
              <p className="px-2 pt-0.5 text-[10.5px] text-muted">Double-click a chat to archive or delete it.</p>
            </div>
          )}
        </aside>

        {/* The open chat. */}
        <section className={`${showChat ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col bg-[var(--hud-chat)]`}>
          {open?.kind === "room" ? (
            <RoomPane
              key={`${open.id}|${open.thread ?? ""}`}
              id={open.id}
              thread={open.thread}
              groupFaces={openRoom ? { faces: openRoom.faces, members: openRoom.members } : null}
              onBack={() => (open.thread ? go("team", { kind: "room", id: open.id, thread: null }) : go("team", null))}
              onOpenThread={(q) => go("team", { kind: "room", id: open.id, thread: q })}
              onRead={load}
              onInvite={() => setPicker({ invite: open.id })}
              onLeft={() => {
                load();
                go("team", null);
              }}
            />
          ) : open ? (
            <CustomerPane key={`${open.kind}:${open.id}`} kind={open.kind} id={open.id} onBack={() => go("customers", null)} onRead={load} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-panel text-muted">
                <LineIcon name="message" size={20} />
              </span>
              <p className="mt-3 text-[13.5px] font-medium text-ink">Pick a Conversation</p>
              <p className="mt-1 max-w-[300px] text-[12.5px] text-muted">Pick a huddle, the team room, a landlord or a tenant on the left.</p>
            </div>
          )}
        </section>
      </div>

      {picker && (
        <PeoplePicker
          invite={picker.invite}
          onClose={() => setPicker(null)}
          onDone={(id) => {
            setPicker(null);
            load();
            go("team", { kind: "room", id, thread: null });
          }}
        />
      )}
    </div>
  );
}

/* ── Archive and delete ────────────────────────────────────────────────── */

type SwipeAction = { label: string; icon: "archive" | "unarchive" | "trash"; tone: "quiet" | "loud"; run: () => void };

function ArchiveIcon({ up = false }: { up?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 5.5h17v4h-17zM5 9.5v9a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 18.5v-9" />
      <path d={up ? "M12 17.5v-5.5M9.5 14.5 12 12l2.5 2.5" : "M12 12v5.5M9.5 15 12 17.5l2.5-2.5"} />
    </svg>
  );
}

/**
 * A chat in the list that slides left to show what can be done with it
 * (James, 12 Oct 2026: "when we double-click a chat, it should move to the
 * left slightly, a bit like what you get with an iPhone"). Double-click, or
 * swipe left on a touch screen; double-click again, swipe right, a click
 * anywhere else or Escape puts it back. A click on the row while it is open
 * closes it rather than opening the chat.
 */
function SwipeRow({ open, onOpen, onClose, actions, children }: { open: boolean; onOpen: () => void; onClose: () => void; actions: SwipeAction[]; children: React.ReactNode }) {
  const W = actions.length * 74;
  const touch = useRef<{ x: number; y: number } | null>(null);
  const nl = useNl();
  return (
    <div
      data-swipe-open={open ? "" : undefined}
      className={nl ? "nl-hud-swipe" : "relative select-none overflow-hidden rounded-xl"}
      onDoubleClick={(e) => {
        e.preventDefault();
        if (open) onClose();
        else onOpen();
      }}
      onTouchStart={(e) => {
        touch.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY };
      }}
      onTouchEnd={(e) => {
        const t = touch.current;
        touch.current = null;
        if (!t) return;
        const dx = e.changedTouches[0]!.clientX - t.x;
        const dy = e.changedTouches[0]!.clientY - t.y;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          if (dx < 0) onOpen();
          else onClose();
        }
      }}
    >
      {/* Hidden while shut, or its colour shows round the row's rounded edge. */}
      <div
        className={nl ? `nl-hud-swipe-acts${open ? "" : " is-shut"}` : `absolute inset-y-0 right-0 flex transition-opacity duration-200 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        style={{ width: W }}
        aria-hidden={!open}
      >
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={a.run}
            className={
              nl
                ? `nl-hud-swipe-btn${a.tone === "loud" ? " is-loud" : ""}`
                : `flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-opacity hover:opacity-90 ${a.tone === "loud" ? "bg-accent-dark text-white" : "bg-[#e6e1dc] text-brown"}`
            }
            style={{ width: 74 }}
          >
            {a.icon === "trash" ? <LineIcon name="trash" size={16} /> : <ArchiveIcon up={a.icon === "unarchive"} />}
            {a.label}
          </button>
        ))}
      </div>
      <div
        className={nl ? "nl-hud-slide" : "relative bg-[var(--hud-list)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"}
        style={{ transform: open ? `translateX(-${W}px)` : "translateX(0)" }}
        onClickCapture={(e) => {
          if (open) {
            e.stopPropagation();
            e.preventDefault();
            onClose();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * A heading in the rail. Sticky, because the four lists scroll as one and a
 * heading that has scrolled away leaves you reading names with no idea whose
 * they are.
 */
function SectionHead({ label, n, first = false }: { label: string; n: number; first?: boolean }) {
  if (useNl())
    return (
      <p className={`nl-hud-group${first ? " is-first" : ""}`}>
        <span>{label}</span>
        <Count n={n} />
      </p>
    );
  return (
    <p className={`sticky top-0 z-10 flex items-center gap-2 bg-[var(--hud-list)] px-2 pb-1 ${first ? "pt-1" : "pt-4"} text-[11px] font-semibold uppercase tracking-[0.08em] text-muted`}>
      <span className="flex-1">{label}</span>
      <Count n={n} />
    </p>
  );
}

function Nothing({ children }: { children: React.ReactNode }) {
  if (useNl()) return <p className="nl-hud-nothing">{children}</p>;
  return <p className="mx-2 rounded-xl bg-[var(--hud-row-hover)] px-3 py-2.5 text-[12px] leading-snug text-muted">{children}</p>;
}

function Row({ active, onClick, face, name, tag, about, line, at, unread }: { active: boolean; onClick: () => void; face: React.ReactNode; name: string; tag?: string; about?: string; line: string; at: string | null; unread: number }) {
  if (useNl())
    return (
      <button type="button" onClick={onClick} aria-current={active ? "true" : undefined} className={`nl-hud-item${active ? " is-on" : ""}${unread ? " is-unread" : ""}`}>
        {face}
        <span className="nl-hud-item-main">
          <span className="nl-hud-item-name">
            <b>{name}</b>
            {tag && <span className="nl-hud-item-tag">{tag}</span>}
            {at && <span className="nl-hud-item-at">{ago(at)}</span>}
          </span>
          {about && <span className="nl-hud-item-about">{about}</span>}
          <span className="nl-hud-item-last">
            <span>{line}</span>
            <Count n={unread} />
          </span>
        </span>
      </button>
    );
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-1 rounded-xl px-2.5 py-2.5 text-left transition-colors ${active ? "bg-[var(--hud-row-active)]" : "hover:bg-[var(--hud-row-hover)]"}`}>
      {face}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={`truncate text-[13.5px] text-ink ${unread ? "font-semibold" : "font-medium"}`}>{name}</span>
          {tag && (
            <span className={`shrink-0 rounded-full px-1.5 py-px text-[10.5px] font-medium ${tag === "Landlord" ? "bg-accent-soft text-accent-dark" : "bg-sage/35 text-brown"}`}>{tag}</span>
          )}
          {at && <span className="ml-auto shrink-0 text-[11px] text-muted">{ago(at)}</span>}
        </span>
        {about && <span className="block truncate text-[11.5px] text-muted">{about}</span>}
        <span className="mt-0.5 flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-[12.5px] ${unread ? "text-ink" : "text-muted"}`}>{line}</span>
          <Count n={unread} />
        </span>
      </span>
    </button>
  );
}

/* ── Panes ─────────────────────────────────────────────────────────────── */

function PaneHead({ back, backAlways, face, title, line, right, children }: { back: () => void; backAlways?: boolean; face?: React.ReactNode; title: string; line?: string; right?: React.ReactNode; children?: React.ReactNode }) {
  if (useNl())
    return (
      <header className="nl-hud-head">
        <button type="button" onClick={back} aria-label="Back" className={`nl-iconbtn nl-iconbtn--sm nl-hud-back${backAlways ? " is-always" : ""}`}>
          <Ico name="back" />
        </button>
        {face}
        <div className="nl-hud-head-text">
          <h2 className="nl-hud-head-name">{title}</h2>
          {line && <p className="nl-hud-head-sub">{line}</p>}
        </div>
        {right}
        {children}
      </header>
    );
  return (
    <header className="relative flex shrink-0 items-center gap-3 border-b border-[var(--hud-line)] bg-[var(--hud-bar)] px-4 py-3">
      <button
        type="button"
        onClick={back}
        aria-label="Back"
        className={`${backAlways ? "flex" : "flex md:hidden"} h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--hud-line-strong)] text-muted transition-colors hover:text-ink`}
      >
        <LineIcon name="arrow-left" size={15} />
      </button>
      {face}
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-heading text-[16px] text-ink">{title}</h2>
        {line && <p className="truncate text-[12px] text-muted">{line}</p>}
      </div>
      {right}
    </header>
  );
}

function RoomPane({
  id,
  thread,
  groupFaces,
  onBack,
  onOpenThread,
  onRead,
  onInvite,
  onLeft,
}: {
  id: string;
  thread: string | null;
  groupFaces: { faces: Face[]; members: number } | null;
  onBack: () => void;
  onOpenThread: (q: string) => void;
  onRead: () => void;
  onInvite: () => void;
  onLeft: () => void;
}) {
  const [data, setData] = useState<{ room: { id: string; kind: "general" | "huddle"; name: string; admin?: boolean }; me: string; messages: TeamMsg[]; members: Face[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState(false);
  /* In a huddle of two: how far the other person has read (the ticks). */
  const [otherRead, setOtherRead] = useState<string | null>(null);
  /* Who else is writing right now (the bubble that rises from the bottom). */
  const [typing, setTyping] = useState<string[]>([]);
  /* The message being replied to, shown above the box until sent or dropped. */
  const [replying, setReplying] = useState<TeamMsg | null>(null);
  useEffect(() => setReplying(null), [id, thread]);

  const url = `/api/m/rooms/${encodeURIComponent(id)}${thread ? `?thread=${encodeURIComponent(thread)}` : ""}`;
  const load = useCallback(
    () =>
      /* Read but not marked read while the tab is in the background, or the
         other person would see two blue ticks for something not seen. */
      fetch(`${url}${document.hidden ? `${url.includes("?") ? "&" : "?"}peek=1` : ""}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j: { ok?: boolean; error?: string; room?: { id: string; kind: "general" | "huddle"; name: string; admin?: boolean }; me?: string; messages?: TeamMsg[]; members?: Face[]; otherRead?: string | null }) => {
          if (!j.ok || !j.room) throw new Error(j.error ?? "The chat did not load.");
          setData({ room: j.room, me: j.me ?? "", messages: j.messages ?? [], members: j.members ?? [] });
          setOtherRead(j.otherRead ?? null);
          setError(null);
        })
        .catch((e: Error) => setError(e.message)),
    [url]
  );

  useEffect(() => {
    void load().then(onRead);
    const t = window.setInterval(() => void load(), 10_000);
    /* Back to the tab: read now, so ticks and unread catch up at once. */
    const back = () => !document.hidden && void load();
    document.addEventListener("visibilitychange", back);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", back);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  /* Typing and seen, every couple of seconds while the chat is on screen. */
  useEffect(() => {
    if (thread) return;
    let gone = false;
    const tick = () => {
      if (document.hidden) return;
      fetch(`/api/m/rooms/${encodeURIComponent(id)}/typing`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j: { ok?: boolean; typing?: string[]; otherRead?: string | null }) => {
          if (gone || !j.ok) return;
          setTyping(j.typing ?? []);
          if (j.otherRead !== undefined) setOtherRead(j.otherRead ?? null);
        })
        .catch(() => {});
    };
    tick();
    const t = window.setInterval(tick, 2500);
    return () => {
      gone = true;
      window.clearInterval(t);
    };
  }, [id, thread]);

  /* Saying that I am typing: at most every three seconds, and stopped when the box empties. */
  const lastPing = useRef(0);
  const onTyping = (hasText: boolean) => {
    if (thread) return;
    const now = Date.now();
    if (hasText && now - lastPing.current < 3000) return;
    if (!hasText && lastPing.current === 0) return;
    lastPing.current = hasText ? now : 0;
    void fetch(`/api/m/rooms/${encodeURIComponent(id)}/typing`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ on: hasText }) }).catch(() => {});
  };

  const general = data?.room.kind === "general";
  const question = thread ? data?.messages.find((m) => m.id === thread) ?? null : null;

  const send = async (text: string, asQuestion = false): Promise<string | null> => {
    const j = (await fetch(`/api/m/rooms/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, question: !thread && asQuestion, replyTo: thread, quoteOf: replying?.id ?? null }),
    })
      .then((r) => r.json())
      .catch(() => ({ ok: false, error: "No connection. Your message was not sent." }))) as { ok?: boolean; error?: string; message?: TeamMsg };
    if (!j.ok || !j.message) return j.error ?? "Your message was not sent.";
    setReplying(null);
    setData((d) => (d ? { ...d, messages: [...d.messages, j.message!] } : d));
    onRead();
    return null;
  };

  const leave = async () => {
    if (!window.confirm(`Leave ${data?.room.name ?? "this huddle"}? You can be invited back.`)) return;
    await fetch(`/api/m/rooms/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    onLeft();
  };

  /* WHO CAN DO THESE. The server decides and says so on the room; this only
     draws what it was told. A button hidden here is a courtesy, not the
     guard - the routes refuse the same things on their own. */
  const admin = Boolean(data?.room.admin) && !thread;

  const rename = async () => {
    const was = data?.room.name ?? "";
    const name = window.prompt("What should this chat be called?", was)?.trim();
    if (!name || name === was) return;
    const j = (await fetch(`/api/m/rooms/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    })
      .then((r) => r.json())
      .catch(() => ({ ok: false, error: "No connection. The name did not change." }))) as { ok?: boolean; error?: string };
    if (!j.ok) {
      window.alert(j.error ?? "The name did not change.");
      return;
    }
    setPeople(false);
    await load();
    onRead();
  };

  const removePerson = async (who: Face) => {
    if (!window.confirm(`Take ${who.name} out of ${data?.room.name ?? "this chat"}? They can be invited back, and what they have said stays.`)) return;
    const j = (await fetch(`/api/m/rooms/${encodeURIComponent(id)}/members`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: who.id }),
    })
      .then((r) => r.json())
      .catch(() => ({ ok: false, error: "No connection. Nobody was taken out." }))) as { ok?: boolean; error?: string };
    if (!j.ok) {
      window.alert(j.error ?? "That did not work.");
      return;
    }
    await load();
  };

  /* The destructive one. It is worded for what it actually does - everybody
     loses the conversation, not just you - and it says the name back. */
  const deleteForAll = async () => {
    const name = data?.room.name ?? "this chat";
    if (!window.confirm(`Delete ${name} for everyone in it?\n\nThe whole conversation goes, for every person in it, and it cannot be undone.`)) return;
    const j = (await fetch(`/api/m/rooms/${encodeURIComponent(id)}?everyone=1`, { method: "DELETE" })
      .then((r) => r.json())
      .catch(() => ({ ok: false, error: "No connection. Nothing was deleted." }))) as { ok?: boolean; error?: string };
    if (!j.ok) {
      window.alert(j.error ?? "That did not work.");
      return;
    }
    setPeople(false);
    onLeft();
  };

  const title = thread ? "Question" : (data?.room.name ?? (id === GENERAL ? GENERAL_NAME : "Huddle"));
  const line = thread
    ? question
      ? `Asked by ${question.author}`
      : ""
    : general
      ? "Everyone is in this one"
      : data
        ? `${data.members.length} people${data.room.admin ? " · you run this one" : ""}`
        : "";
  const faces = data && !general && !thread ? (groupFaces?.faces.length ? groupFaces : { faces: data.members.slice(0, 4), members: data.members.length }) : null;

  const nl = useNl();
  if (nl)
    return (
      <>
        <PaneHead
          back={onBack}
          backAlways={Boolean(thread)}
          face={faces ? <GroupFace faces={faces.faces} members={faces.members} name={data!.room.name} size={30} slot={0} /> : general && !thread ? <BrandFace size={36} /> : undefined}
          title={title}
          line={line}
          right={
            data && !general && !thread ? (
              <button type="button" onClick={() => setPeople((p) => !p)} aria-expanded={people} className="nl-btn nl-btn--secondary nl-btn--sm">
                <LineIcon name="user" size={14} />
                People
              </button>
            ) : undefined
          }
        >
          {people && data && (
            <div className="nl-hud-pop" role="menu">
              <p className="nl-hud-pop-label">In this huddle</p>
              <ul>
                {data.members.map((m) => (
                  <li key={m.id}>
                    <Avatar name={m.name} photo={m.photo} size={28} tone={toneOf(m.id)} />
                    <span className="nl-hud-pop-name">{m.name}</span>
                    {m.id === data.me ? (
                      <span className="nl-hud-pop-you">You</span>
                    ) : admin ? (
                      <button type="button" onClick={() => void removePerson(m)} className="nl-hud-pop-take">
                        Take out
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              <hr />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setPeople(false);
                  onInvite();
                }}
                className="nl-hud-pop-btn"
              >
                Invite More People
              </button>
              {admin && (
                <button type="button" role="menuitem" onClick={() => void rename()} className="nl-hud-pop-btn">
                  Rename This Chat
                </button>
              )}
              <button type="button" role="menuitem" onClick={leave} className="nl-hud-pop-btn">
                Leave the Huddle
              </button>
              {admin && (
                <button type="button" role="menuitem" onClick={() => void deleteForAll()} className="nl-hud-pop-btn is-danger">
                  Delete for Everyone
                </button>
              )}
            </div>
          )}
        </PaneHead>

        <div className="nl-hud-scroll" onClick={() => people && setPeople(false)}>
          {error && !data ? (
            <ErrorBox text={error} onRetry={() => void load()} />
          ) : !data ? (
            <Spinner label="Opening the chat" />
          ) : (
            <Bubbles
              items={data.messages.map((m) => ({
                id: m.id,
                mine: m.authorId === data.me,
                who: m.author,
                whoId: m.authorId,
                photo: m.photo,
                body: m.body,
                at: m.at,
                question: m.question && !thread ? { replies: m.replies, open: () => onOpenThread(m.id) } : undefined,
                tick: otherRead && m.authorId === data.me ? (m.at <= otherRead ? "seen" : "sent") : undefined,
                quote: m.quote ? { id: m.quote.id, who: m.quote.authorId === data.me ? "You" : m.quote.author, body: m.quote.body } : undefined,
                onReply: () => setReplying(m),
              }))}
              typing={typing.length ? { names: typing, pair: Boolean(otherRead), face: otherRead ? data.members.find((x) => x.id !== data.me) ?? null : null } : null}
              empty={thread ? "No answers yet. Be the first." : general ? "Nobody has said anything yet. Start it off." : "Say hello to your huddle."}
            />
          )}
        </div>

        {data && (
          <Composer
            key={`${id}|${thread ?? ""}`}
            placeholder={thread ? "Write an answer..." : general ? "Say something to everyone..." : `Message ${data.room.name}...`}
            canAsk={general && !thread && !replying}
            gifs
            replying={replying ? { who: replying.authorId === data.me ? "yourself" : replying.author, body: replying.body } : null}
            onCancelReply={() => setReplying(null)}
            onSend={(text, q) => {
              lastPing.current = 0;
              return send(text, q);
            }}
            onTyping={onTyping}
          />
        )}
      </>
    );

  return (
    <>
      <PaneHead
        back={onBack}
        backAlways={Boolean(thread)}
        face={faces ? <GroupFace faces={faces.faces} members={faces.members} name={data!.room.name} /> : general && !thread ? <span className="flex shrink-0 items-center"><BrandFace size={34} /></span> : undefined}
        title={title}
        line={line}
        right={
          data && !general && !thread ? (
            <button
              type="button"
              onClick={() => setPeople((p) => !p)}
              aria-expanded={people}
              className="flex h-8 items-center gap-1.5 rounded-full border border-[var(--hud-line-strong)] px-3 text-[12px] font-medium text-ink transition-colors hover:bg-panel"
            >
              <LineIcon name="user" size={14} />
              People
            </button>
          ) : undefined
        }
      />
      {people && data && (
        <div className="relative">
          <div className="absolute right-4 top-1.5 z-20 w-[260px] rounded-xl border border-[var(--hud-line)] bg-card p-2 shadow-[0_16px_36px_-16px_rgba(0,0,0,0.35)]">
            <p className="px-2 pb-1 pt-1 text-[11.5px] font-medium text-muted">In this huddle</p>
            <ul className="max-h-[240px] overflow-y-auto">
              {data.members.map((m) => (
                <li key={m.id} className="flex items-center gap-2.5 px-2 py-1.5">
                  <Avatar name={m.name} photo={m.photo} size={28} tone={toneOf(m.id)} />
                  <span className="truncate text-[13px] text-ink">{m.name}</span>
                  {m.id === data.me ? (
                    <span className="ml-auto text-[11px] text-muted">You</span>
                  ) : admin ? (
                    <button
                      type="button"
                      onClick={() => void removePerson(m)}
                      className="ml-auto rounded-md px-1.5 py-0.5 text-[11.5px] text-muted transition-colors hover:bg-accent-soft hover:text-accent-dark"
                    >
                      Take out
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="mt-1 border-t border-[var(--hud-line)] pt-1.5">
              <button
                type="button"
                onClick={() => {
                  setPeople(false);
                  onInvite();
                }}
                className="w-full rounded-lg px-2 py-1.5 text-left text-[13px] font-medium text-ink hover:bg-panel"
              >
                Invite More People
              </button>
              {admin && (
                <button type="button" onClick={() => void rename()} className="w-full rounded-lg px-2 py-1.5 text-left text-[13px] font-medium text-ink hover:bg-panel">
                  Rename This Chat
                </button>
              )}
              <button type="button" onClick={leave} className="w-full rounded-lg px-2 py-1.5 text-left text-[13px] font-medium text-ink hover:bg-panel">
                Leave the Huddle
              </button>
              {admin && (
                <button type="button" onClick={() => void deleteForAll()} className="w-full rounded-lg px-2 py-1.5 text-left text-[13px] font-medium text-accent-dark hover:bg-panel">
                  Delete for Everyone
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--hud-chat)] px-4" onClick={() => people && setPeople(false)}>
        {error && !data ? (
          <ErrorBox text={error} onRetry={() => void load()} />
        ) : !data ? (
          <Spinner label="Opening the chat" />
        ) : (
          <Bubbles
            items={data.messages.map((m) => ({
              id: m.id,
              mine: m.authorId === data.me,
              who: m.author,
              whoId: m.authorId,
              photo: m.photo,
              body: m.body,
              at: m.at,
              question: m.question && !thread ? { replies: m.replies, open: () => onOpenThread(m.id) } : undefined,
              /* Ticks only between two people. */
              tick: otherRead && m.authorId === data.me ? (m.at <= otherRead ? "seen" : "sent") : undefined,
              quote: m.quote ? { id: m.quote.id, who: m.quote.authorId === data.me ? "You" : m.quote.author, body: m.quote.body } : undefined,
              onReply: () => setReplying(m),
            }))}
            typing={typing.length ? { names: typing, pair: Boolean(otherRead), face: otherRead ? data.members.find((x) => x.id !== data.me) ?? null : null } : null}
            empty={thread ? "No answers yet. Be the first." : general ? "Nobody has said anything yet. Start it off." : "Say hello to your huddle."}
          />
        )}
      </div>

      {data && (
        <Composer
          key={`${id}|${thread ?? ""}`}
          placeholder={thread ? "Write an answer..." : general ? "Say something to everyone..." : `Message ${data.room.name}...`}
          canAsk={general && !thread && !replying}
          gifs
          replying={replying ? { who: replying.authorId === data.me ? "yourself" : replying.author, body: replying.body } : null}
          onCancelReply={() => setReplying(null)}
          onSend={(text, q) => {
            lastPing.current = 0;
            return send(text, q);
          }}
          onTyping={onTyping}
        />
      )}
    </>
  );
}

function CustomerPane({ kind, id, onBack, onRead }: { kind: "landlord" | "tenant"; id: string; onBack: () => void; onRead: () => void }) {
  const [t, setT] = useState<{ title: string; about: string; phone: string | null; email: string | null; messages: CustomerMsg[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const url = `/api/m/chats/${kind}/${encodeURIComponent(id)}`;

  const load = useCallback(
    () =>
      fetch(url, { cache: "no-store" })
        .then((r) => r.json())
        .then((j: { ok?: boolean; error?: string; title?: string; about?: string; phone?: string | null; email?: string | null; messages?: CustomerMsg[] }) => {
          if (!j.ok) throw new Error(j.error ?? "The conversation did not load.");
          setT({ title: j.title ?? "", about: j.about ?? "", phone: j.phone ?? null, email: j.email ?? null, messages: j.messages ?? [] });
          setError(null);
        })
        .catch((e: Error) => setError(e.message)),
    [url]
  );

  useEffect(() => {
    void load().then(onRead);
    const timer = window.setInterval(() => void load(), 20_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const send = async (text: string): Promise<string | null> => {
    setNote(null);
    const j = (await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) })
      .then((r) => r.json())
      .catch(() => ({ ok: false, error: "No connection. Nothing was sent." }))) as { ok?: boolean; error?: string; message?: CustomerMsg; emailed?: boolean };
    if (!j.ok || !j.message) return j.error ?? "That did not send.";
    setT((x) => (x ? { ...x, messages: [...x.messages, j.message!] } : x));
    if (!j.emailed) setNote("Saved here. The email to them did not go - they will see it when they next open their portal.");
    onRead();
    return null;
  };

  const name = t?.title || (kind === "landlord" ? "Landlord" : "Tenant");
  const tone: Tone = kind === "landlord" ? "pink" : "sage";

  if (useNl())
    return (
      <>
        <PaneHead
          back={onBack}
          face={<Avatar name={name} size={36} tone={tone} />}
          title={name}
          line={t ? (kind === "landlord" ? t.about || "Landlord" : "Tenant · from their portal") : undefined}
          right={
            t && (t.phone || t.email) ? (
              <span className="nl-hud-head-acts">
                {t.phone && (
                  <a href={`tel:${t.phone.replace(/[^\d+]/g, "")}`} title={`Call ${t.phone}`} aria-label={`Call ${t.phone}`} className="nl-iconbtn nl-iconbtn--sm">
                    <Ico name="phone" size={15} />
                  </a>
                )}
                {t.email && (
                  <a href={`mailto:${t.email}`} title={t.email} aria-label={`Email ${t.email}`} className="nl-iconbtn nl-iconbtn--sm">
                    <Ico name="mail" size={15} />
                  </a>
                )}
              </span>
            ) : undefined
          }
        />
        <div className="nl-hud-scroll">
          {error && !t ? (
            <ErrorBox text={error} onRetry={() => void load()} />
          ) : !t ? (
            <Spinner label="Opening the conversation" />
          ) : (
            <Bubbles
              items={t.messages.map((m) => ({ id: m.id, mine: m.from === "agent", who: name, whoId: `${kind}:${id}`, tone, body: m.body, at: m.at, tick: m.from === "agent" ? (m.seen ? "seen" : "sent") : undefined }))}
              empty={`Nothing yet. Say hello to ${first(name)}.`}
            />
          )}
        </div>
        {t && (
          <Composer
            key={`${kind}:${id}`}
            placeholder={`Reply to ${first(name)}...`}
            foot={note ?? "Your reply is emailed to them, with a link back into this conversation."}
            footWarn={Boolean(note)}
            onSend={(text) => send(text)}
          />
        )}
      </>
    );

  return (
    <>
      <PaneHead
        back={onBack}
        face={<Avatar name={name} size={38} tone={tone} />}
        title={name}
        line={t ? (kind === "landlord" ? t.about || "Landlord" : "Tenant · from their portal") : undefined}
        right={
          t && (
            <span className="flex shrink-0 gap-1.5">
              {t.phone && (
                <a href={`tel:${t.phone.replace(/[^\d+]/g, "")}`} title={`Call ${t.phone}`} className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--hud-line-strong)] text-muted transition-colors hover:text-ink">
                  <svg viewBox="0 0 24 24" aria-hidden className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
                  </svg>
                </a>
              )}
              {t.email && (
                <a href={`mailto:${t.email}`} title={t.email} className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--hud-line-strong)] text-muted transition-colors hover:text-ink">
                  <LineIcon name="mail" size={15} />
                </a>
              )}
            </span>
          )
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--hud-chat)] px-4">
        {error && !t ? (
          <ErrorBox text={error} onRetry={() => void load()} />
        ) : !t ? (
          <Spinner label="Opening the conversation" />
        ) : (
          <Bubbles
            items={t.messages.map((m) => ({ id: m.id, mine: m.from === "agent", who: name, whoId: `${kind}:${id}`, tone, body: m.body, at: m.at, tick: m.from === "agent" ? (m.seen ? "seen" : "sent") : undefined }))}
            empty={`Nothing yet. Say hello to ${first(name)}.`}
          />
        )}
      </div>
      {t && (
        <Composer
          key={`${kind}:${id}`}
          placeholder={`Reply to ${first(name)}...`}
          foot={note ?? "Your reply is emailed to them, with a link back into this conversation."}
          footWarn={Boolean(note)}
          onSend={(text) => send(text)}
        />
      )}
    </>
  );
}

/* ── Messages ──────────────────────────────────────────────────────────── */

type Item = {
  id: string;
  mine: boolean;
  who: string;
  whoId: string;
  photo?: string | null;
  tone?: Tone;
  body: string;
  at: string;
  question?: { replies: number; open: () => void };
  /** My message in a chat of two: sent, or seen by them (WhatsApp's ticks). */
  tick?: "sent" | "seen";
  /** The message this one replies to, greyed above it in the bubble. */
  quote?: { id: string; who: string; body: string };
  /** Hovering offers Reply; absent where replying to one message is not a thing. */
  onReply?: () => void;
};

/** What a quote shows of a message: a GIF is a word, not a link. */
const quoteText = (body: string) => (isGif(body) ? "GIF" : body);

/** Bring the quoted message into view and flash it, as WhatsApp does. */
function jumpTo(id: string) {
  const el = document.getElementById(`msg-${id}`);
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.animate([{ backgroundColor: "rgba(0,0,0,0.07)" }, { backgroundColor: "rgba(0,0,0,0)" }], { duration: 1400, delay: 250, easing: "ease-out" });
}

function ReplyIcon({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 8 5 12.5 9.5 17" />
      <path d="M5.5 12.5H14a5 5 0 0 1 5 5V19" />
    </svg>
  );
}

/** One grey tick sent, two blue ticks seen - WhatsApp's own shapes and blue. */
function Ticks({ seen }: { seen: boolean }) {
  return (
    <svg viewBox="0 0 16 11" aria-label={seen ? "Seen" : "Sent"} role="img" className="ml-1 inline-block h-[11px] w-[16px] align-[-1px]" style={{ color: seen ? "#53bdeb" : "#8b8c92" }}>
      {seen ? (
        <path fill="currentColor" d="M11.07.65 10.4.1a.37.37 0 0 0-.52.06L4.94 6.39 2.3 3.93a.37.37 0 0 0-.52.02l-.5.53a.37.37 0 0 0 .02.52l3.32 3.08c.15.14.39.13.53-.03L11.13 1.17a.37.37 0 0 0-.06-.52Zm3.9 0-.67-.55a.37.37 0 0 0-.52.06l-5.9 7.33-.83-.77-.88 1.08 1.4 1.3c.16.15.4.13.54-.03l6.92-7.9a.37.37 0 0 0-.06-.52Z" />
      ) : (
        <path fill="currentColor" d="M11.07.65 10.4.1a.37.37 0 0 0-.52.06L4.94 6.39 2.3 3.93a.37.37 0 0 0-.52.02l-.5.53a.37.37 0 0 0 .02.52l3.32 3.08c.15.14.39.13.53-.03L11.13 1.17a.37.37 0 0 0-.06-.52Z" />
      )}
    </svg>
  );
}

type Typing = { names: string[]; pair: boolean; face: Face | null };

/** "• • •" rising from the foot of the chat while someone writes back. */
function TypingBubble({ typing }: { typing: Typing }) {
  const who = typing.names.map(first);
  const label = typing.pair ? "" : who.length === 1 ? `${who[0]} is typing` : who.length === 2 ? `${who[0]} and ${who[1]} are typing` : `${who.length} people are typing`;
  if (useNl())
    return (
      <li className="nl-hud-msg is-head is-typing" aria-live="polite">
        {label && <span className="nl-hud-from">{label}</span>}
        <div className="nl-hud-line">
          {typing.face ? <Avatar name={typing.face.name} photo={typing.face.photo} size={28} tone={toneOf(typing.face.id)} /> : <span className="nl-hud-facegap" />}
          <span className="nl-hud-typing" aria-label={label || "Typing"}>
            <i />
            <i />
            <i />
          </span>
        </div>
      </li>
    );
  return (
    <li className="hud-typing mt-2 flex flex-col items-start" aria-live="polite">
      {label && <span className="mb-1 ml-11 text-[11.5px] font-medium text-muted">{label}</span>}
      <div className="flex items-end gap-2">
        {typing.face ? <Avatar name={typing.face.name} photo={typing.face.photo} size={28} tone={toneOf(typing.face.id)} /> : <span className="w-7 shrink-0" />}
        <span className="flex h-[38px] items-center gap-1 rounded-2xl rounded-bl-md bg-[var(--hud-them)] px-4" aria-label={label || "Typing"}>
          <i className="hud-dot" />
          <i className="hud-dot" style={{ animationDelay: "0.16s" }} />
          <i className="hud-dot" style={{ animationDelay: "0.32s" }} />
        </span>
      </div>
    </li>
  );
}

/**
 * Oldest at the top, scrolled to the newest. Someone else's run of messages
 * carries their name at the top and their face beside the last one, as a
 * phone does. A GIF is drawn as the picture, without a bubble.
 */
function Bubbles({ items, empty, typing = null }: { items: Item[]; empty: string; typing?: Typing | null }) {
  const end = useRef<HTMLDivElement | null>(null);
  const count = items.length;
  const firstPaint = useRef(true);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: firstPaint.current ? "auto" : "smooth" });
    firstPaint.current = false;
  }, [count]);
  /* Someone starts typing: bring the bottom into view if you were near it. */
  const isTyping = Boolean(typing?.names.length);
  useEffect(() => {
    const el = end.current;
    const box = el?.parentElement?.parentElement;
    if (el && isTyping && box && box.scrollHeight - box.scrollTop - box.clientHeight < 160) el.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [isTyping]);

  const rows = useMemo(() => {
    const out: Array<{ day: string } | { m: Item; head: boolean; tail: boolean }> = [];
    let lastDay = "";
    items.forEach((m, i) => {
      const day = dayOf(m.at);
      if (day !== lastDay) {
        out.push({ day });
        lastDay = day;
      }
      const prev = items[i - 1];
      const next = items[i + 1];
      const sameAsPrev = prev && prev.mine === m.mine && prev.whoId === m.whoId && dayOf(prev.at) === day;
      const sameAsNext = next && next.mine === m.mine && next.whoId === m.whoId && dayOf(next.at) === day;
      out.push({ m, head: !sameAsPrev, tail: !sameAsNext });
    });
    return out;
  }, [items]);

  const nl = useNl();
  if (nl) {
    if (!items.length && !typing) return <p className="nl-hud-empty">{empty}</p>;
    return (
      <ol className="nl-hud-msgs">
        {rows.map((r) => {
          if ("day" in r)
            return (
              <li key={`d-${r.day}`} className="nl-hud-day">
                <span>{r.day}</span>
              </li>
            );
          const { m, head, tail } = r;
          const gif = isGif(m.body);
          const quote = m.quote && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                jumpTo(m.quote!.id);
              }}
              className="nl-hud-quote"
            >
              <b>{m.quote.who}</b>
              <span>{quoteText(m.quote.body)}</span>
            </button>
          );
          const content = gif ? (
            <div className="nl-hud-gif">
              {quote}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.body.trim()} alt="GIF" onLoad={() => items.slice(-3).some((x) => x.id === m.id) && end.current?.scrollIntoView({ block: "end" })} />
            </div>
          ) : m.question ? (
            <button type="button" onClick={m.question.open} className="nl-hud-bubble is-question">
              {m.body}
              <span className="nl-hud-q">Question · {m.question.replies ? `${m.question.replies} ${m.question.replies === 1 ? "answer" : "answers"}` : "Answer it"}</span>
            </button>
          ) : (
            <div className="nl-hud-bubble">
              {quote}
              {m.body}
            </div>
          );
          return (
            <li key={m.id} id={`msg-${m.id}`} className={`nl-hud-msg${m.mine ? " is-me" : ""}${head ? " is-head" : ""}`}>
              {!m.mine && head && <span className="nl-hud-from">{m.who}</span>}
              <div className="nl-hud-line">
                {!m.mine && (tail ? <Avatar name={m.who} photo={m.photo} size={28} tone={m.tone ?? toneOf(m.whoId)} /> : <span className="nl-hud-facegap" />)}
                {content}
                {m.onReply && (
                  <button type="button" onClick={m.onReply} aria-label={`Reply to ${m.mine ? "your message" : m.who}`} title="Reply" className="nl-hud-reply">
                    <ReplyIcon />
                  </button>
                )}
              </div>
              <span className="nl-hud-t">
                {timeOf(m.at)}
                {m.mine && m.tick && <Ticks seen={m.tick === "seen"} />}
              </span>
            </li>
          );
        })}
        {typing && typing.names.length > 0 && <TypingBubble typing={typing} />}
        <div ref={end} />
      </ol>
    );
  }
  if (!items.length && !typing) return <p className="py-16 text-center text-[13px] text-muted">{empty}</p>;
  return (
    <ol className="mx-auto flex max-w-[1040px] flex-col gap-1 px-2 py-5">
      {rows.map((r) => {
        if ("day" in r)
          return (
            <li key={`d-${r.day}`} className="my-3 flex items-center gap-3 px-1">
              <span className="h-px flex-1 bg-[var(--hud-line)]" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">{r.day}</span>
              <span className="h-px flex-1 bg-[var(--hud-line)]" />
            </li>
          );
        const { m, head, tail } = r;
        const gif = isGif(m.body);
        const quote = m.quote && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              jumpTo(m.quote!.id);
            }}
            className={`mb-1.5 block w-full min-w-[140px] rounded-lg border-l-[3px] px-2.5 py-1.5 text-left text-[12.5px] leading-snug transition-opacity hover:opacity-80 ${
              m.mine && !gif ? "border-white/60 bg-white/15 text-white/80" : "border-accent-dark/60 bg-black/[0.05] text-muted"
            }`}
          >
            <span className={`block text-[11.5px] font-semibold ${m.mine && !gif ? "text-white/90" : "text-accent-dark"}`}>{m.quote.who}</span>
            <span className="line-clamp-2 whitespace-pre-wrap break-words">{quoteText(m.quote.body)}</span>
          </button>
        );
        const bubble = `max-w-[min(74%,680px)] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-left text-[14.5px] leading-relaxed ${
          m.mine ? "rounded-br-md bg-accent-dark text-white" : "rounded-bl-md bg-[var(--hud-them)] text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
        }`;
        const content = gif ? (
          <div className="flex max-w-[260px] flex-col">
            {quote}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={m.body.trim()}
              alt="GIF"
              className="block max-h-[220px] max-w-[260px] rounded-2xl bg-panel object-contain"
              /* A picture arriving after the scroll to the newest pushes it out of
                 view; one of the last few keeps the bottom in view as it lands. */
              onLoad={() => items.slice(-3).some((x) => x.id === m.id) && end.current?.scrollIntoView({ block: "end" })}
            />
          </div>
        ) : m.question ? (
          <button type="button" onClick={m.question.open} className={`${bubble} transition-opacity hover:opacity-90`}>
            {m.body}
            <span className={`mt-1.5 block text-[11.5px] font-semibold ${m.mine ? "text-white/85" : "text-accent-dark"}`}>
              Question · {m.question.replies ? `${m.question.replies} ${m.question.replies === 1 ? "answer" : "answers"}` : "Answer it"}
            </span>
          </button>
        ) : (
          <div className={bubble}>
            {quote}
            {m.body}
          </div>
        );
        return (
          <li key={m.id} id={`msg-${m.id}`} className={`group flex flex-col rounded-xl ${m.mine ? "items-end" : "items-start"} ${head ? "mt-2" : ""}`}>
            {!m.mine && head && <span className="mb-1 ml-11 text-[11.5px] font-medium text-muted">{m.who}</span>}
            <div className={`flex max-w-full items-end gap-2 ${m.mine ? "flex-row-reverse" : ""}`}>
              {!m.mine && (tail ? <Avatar name={m.who} photo={m.photo} size={28} tone={m.tone ?? toneOf(m.whoId)} /> : <span className="w-7 shrink-0" />)}
              {content}
              {m.onReply && (
                /* Shown on hover; always faintly there on a touch screen, which has no hover. */
                <button
                  type="button"
                  onClick={m.onReply}
                  aria-label={`Reply to ${m.mine ? "your message" : m.who}`}
                  title="Reply"
                  className="flex h-7 w-7 shrink-0 self-center items-center justify-center rounded-full text-muted opacity-0 transition-opacity hover:bg-[var(--hud-them)] hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-60"
                >
                  <ReplyIcon />
                </button>
              )}
            </div>
            {tail && (
              <span className={`mt-0.5 flex items-center text-[10.5px] text-muted ${m.mine ? "mr-2" : "ml-11"}`}>
                {timeOf(m.at)}
                {m.mine && m.tick && <Ticks seen={m.tick === "seen"} />}
              </span>
            )}
          </li>
        );
      })}
      {typing && typing.names.length > 0 && <TypingBubble typing={typing} />}
      <div ref={end} />
    </ol>
  );
}

/* ── The box you type in ───────────────────────────────────────────────── */

/* The ones people reach for at work, a few rows of each. */
const EMOJI: Array<[string, string[]]> = [
  ["Smileys", ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "🙂", "😉", "😍", "🥰", "😘", "😋", "😎", "🤩", "🥳", "🤔", "🤨", "😐", "😶", "🙄", "😏", "😬", "😮", "😯", "😲", "🥺", "😢", "😭", "😤", "😡", "🤯", "😳", "🥵", "🥶", "😴", "🤒", "🤗", "🤫", "🤭", "😇", "🙃"]],
  ["Hands", ["👍", "👎", "👌", "✌️", "🤞", "🤝", "👏", "🙌", "🙏", "💪", "👋", "🤙", "👉", "👈", "👆", "👇", "✋", "🫶", "✍️", "🤷"]],
  ["Work and Home", ["🏠", "🏡", "🏘️", "🏢", "🔑", "🗝️", "🚪", "🛋️", "🛏️", "🛁", "🧹", "🔧", "🔨", "🪛", "💡", "🔥", "💧", "📋", "📝", "📅", "📞", "📱", "💻", "📧", "📸", "🚗", "☕", "🍰", "🍕", "🍻"]],
  ["Symbols", ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "💯", "✅", "❌", "⚠️", "❗", "❓", "⭐", "🌟", "✨", "🎉", "🎊", "🏆", "🥇", "🎯", "🚀", "📈", "💰", "💷", "⏰", "👀", "🙈", "🤦", "💤"]],
];

function insertAt(el: HTMLTextAreaElement | null, text: string, value: string): { value: string; caret: number } {
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  return { value: value.slice(0, start) + text + value.slice(end), caret: start + text.length };
}

/** Enter sends; Shift+Enter is a new line. */
function Composer({
  placeholder,
  canAsk = false,
  gifs = false,
  foot,
  footWarn = false,
  replying = null,
  onCancelReply,
  onSend,
  onTyping,
}: {
  placeholder: string;
  canAsk?: boolean;
  gifs?: boolean;
  foot?: string;
  footWarn?: boolean;
  /** The message being replied to, held above the box until sent or dropped. */
  replying?: { who: string; body: string } | null;
  onCancelReply?: () => void;
  onSend: (text: string, asQuestion?: boolean) => Promise<string | null>;
  /** Told when the box goes from empty to written in, and back. */
  onTyping?: (hasText: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [asQuestion, setAsQuestion] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pop, setPop] = useState<null | "emoji" | "gif">(null);
  const box = useRef<HTMLTextAreaElement | null>(null);
  const wrap = useRef<HTMLFormElement | null>(null);
  useEffect(() => box.current?.focus(), []);
  /* Pressing Reply puts you in the box, ready to write. */
  const replyKey = replying ? `${replying.who}|${replying.body}` : "";
  useEffect(() => {
    if (replyKey) box.current?.focus();
  }, [replyKey]);

  /* A click anywhere else closes the emoji or GIF tray. */
  useEffect(() => {
    if (!pop) return;
    const off = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setPop(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setPop(null);
    document.addEventListener("mousedown", off);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", off);
      window.removeEventListener("keydown", esc);
    };
  }, [pop]);

  const send = async (body?: string) => {
    const t = (body ?? text).trim();
    if (!t || busy) return;
    setBusy(true);
    setErr(null);
    const problem = await onSend(t, body ? false : asQuestion);
    setBusy(false);
    if (problem) setErr(problem);
    else if (!body) {
      setText("");
      setAsQuestion(false);
    }
    if (!problem) setPop(null);
  };

  const addEmoji = (e: string) => {
    const r = insertAt(box.current, e, text);
    setText(r.value);
    window.requestAnimationFrame(() => {
      box.current?.focus();
      box.current?.setSelectionRange(r.caret, r.caret);
    });
  };

  const nl = useNl();
  if (nl)
    return (
      <form
        ref={wrap}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="nl-hud-compose"
      >
        {pop === "emoji" && <EmojiTray onPick={addEmoji} />}
        {pop === "gif" && <GifTray busy={busy} onPick={(url) => void send(url)} />}
        {err && (
          <p className="nl-hud-note is-warn" role="alert">
            {err}
          </p>
        )}
        {replying && (
          <div className="nl-hud-replying">
            <ReplyIcon size={14} />
            <span className="nl-hud-replying-text">
              <b>Replying to {replying.who}</b>
              <span>{quoteText(replying.body)}</span>
            </span>
            <button type="button" onClick={onCancelReply} aria-label="Stop replying" title="Stop replying" className="nl-hud-tool">
              <svg viewBox="0 0 24 24" aria-hidden width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        )}
        <div className="nl-hud-box">
          <button type="button" onClick={() => setPop((p) => (p === "emoji" ? null : "emoji"))} aria-label="Emoji" aria-expanded={pop === "emoji"} title="Emoji" className={`nl-hud-tool${pop === "emoji" ? " is-on" : ""}`}>
            <svg viewBox="0 0 24 24" aria-hidden width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M8.5 14.2c.9 1.2 2.1 1.8 3.5 1.8s2.6-.6 3.5-1.8M9.2 9.7h.01M14.8 9.7h.01" />
            </svg>
          </button>
          {gifs && (
            <button type="button" onClick={() => setPop((p) => (p === "gif" ? null : "gif"))} aria-label="GIF" aria-expanded={pop === "gif"} title="GIF" className={`nl-hud-tool${pop === "gif" ? " is-on" : ""}`}>
              <span className="nl-hud-gifmark">GIF</span>
            </button>
          )}
          <textarea
            ref={box}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              onTyping?.(e.target.value.trim().length > 0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              } else if (e.key === "Escape" && replying && !pop) {
                onCancelReply?.();
              }
            }}
            rows={1}
            placeholder={placeholder}
            aria-label={placeholder.replace(/\.+$/, "")}
          />
          {canAsk && (
            <button type="button" onClick={() => setAsQuestion((x) => !x)} aria-pressed={asQuestion} aria-label="Ask as a Question" title="Ask as a Question: others answer it in its own thread" className={`nl-hud-ask${asQuestion ? " is-on" : ""}`}>
              <span aria-hidden>?</span>
              <span className="nl-hud-ask-long" aria-hidden>Ask as a Question</span>
            </button>
          )}
          <button type="submit" disabled={!text.trim() || busy} aria-label="Send" className="nl-hud-send">
            {busy ? <i className="nl-hud-spin" aria-hidden /> : <Ico name="arrow" size={16} />}
          </button>
        </div>
        {foot && <p className={`nl-hud-note${footWarn ? " is-warn" : ""}`}>{foot}</p>}
      </form>
    );

  return (
    <form
      ref={wrap}
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
      /* Room on the right for Steve's button in the corner, so the two never touch. */
      className="relative shrink-0 border-t border-[var(--hud-line)] bg-[var(--hud-bar)] py-3 pl-4 pr-16"
    >
      {pop === "emoji" && <EmojiTray onPick={addEmoji} />}
      {pop === "gif" && <GifTray busy={busy} onPick={(url) => void send(url)} />}
      {err && <p className="mx-auto mb-2 max-w-[1040px] text-[12px] text-accent-dark">{err}</p>}
      {replying && (
        <div className="mx-auto mb-2 flex max-w-[1040px] items-start gap-2 rounded-xl border-l-[3px] border-accent-dark/60 bg-black/[0.04] py-1.5 pl-2.5 pr-1.5">
          <span className="mt-0.5 shrink-0 text-muted">
            <ReplyIcon size={14} />
          </span>
          <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-muted">
            <span className="block text-[11.5px] font-semibold text-accent-dark">Replying to {replying.who}</span>
            <span className="line-clamp-2 whitespace-pre-wrap break-words">{quoteText(replying.body)}</span>
          </span>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label="Stop replying"
            title="Stop replying"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-panel hover:text-ink"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="h-[14px] w-[14px]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      )}
      <div className="mx-auto flex max-w-[1040px] items-end gap-1.5 rounded-2xl border border-[var(--hud-line-strong)] bg-[var(--hud-input)] p-1.5 pl-2 focus-within:border-ink/40">
        <button
          type="button"
          onClick={() => setPop((p) => (p === "emoji" ? null : "emoji"))}
          aria-label="Emoji"
          aria-expanded={pop === "emoji"}
          title="Emoji"
          className={`mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${pop === "emoji" ? "bg-panel text-ink" : "text-muted hover:bg-panel hover:text-ink"}`}
        >
          <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M8.5 14.2c.9 1.2 2.1 1.8 3.5 1.8s2.6-.6 3.5-1.8M9.2 9.7h.01M14.8 9.7h.01" />
          </svg>
        </button>
        {gifs && (
          <button
            type="button"
            onClick={() => setPop((p) => (p === "gif" ? null : "gif"))}
            aria-label="GIF"
            aria-expanded={pop === "gif"}
            title="GIF"
            className={`mb-0.5 flex h-8 shrink-0 items-center justify-center rounded-full px-1.5 transition-colors ${pop === "gif" ? "bg-panel text-ink" : "text-muted hover:bg-panel hover:text-ink"}`}
          >
            <span className="rounded-[5px] border-[1.6px] border-current px-1 text-[9.5px] font-bold leading-[13px] tracking-wide">GIF</span>
          </button>
        )}
        <textarea
          ref={box}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onTyping?.(e.target.value.trim().length > 0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            } else if (e.key === "Escape" && replying && !pop) {
              onCancelReply?.();
            }
          }}
          rows={1}
          placeholder={placeholder}
          className="max-h-40 min-h-[36px] flex-1 resize-none bg-transparent px-1 py-2 text-[13.5px] leading-snug text-ink outline-none placeholder:text-muted"
        />
        {canAsk && (
          <button
            type="button"
            onClick={() => setAsQuestion((x) => !x)}
            aria-pressed={asQuestion}
            title="Others answer it in its own thread"
            className={`mb-0.5 flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition-colors ${asQuestion ? "bg-accent-dark text-white" : "border border-[var(--hud-line-strong)] text-ink hover:bg-panel"}`}
          >
            <span className="text-[13px] leading-none">?</span> Ask as a Question
          </button>
        )}
        <button type="submit" disabled={!text.trim() || busy} aria-label="Send" className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-dark text-white transition-opacity disabled:opacity-30">
          {busy ? (
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
            </svg>
          )}
        </button>
      </div>
      {foot && <p className={`mx-auto mt-1.5 max-w-[1040px] px-1 text-[11.5px] ${footWarn ? "text-accent-dark" : "text-muted"}`}>{foot}</p>}
    </form>
  );
}

function Tray({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  if (useNl()) return <div className={`nl-hud-tray${wide ? " is-wide" : ""}`}>{children}</div>;
  return (
    <div className={`absolute bottom-[calc(100%-6px)] left-4 z-30 flex max-h-[360px] flex-col rounded-2xl border border-[var(--hud-line)] bg-card shadow-[0_18px_40px_-18px_rgba(0,0,0,0.4)] ${wide ? "w-[min(380px,calc(100%-32px))]" : "w-[min(340px,calc(100%-32px))]"}`}>
      {children}
    </div>
  );
}

function EmojiTray({ onPick }: { onPick: (e: string) => void }) {
  return (
    <Tray>
      <div className="overflow-y-auto p-2">
        {EMOJI.map(([group, list]) => (
          <div key={group}>
            <p className="px-1.5 pb-1 pt-1.5 text-[11px] font-medium text-muted">{group}</p>
            <div className="grid grid-cols-8 gap-0.5">
              {list.map((e) => (
                <button key={e} type="button" onClick={() => onPick(e)} className="flex h-9 items-center justify-center rounded-lg text-[20px] leading-none transition-colors hover:bg-panel">
                  {e}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Tray>
  );
}

type Gif = { id: string; title: string; preview: string; url: string; width: number; height: number };

function GifTray({ busy, onPick }: { busy: boolean; onPick: (url: string) => void }) {
  const [q, setQ] = useState("");
  const [gifs, setGifs] = useState<Gif[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const ours = TEAM_GIFS.filter((g) => !words.length || words.some((w) => g.words.some((x) => x.startsWith(w))));

  /* Searched a moment after you stop typing, not on every key. */
  useEffect(() => {
    let gone = false;
    const t = window.setTimeout(
      () => {
        setGifs(null);
        setError(null);
        fetch(`/api/gifs${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`, { cache: "no-store" })
          .then((r) => r.json())
          .then((j: { ok?: boolean; error?: string; gifs?: Gif[] }) => {
            if (gone) return;
            if (!j.ok) throw new Error(j.error ?? "GIFs could not be fetched just now.");
            setGifs(j.gifs ?? []);
          })
          .catch((e: Error) => !gone && setError(e.message));
      },
      q ? 400 : 0
    );
    return () => {
      gone = true;
      window.clearTimeout(t);
    };
  }, [q]);

  return (
    <Tray wide>
      <div className="p-2 pb-1">
        <label className="flex h-9 items-center gap-2 rounded-full border border-[var(--hud-line-strong)] bg-page px-3">
          <LineIcon name="search" size={14} className="text-muted" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Search GIFs..." className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted" />
        </label>
      </div>
      <div className="min-h-[160px] flex-1 overflow-y-auto px-2 pb-1">
        {/* The team's own first; there whether or not GIPHY answers. */}
        {ours.length > 0 && (
          <div className="mb-2">
            <p className="px-1 pb-1 text-[11px] font-medium text-muted">From the Team</p>
            <div className="flex gap-1.5">
              {ours.map((g) => (
                <button key={g.id} type="button" disabled={busy} onClick={() => onPick(g.url)} title={g.title} className="block w-[calc(50%-3px)] overflow-hidden rounded-lg bg-panel transition-opacity hover:opacity-85 disabled:opacity-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.url} alt={g.title} className="block w-full" style={{ aspectRatio: `${g.width} / ${g.height}` }} />
                </button>
              ))}
            </div>
            <p className="px-1 pb-1 pt-2.5 text-[11px] font-medium text-muted">{q.trim() ? "From GIPHY" : "Trending on GIPHY"}</p>
          </div>
        )}
        {error ? (
          <p className="m-1 mt-3 rounded-xl bg-panel p-3 text-center text-[12.5px] text-muted">{error}</p>
        ) : !gifs ? (
          <Spinner label={q ? "Searching" : "Loading GIFs"} />
        ) : !gifs.length ? (
          <p className="py-10 text-center text-[12.5px] text-muted">No GIFs for that. Try another word.</p>
        ) : (
          <div className="columns-2 gap-1.5 [&>*]:mb-1.5">
            {gifs.map((g) => (
              <button key={g.id} type="button" disabled={busy} onClick={() => onPick(g.url)} title={g.title} className="block w-full overflow-hidden rounded-lg bg-panel transition-opacity hover:opacity-85 disabled:opacity-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.preview} alt={g.title} loading="lazy" className="block w-full" style={{ aspectRatio: `${g.width} / ${g.height}` }} />
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="border-t border-[var(--hud-line)] px-3 py-1.5 text-right text-[10px] font-semibold tracking-wide text-muted">Powered by GIPHY</p>
    </Tray>
  );
}

/* ── Picking people ────────────────────────────────────────────────────── */

/**
 * Pick colleagues: to start a huddle (then name it), or to add to one you are
 * in. The team nearest first by the patch each set on the phone; only ever a
 * town for anyone.
 */
function PeoplePicker({ invite, onClose, onDone }: { invite: string | null; onClose: () => void; onDone: (roomId: string) => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [needle, setNeedle] = useState("");
  const [name, setName] = useState("");
  const [step, setStep] = useState<"pick" | "name">("pick");
  const [busy, setBusy] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/m/team", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; error?: string; people?: Person[] }) => {
        if (!j.ok) throw new Error(j.error ?? "The team did not load.");
        setPeople(j.people ?? []);
      })
      .catch((e: Error) => setError(e.message));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const n = needle.trim();
  const shown = (people ?? []).filter((p) => !n || searchMatches(n, p.name, p.town));
  const near = shown.filter((p) => p.miles != null);
  const rest = shown.filter((p) => p.miles == null);
  const chosen = (people ?? []).filter((p) => picked.has(p.id));

  const save = async () => {
    setBusy(true);
    setSaveErr(null);
    const r = (await fetch(invite ? `/api/m/rooms/${encodeURIComponent(invite)}/members` : "/api/m/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(invite ? { userIds: [...picked] } : { name: name.trim(), userIds: [...picked] }),
    })
      .then((x) => x.json())
      .catch(() => ({ ok: false, error: "No connection." }))) as { ok?: boolean; id?: string; error?: string };
    setBusy(false);
    if (r.ok) onDone(invite ?? r.id!);
    else setSaveErr(r.error ?? "That did not work.");
  };

  const nl = useNl();
  if (nl) {
    const nlGroup = (title: string, list: Person[]) =>
      list.length > 0 && (
        <div key={title}>
          <p className="nl-hud-pgroup">{title}</p>
          <ul className="nl-hud-people">
            {list.map((p) => {
              const on = picked.has(p.id);
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => toggle(p.id)} aria-pressed={on} className={`nl-hud-person${on ? " is-on" : ""}`}>
                    <Avatar name={p.name} photo={p.photo} size={34} tone={toneOf(p.id)} />
                    <span className="nl-hud-person-main">
                      <span className="nl-hud-person-name">{p.name}</span>
                      <span className="nl-hud-person-town">{p.town ? (p.miles != null ? `${p.town} · ${p.miles} mi` : p.town) : "No patch set"}</span>
                    </span>
                    <span className="nl-hud-tick" aria-hidden>
                      {on && <Ico name="check" size={12} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      );
    return (
      <div className="nl-hud-modal-back" onClick={onClose}>
        <div role="dialog" aria-modal="true" aria-label={invite ? "Invite people" : "Start a huddle"} className="nl-hud-modal" onClick={(e) => e.stopPropagation()}>
          <div className="nl-hud-modal-head">
            <div className="nl-hud-modal-text">
              <h2 className="nl-hud-modal-title">{invite ? "Invite People" : step === "name" ? "Name Your Huddle" : "Start a Huddle"}</h2>
              <p className="nl-hud-modal-sub">
                {step === "name" ? `You and ${picked.size} ${picked.size === 1 ? "other" : "others"}. Something like "Northampton Crew".` : "Tick the people you want. Nearest first, by the patch each set on the app."}
              </p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="nl-iconbtn nl-iconbtn--sm">
              <svg viewBox="0 0 24 24" aria-hidden width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>

          {step === "pick" ? (
            <>
              <div className="nl-hud-modal-search">
                <label className="nl-fsearch">
                  <Ico name="search" size={15} />
                  <input autoFocus value={needle} onChange={(e) => setNeedle(e.target.value)} type="search" placeholder="Name or town..." aria-label="Search the team" />
                </label>
              </div>
              <div className="nl-hud-modal-list">
                {error ? (
                  <div className="nl-hud-error" role="alert">
                    {error}
                  </div>
                ) : !people ? (
                  <Spinner label="Finding the team" />
                ) : (
                  <>
                    {nlGroup("Nearest You", near)}
                    {nlGroup(near.length ? "Everyone Else" : "The Team", rest)}
                    {!shown.length && <p className="nl-hud-empty is-small">Nobody matches that.</p>}
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="nl-hud-modal-name">
              <div className="nl-hud-chips">
                {chosen.map((p) => (
                  <span key={p.id} className="nl-hud-chip">
                    <Avatar name={p.name} photo={p.photo} size={22} tone={toneOf(p.id)} />
                    {first(p.name)}
                  </span>
                ))}
              </div>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && name.trim() && !busy && void save()}
                maxLength={60}
                placeholder="Huddle name"
                aria-label="Huddle name"
                className="nl-input"
              />
            </div>
          )}

          <div className="nl-hud-modal-foot">
            {saveErr && (
              <p className="nl-hud-note is-warn" role="alert">
                {saveErr}
              </p>
            )}
            <div className="nl-hud-modal-acts">
              {step === "name" && (
                <button type="button" onClick={() => setStep("pick")} className="nl-btn nl-btn--secondary">
                  Back
                </button>
              )}
              <button
                type="button"
                disabled={!picked.size || busy || (step === "name" && !name.trim())}
                onClick={() => (invite || step === "name" ? void save() : setStep("name"))}
                className="nl-btn nl-btn--primary nl-hud-modal-go"
              >
                {busy
                  ? "Saving..."
                  : !picked.size
                    ? "Tick the people you want"
                    : invite
                      ? `Add ${picked.size} to the Huddle`
                      : step === "name"
                        ? "Start the Huddle"
                        : `Next: Name It (${picked.size})`}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const group = (title: string, list: Person[]) =>
    list.length > 0 && (
      <div key={title}>
        <p className="mb-1 mt-3 px-1 text-[11.5px] font-medium text-muted">{title}</p>
        <ul>
          {list.map((p) => {
            const on = picked.has(p.id);
            return (
              <li key={p.id}>
                <button type="button" onClick={() => toggle(p.id)} className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors ${on ? "bg-accent-soft/50" : "hover:bg-panel"}`}>
                  <Avatar name={p.name} photo={p.photo} size={32} tone={toneOf(p.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-ink">{p.name}</span>
                    <span className="block truncate text-[11.5px] text-muted">{p.town ? (p.miles != null ? `${p.town} · ${p.miles} mi` : p.town) : "No patch set"}</span>
                  </span>
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-accent-dark bg-accent-dark text-white" : "border-line"}`}>
                    {on && (
                      <svg viewBox="0 0 24 24" aria-hidden className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12.5l4.5 4.5L19 7.5" />
                      </svg>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );

  return (
    <div className="hud fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div role="dialog" aria-label={invite ? "Invite people" : "Start a huddle"} className="flex max-h-[min(640px,90dvh)] w-full max-w-[440px] flex-col rounded-2xl bg-card shadow-[0_30px_60px_-20px_rgba(0,0,0,0.45)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-5 pb-3 pt-5">
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-[18px] text-ink">{invite ? "Invite People" : step === "name" ? "Name Your Huddle" : "Start a Huddle"}</h2>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {step === "name" ? `You and ${picked.size} ${picked.size === 1 ? "other" : "others"}. Something like "Northampton Crew".` : "Tick the people you want. Nearest first, by the patch each set on the app."}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--hud-line-strong)] text-muted hover:text-ink">
            ×
          </button>
        </div>

        {step === "pick" ? (
          <>
            <div className="px-5">
              <label className="flex h-9 items-center gap-2 rounded-full border border-[var(--hud-line-strong)] bg-page px-3">
                <LineIcon name="search" size={14} className="text-muted" />
                <input autoFocus value={needle} onChange={(e) => setNeedle(e.target.value)} type="search" placeholder="Name or town..." className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted" />
              </label>
            </div>
            <div className="min-h-[200px] flex-1 overflow-y-auto px-4 pb-2">
              {error ? (
                <p className="m-1 mt-4 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12.5px]">{error}</p>
              ) : !people ? (
                <Spinner label="Finding the team" />
              ) : (
                <>
                  {group("Nearest You", near)}
                  {group(near.length ? "Everyone Else" : "The Team", rest)}
                  {!shown.length && <p className="py-8 text-center text-[12.5px] text-muted">Nobody matches that.</p>}
                </>
              )}
            </div>
          </>
        ) : (
          <div className="px-5 pb-2">
            {/* Who it will be: their faces, then the name. */}
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              {chosen.map((p) => (
                <span key={p.id} className="flex items-center gap-1.5 rounded-full bg-panel py-0.5 pl-0.5 pr-2.5 text-[12px] text-ink">
                  <Avatar name={p.name} photo={p.photo} size={22} tone={toneOf(p.id)} />
                  {first(p.name)}
                </span>
              ))}
            </div>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && name.trim() && !busy && void save()}
              maxLength={60}
              placeholder="Huddle name"
              className="h-10 w-full rounded-xl border border-[var(--hud-line-strong)] bg-page px-3 text-[14px] text-ink outline-none focus:border-ink/40"
            />
          </div>
        )}

        <div className="border-t border-[var(--hud-line)] px-5 py-3">
          {saveErr && <p className="mb-2 text-[12px] text-accent-dark">{saveErr}</p>}
          <div className="flex items-center gap-2">
            {step === "name" && (
              <button type="button" onClick={() => setStep("pick")} className="h-10 rounded-full border border-[var(--hud-line-strong)] px-4 text-[13px] font-medium text-ink hover:bg-panel">
                Back
              </button>
            )}
            <button
              type="button"
              disabled={!picked.size || busy || (step === "name" && !name.trim())}
              onClick={() => (invite || step === "name" ? void save() : setStep("name"))}
              className="h-10 flex-1 rounded-full bg-ink text-[13px] font-semibold text-page transition-opacity disabled:opacity-35"
            >
              {busy
                ? "Saving..."
                : !picked.size
                  ? "Tick the people you want"
                  : invite
                    ? `Add ${picked.size} to the Huddle`
                    : step === "name"
                      ? "Start the Huddle"
                      : `Next: Name It (${picked.size})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
