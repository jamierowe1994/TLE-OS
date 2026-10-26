"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LEARNING_PAGES, type LearningPage } from "@/lib/learning/pages";
import type { Folder, Journey, JourneyId, SysFile } from "@/lib/learning/systems-types";
import PopGuide from "./PopGuide";

/**
 * One journey of the Systems tour as a computer window (Tools > Learning >
 * Systems, James, 26 Oct 2026): "it's almost like they click into a file...
 * make it feel more like a computer screen. We're clicking into files to get
 * to the right thing, and then we go through that section."
 *
 * Title bar, a breadcrumb, the journey's folders down the side and a folder's
 * files as big tiles. A file opens out of its tile: the customer's screen in a
 * device frame, the email as it lands, or the process with its summary; the
 * pop-out guide (./PopGuide) steps through it on the right. The place is in
 * the address (?folder=&file=), Esc closes a file and the arrow keys step the
 * guide. The content is lib/learning/systems; the look app/new-look/systems.css.
 */

const FALLBACK_NAME: Record<JourneyId, string> = {
  landlord: "The Landlord's Journey",
  tenant: "The Tenant's Journey",
  agent: "Your Side of the Desk",
};

const KIND_WORD: Record<SysFile["kind"], string> = { page: "Screen", email: "Email", process: "In the OS" };

function useNarrow(query = "(max-width: 760px)") {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setNarrow(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return narrow;
}

function quiet() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/* ── glyphs ──────────────────────────────────────────────────────────────── */

/* A drawn preview on each file tile (James, 26 Oct: "make these look like proper tiles rather than just that we stuck an icon on a thing"). */
function TileArt({ kind }: { kind: SysFile["kind"] }) {
  if (kind === "email")
    return (
      <svg className="nl-sx-art" width="150" height="96" viewBox="0 0 150 96" fill="none" aria-hidden>
        <ellipse cx="75" cy="88" rx="50" ry="5" fill="currentColor" opacity=".08" />
        <path className="nl-sx-art-back" d="M30 38 75 12l45 26v44a4 4 0 0 1-4 4H34a4 4 0 0 1-4-4z" fill="#fff" stroke="currentColor" strokeWidth="1.4" />
        <g className="nl-sx-art-up">
          <rect x="42" y="18" width="66" height="50" rx="4" fill="#fff" stroke="currentColor" strokeWidth="1.4" />
          <path d="M51 29h18M51 37h48M51 44h40M51 51h44" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".55" />
          <rect x="51" y="56" width="22" height="6" rx="3" fill="var(--primary)" />
          <circle cx="96" cy="29" r="5" fill="var(--primary)" opacity=".9" />
        </g>
        <path d="M30 40l45 28 45-28v42a4 4 0 0 1-4 4H34a4 4 0 0 1-4-4z" fill="#fff" stroke="currentColor" strokeWidth="1.4" />
        <path d="M30 84l34-24M120 84 86 60" stroke="currentColor" strokeWidth="1.2" opacity=".5" />
      </svg>
    );
  if (kind === "process")
    return (
      <svg className="nl-sx-art" width="150" height="96" viewBox="0 0 150 96" fill="none" aria-hidden>
        <ellipse cx="75" cy="89" rx="52" ry="5" fill="currentColor" opacity=".08" />
        <rect x="22" y="12" width="106" height="68" rx="7" fill="#fff" stroke="currentColor" strokeWidth="1.4" />
        <path d="M22 24h106" stroke="currentColor" strokeWidth="1.2" opacity=".4" />
        <circle cx="30" cy="18" r="1.8" fill="currentColor" opacity=".45" /><circle cx="36" cy="18" r="1.8" fill="currentColor" opacity=".45" /><circle cx="42" cy="18" r="1.8" fill="currentColor" opacity=".45" />
        <rect x="30" y="31" width="22" height="42" rx="3" fill="currentColor" opacity=".1" />
        <path d="M60 34h34M60 42h56M60 50h46" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".5" />
        <g className="nl-sx-art-up">
          <rect x="60" y="58" width="36" height="11" rx="5.5" fill="var(--primary)" />
          <path d="M92 62l8 20 3-8 8-3z" fill="#fff" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </g>
        <g className="nl-sx-art-spin" style={{ transformOrigin: "118px 70px" }}>
          <circle cx="118" cy="70" r="11" fill="#fff" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="118" cy="70" r="4" stroke="currentColor" strokeWidth="1.4" />
          <path d="M118 56v4M118 80v4M104 70h4M128 70h4M108 60l3 3M125 77l3 3M128 60l-3 3M111 77l-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </g>
      </svg>
    );
  return (
    <svg className="nl-sx-art" width="150" height="96" viewBox="0 0 150 96" fill="none" aria-hidden>
      <ellipse cx="75" cy="89" rx="54" ry="5" fill="currentColor" opacity=".08" />
      <rect x="16" y="12" width="104" height="70" rx="7" fill="#fff" stroke="currentColor" strokeWidth="1.4" />
      <path d="M16 23h104" stroke="currentColor" strokeWidth="1.2" opacity=".4" />
      <circle cx="24" cy="17.5" r="1.8" fill="currentColor" opacity=".45" /><circle cx="30" cy="17.5" r="1.8" fill="currentColor" opacity=".45" /><circle cx="36" cy="17.5" r="1.8" fill="currentColor" opacity=".45" />
      <rect x="24" y="30" width="42" height="26" rx="3" fill="var(--primary)" opacity=".85" />
      <path d="M31 50l8-9 6 6 4-4 9 7" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M72 32h38M72 40h30M72 48h34M24 64h52M24 71h40" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".5" />
      <g className="nl-sx-art-up">
        <rect x="104" y="30" width="32" height="56" rx="6" fill="#fff" stroke="currentColor" strokeWidth="1.4" />
        <rect x="109" y="38" width="22" height="13" rx="2" fill="currentColor" opacity=".18" />
        <path d="M110 57h20M110 63h14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity=".5" />
        <rect x="110" y="70" width="20" height="6" rx="3" fill="var(--primary)" />
      </g>
    </svg>
  );
}

export function KindGlyph({ kind, size = 40 }: { kind: SysFile["kind"]; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {kind === "page" && (
        <>
          <rect x="5" y="8" width="30" height="24" rx="3.5" />
          <path d="M5 13.5h30" />
          <circle cx="9" cy="10.8" r=".6" fill="currentColor" />
          <circle cx="11.6" cy="10.8" r=".6" fill="currentColor" />
          <circle cx="14.2" cy="10.8" r=".6" fill="currentColor" />
          <path d="M10 19h11M10 23h16M10 27h8" />
        </>
      )}
      {kind === "email" && (
        <>
          <rect x="5" y="10" width="30" height="21" rx="3.5" />
          <path d="M6.5 12l13.5 10 13.5-10" />
        </>
      )}
      {kind === "process" && (
        <>
          <path d="M26.42 20.74 L26.42 23.26 L23.99 23.74 L23.17 25.71 L24.55 27.76 L22.76 29.55 L20.71 28.17 L18.74 28.99 L18.26 31.42 L15.74 31.42 L15.26 28.99 L13.29 28.17 L11.24 29.55 L9.45 27.76 L10.83 25.71 L10.01 23.74 L7.58 23.26 L7.58 20.74 L10.01 20.26 L10.83 18.29 L9.45 16.24 L11.24 14.45 L13.29 15.83 L15.26 15.01 L15.74 12.58 L18.26 12.58 L18.74 15.01 L20.71 15.83 L22.76 14.45 L24.55 16.24 L23.17 18.29 L23.99 20.26 Z" />
          <circle cx="17" cy="22" r="3" />
          <path d="M13.25 7.99 A14.5 14.5 0 0 1 31.01 18.25" />
          <path d="M32.96 14.41 L31.01 18.25 L27.40 15.90" />
        </>
      )}
    </svg>
  );
}

function FolderGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" aria-hidden>
      <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function Chev({ back, size = 14 }: { back?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={back ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}

function Spin() {
  return <span className="nl-sx-spin" aria-hidden />;
}

/* ── an open file's pieces ──────────────────────────────────────────────── */

/** A demo screen in its device: drawn at its own size and scaled to fit, so the page lays out as it would for them. */
function Device({ page, narrow }: { page: LearningPage; narrow: boolean }) {
  const meta = LEARNING_PAGES[page];
  /* A desktop screen on a phone is shown as the phone would show it. */
  const phone = meta.device === "phone" || narrow;
  const W = phone ? 390 : 1280;
  const H = phone ? 844 : 800;
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (loaded) return;
    const t = window.setTimeout(() => setSlow(true), 15000);
    return () => window.clearTimeout(t);
  }, [loaded]);

  /* Phones stand no taller than 700px; desktops take the width they are given. */
  const bezel = phone ? 12 : 0;
  const scale = width ? Math.min(1, phone ? Math.min((width - bezel * 2) / W, 700 / H) : width / W) : 0;

  return (
    <figure className="nl-sx-device-wrap">
      <div ref={box} className="nl-sx-device-box">
        {scale > 0 && (
          <div className={`nl-sx-device ${phone ? "is-phone" : "is-desktop"}`} style={{ width: W * scale + bezel * 2 }}>
            {!phone && (
              <div className="nl-sx-device-bar" aria-hidden>
                <i />
                <i />
                <i />
                <span>{meta.label}</span>
              </div>
            )}
            <div className="nl-sx-device-screen" style={{ width: W * scale, height: H * scale }}>
              <iframe
                src={meta.src}
                title={meta.label}
                loading="eager"
                onLoad={() => setLoaded(true)}
                style={{ width: W, height: H, transform: `scale(${scale})` }}
              />
              {!loaded && (
                <div className="nl-sx-device-wait">
                  <Spin />
                  <span>{slow ? "Still opening. You can open it full size instead." : "Opening the screen"}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <figcaption className="nl-sx-device-cap">
        <span>{meta.label}</span>
        <a href={meta.src} target="_blank" rel="noreferrer" className="nl-sx-full">
          Open full size
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M14 5h5v5M19 5l-8 8M11 6H6a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-5" />
          </svg>
        </a>
      </figcaption>
    </figure>
  );
}

type Mail = { state: "wait" } | { state: "bad"; error: string } | { state: "ok"; subject: string; html: string };

/** An email as it lands, from /api/tools/learning/email (read only, never sent). */
function Email({ id }: { id: string }) {
  const [mail, setMail] = useState<Mail>({ state: "wait" });
  const [height, setHeight] = useState(480);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const ac = new AbortController();
    setMail({ state: "wait" });
    fetch(`/api/tools/learning/email?id=${encodeURIComponent(id)}`, { cache: "no-store", signal: ac.signal })
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as { ok?: boolean; subject?: string; html?: string; error?: string } | null;
        if (!r.ok || !j?.ok || typeof j.html !== "string") throw new Error(j?.error || `That email did not load (${r.status}).`);
        setMail({ state: "ok", subject: j.subject ?? "", html: j.html });
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        setMail({ state: "bad", error: e instanceof Error ? e.message : "That email did not load." });
      });
    return () => ac.abort();
  }, [id]);

  /* Links in the email open in a new tab, never inside the preview. */
  const doc = useMemo(() => (mail.state === "ok" ? `<base target="_blank">${mail.html}` : ""), [mail]);

  const fit = useCallback(() => {
    const d = frame.current?.contentDocument;
    if (!d?.documentElement) return;
    const h = Math.max(d.documentElement.scrollHeight, d.body?.scrollHeight ?? 0);
    if (h > 0) setHeight(h);
  }, []);

  const onLoad = useCallback(() => {
    fit();
    const d = frame.current?.contentDocument;
    if (!d) return;
    /* Pictures arrive after the load: size again as each one does. */
    d.querySelectorAll("img").forEach((img) => img.addEventListener("load", fit, { once: true }));
    try {
      const ro = new ResizeObserver(fit);
      ro.observe(d.documentElement);
      frame.current?.addEventListener("load", () => ro.disconnect(), { once: true });
    } catch {
      /* fine: sized once */
    }
  }, [fit]);

  if (mail.state === "wait")
    return (
      <div className="nl-sx-mail">
        <div className="nl-sx-wait">
          <Spin /> Opening the email
        </div>
      </div>
    );
  if (mail.state === "bad")
    return (
      <div className="nl-sx-mail">
        <p className="nl-sx-bad">{mail.error}</p>
      </div>
    );
  return (
    <div className="nl-sx-mail">
      <div className="nl-sx-mail-head">
        <span className="nl-sx-mail-label">Subject</span>
        <p className="nl-sx-mail-subject">{mail.subject}</p>
      </div>
      <iframe
        ref={frame}
        className="nl-sx-mail-frame"
        title={mail.subject || "The email"}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        srcDoc={doc}
        onLoad={onLoad}
        style={{ height }}
      />
    </div>
  );
}

/** A process with no screen of its own: what it is, the steps, and the way in. */
function Summary({ file }: { file: SysFile }) {
  return (
    <div className="nl-sx-card">
      <span className="nl-sx-card-art">
        <KindGlyph kind="process" size={52} />
      </span>
      <h3 className="nl-sx-card-title">Step by Step</h3>
      <p className="nl-sx-card-blurb">{file.guide.length ? `${file.guide.length} steps, done in the OS.` : file.blurb}</p>
      {file.guide.length > 0 && (
        <ol className="nl-sx-card-steps">
          {file.guide.map((g, i) => (
            <li key={g.title + i}>
              <b>{i + 1}</b>
              <span>
                <strong>{g.title}</strong>
                {g.says}
              </span>
            </li>
          ))}
        </ol>
      )}
      {file.you && <p className="nl-sx-card-you">{file.you.says}</p>}
      {(file.opens || file.you?.href) && (
        <Link href={file.opens?.href ?? file.you!.href!} className="nl-sx-go">
          {file.opens?.label ?? "Open it in the OS"} <Chev />
        </Link>
      )}
    </div>
  );
}

type View = { key: string; label: string; draw: (narrow: boolean) => React.ReactNode };

function viewsOf(file: SysFile): View[] {
  const page = (p: LearningPage): View => ({ key: `page:${p}`, label: LEARNING_PAGES[p].label, draw: (n) => <Device key={p + String(n)} page={p} narrow={n} /> });
  const out: View[] = [];
  if (file.kind === "page" && file.page) out.push(page(file.page));
  if (file.kind === "email" && file.email) {
    const id = file.email;
    out.push({ key: "email", label: "The Email", draw: () => <Email id={id} /> });
  }
  if (file.kind === "process" && file.shows) out.push(page(file.shows));
  if (file.kind !== "process" && file.shows && file.shows !== file.page) out.push(page(file.shows));
  if (file.kind === "process") out.push({ key: "summary", label: "The Summary", draw: () => <Summary file={file} /> });
  if (!out.length) out.push({ key: "none", label: file.name, draw: () => <p className="nl-sx-none">Nothing to show for this one yet.</p> });
  return out;
}

/* ── the explorer ───────────────────────────────────────────────────────── */

export default function Explorer({ side, journey, initialFolder, initialFile }: { side: JourneyId; journey: Journey | null; initialFolder: string | null; initialFile: string | null }) {
  const folders: Folder[] = journey?.folders ?? [];
  const name = journey?.name ?? FALLBACK_NAME[side];
  const narrow = useNarrow();

  const start = useMemo(() => {
    const withFile = initialFile ? folders.find((f) => f.files.some((x) => x.id === initialFile)) : undefined;
    const folder = withFile ?? folders.find((f) => f.id === initialFolder) ?? folders[0];
    return { folder: folder?.id ?? null, file: withFile ? initialFile : null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [folderId, setFolderId] = useState<string | null>(start.folder);
  const [fileId, setFileId] = useState<string | null>(start.file);
  const [closing, setClosing] = useState(false);
  const [origin, setOrigin] = useState<string>("50% 0%");
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<"next" | "back">("next");
  const [small, setSmall] = useState(false);
  const [viewKey, setViewKey] = useState<string | null>(null);

  const pane = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLDivElement>(null);
  const win = useRef<HTMLDivElement>(null);
  const fileHead = useRef<HTMLHeadingElement>(null);
  const lastTile = useRef<string | null>(null);

  const folder = folders.find((f) => f.id === folderId) ?? folders[0] ?? null;
  const file = folder?.files.find((x) => x.id === fileId) ?? null;
  const views = useMemo(() => (file ? viewsOf(file) : []), [file]);
  const view = views.find((v) => v.key === viewKey) ?? views[0] ?? null;
  const total = useMemo(() => folders.reduce((n, f) => n + f.files.length, 0), [folders]);

  /* The place in the address, so a link lands on it. */
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      if (folder) u.searchParams.set("folder", folder.id);
      else u.searchParams.delete("folder");
      if (file) u.searchParams.set("file", file.id);
      else u.searchParams.delete("file");
      window.history.replaceState(window.history.state, "", u.toString());
    } catch {
      /* fine */
    }
  }, [folder, file]);

  /* On a phone the folders are a row of chips: keep the open one in view. */
  useEffect(() => {
    const on = win.current?.querySelector<HTMLElement>(".nl-sx-folder.is-on");
    const row = on?.closest("ul");
    if (!on || !row || row.scrollWidth <= row.clientWidth) return;
    const l = on.offsetLeft - row.offsetLeft;
    if (l < row.scrollLeft || l + on.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollTo({ left: Math.max(0, l - 16), behavior: quiet() ? "auto" : "smooth" });
  }, [folderId]);

  const toTop = useCallback(() => {
    main.current?.scrollTo({ top: 0 });
    const top = win.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) win.current?.scrollIntoView({ block: "start", behavior: quiet() ? "auto" : "smooth" });
  }, []);

  const openFolder = useCallback(
    (id: string) => {
      setFolderId(id);
      setFileId(null);
      setClosing(false);
      toTop();
    },
    [toTop]
  );

  const openFile = useCallback(
    (f: SysFile, tile: HTMLElement | null) => {
      const box = pane.current?.getBoundingClientRect();
      const r = tile?.getBoundingClientRect();
      if (box && r) setOrigin(`${Math.round(r.left + r.width / 2 - box.left)}px ${Math.round(r.top + r.height / 2 - box.top)}px`);
      lastTile.current = f.id;
      setFileId(f.id);
      setStep(0);
      setDir("next");
      setSmall(false);
      setViewKey(null);
      setClosing(false);
      toTop();
      window.requestAnimationFrame(() => fileHead.current?.focus({ preventScroll: true }));
    },
    [toTop]
  );

  const closeFile = useCallback(() => {
    if (!fileId) return;
    const done = () => {
      setFileId(null);
      setClosing(false);
      window.requestAnimationFrame(() => {
        const t = pane.current?.querySelector<HTMLElement>(`[data-file="${lastTile.current}"]`);
        t?.focus({ preventScroll: true });
        t?.scrollIntoView({ block: "nearest" });
      });
    };
    if (quiet()) return done();
    setClosing(true);
    window.setTimeout(done, 200);
  }, [fileId]);

  const goStep = useCallback(
    (to: number) => {
      if (!file) return;
      const max = Math.max(0, file.guide.length - 1);
      const n = Math.max(0, Math.min(max, to));
      if (n === step) return;
      setDir(n > step ? "next" : "back");
      setStep(n);
    },
    [file, step]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!file) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeFile();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setSmall(false);
        goStep(step + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSmall(false);
        goStep(step - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [file, step, goStep, closeFile]);

  return (
    <div data-look="new" className="nl-page nl-sx">
      <Link href="/tools/learning/systems" className="nl-sx-back">
        <Chev back size={15} /> Systems
      </Link>

      <div ref={win} className={`nl-sx-win${file ? " is-open" : ""}${file && small ? " is-guide-small" : ""}`}>
        <div className="nl-sx-bar">
          <span className="nl-sx-lights" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="nl-sx-bar-title">{name}</span>
          <span className="nl-sx-bar-n">{journey ? `${total} ${total === 1 ? "file" : "files"}` : ""}</span>
        </div>

        <nav className="nl-sx-crumbs" aria-label="Where you are">
          <ol>
            <li>
              <Link href="/tools/learning/systems">Systems</Link>
            </li>
            <li>
              {folder ? (
                <button type="button" onClick={() => folders[0] && openFolder(folders[0].id)}>
                  {name}
                </button>
              ) : (
                <span aria-current="page">{name}</span>
              )}
            </li>
            {folder && (
              <li>
                {file ? (
                  <button type="button" onClick={closeFile}>
                    {folder.name}
                  </button>
                ) : (
                  <span aria-current="page">{folder.name}</span>
                )}
              </li>
            )}
            {file && (
              <li>
                <span aria-current="page">{file.name}</span>
              </li>
            )}
          </ol>
        </nav>

        {!journey || !folders.length ? (
          <div className="nl-sx-empty">
            <span className="nl-sx-empty-art">
              <FolderGlyph />
            </span>
            <p className="nl-sx-empty-title">Being Written</p>
            <p className="nl-sx-empty-says">This journey&apos;s folders are on their way. Have a look at another journey for now.</p>
            <Link href="/tools/learning/systems" className="nl-sx-go">
              Back to Systems <Chev />
            </Link>
          </div>
        ) : (
          <div className="nl-sx-body">
            <nav className="nl-sx-side" aria-label="Folders">
              <p className="nl-sx-side-h">Folders</p>
              <ul>
                {folders.map((f) => (
                  <li key={f.id}>
                    <button type="button" className={`nl-sx-folder${f.id === folder?.id ? " is-on" : ""}`} aria-current={f.id === folder?.id ? "true" : undefined} title={file ? f.name : undefined} onClick={() => openFolder(f.id)}>
                      <FolderGlyph />
                      <span className="nl-sx-folder-name">{f.name}</span>
                      <span className="nl-sx-folder-n">{f.files.length}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            <div ref={pane} className="nl-sx-pane">
              <div ref={main} className="nl-sx-main">
                {!file && folder && (
                  <section key={folder.id} className="nl-sx-folderview" aria-labelledby="nl-sx-folder-title">
                    <header className="nl-sx-folder-head">
                      <h2 id="nl-sx-folder-title" className="nl-sx-h">
                        {folder.name}
                      </h2>
                      <p className="nl-sx-folder-blurb">{folder.blurb}</p>
                    </header>
                    {folder.files.length ? (
                      <ul className="nl-sx-tiles">
                        {folder.files.map((f, i) => (
                          <li key={f.id} style={{ animationDelay: `${40 + i * 45}ms` }}>
                            <button type="button" className={`nl-sx-tile is-${f.kind}`} data-file={f.id} onClick={(e) => openFile(f, e.currentTarget)}>
                              <span className="nl-sx-tile-art">
                                <TileArt kind={f.kind} />
                                <em>{KIND_WORD[f.kind]}</em>
                              </span>
                              <span className="nl-sx-tile-text">
                                <span className="nl-sx-tile-when">{f.when}</span>
                                <span className="nl-sx-tile-name">{f.name}</span>
                                <span className="nl-sx-tile-blurb">{f.blurb}</span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="nl-sx-none">Nothing in this folder yet.</p>
                    )}
                  </section>
                )}

                {file && (
                  <section
                    key={file.id}
                    className={`nl-sx-file${closing ? " is-closing" : ""}${small ? " is-small" : ""}`}
                    style={{ transformOrigin: origin }}
                    aria-labelledby="nl-sx-file-title"
                  >
                    <header className="nl-sx-file-head">
                      <button type="button" className="nl-sx-up" onClick={closeFile}>
                        <Chev back /> {folder?.name}
                      </button>
                      <div className="nl-sx-file-row">
                        <span className={`nl-sx-file-art is-${file.kind}`}>
                          <KindGlyph kind={file.kind} size={28} />
                        </span>
                        <div className="nl-sx-file-words">
                          <p className="nl-sx-file-when">
                            {KIND_WORD[file.kind]} <span aria-hidden>·</span> {file.when}
                          </p>
                          <h2 id="nl-sx-file-title" ref={fileHead} tabIndex={-1} className="nl-sx-h">
                            {file.name}
                          </h2>
                          <p className="nl-sx-file-blurb">{file.blurb}</p>
                        </div>
                        <button type="button" className="nl-sx-x" onClick={closeFile} aria-label="Close the file" title="Close (Esc)">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
                            <path d="M6 6l12 12M18 6L6 18" />
                          </svg>
                        </button>
                      </div>
                      {views.length > 1 && (
                        <div className="nl-sx-views" role="tablist" aria-label="What to show">
                          {views.map((v) => (
                            <button key={v.key} type="button" role="tab" aria-selected={v.key === view?.key} className="nl-sx-viewbtn" onClick={() => setViewKey(v.key)}>
                              {v.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </header>
                    <div className="nl-sx-stage" key={view?.key}>
                      {view?.draw(narrow)}
                    </div>
                  </section>
                )}
              </div>

              {file && !closing && (
                <div className={`nl-sx-dock${small ? " is-small" : ""}`}>
                  <PopGuide file={file} step={step} dir={dir} onStep={goStep} small={small} onSmall={setSmall} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
