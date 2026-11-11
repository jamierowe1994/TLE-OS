"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Tabs } from "@/components/new-look/Parts";
import { LEARNING_PAGES, type LearningPage } from "@/lib/learning/pages";
import type { Folder, Journey, JourneyId, SysFile } from "@/lib/learning/systems-types";
import PopGuide from "./PopGuide";
import { FolderFan, TilePicture, schemeOf } from "./TileArt";

/**
 * One journey of the Systems tour (Tools > Learning > Systems, James, 26 Oct
 * 2026): "it's almost like they click into a file... We're clicking into files
 * to get to the right thing." Then, the same day: no window inside a window -
 * "just have them as folders on the screen, and they click in and then click
 * out... When they click on one of them, it will pop out."
 *
 * So: the journey's folders as big drawn folders on the page; click one and
 * its files show, with the folders as tabs across the top to hop between them;
 * click a file and it pops out over the darkened page (the floating-stage
 * look): the customer's screen in a device frame, the email as it lands, or
 * the process with its summary, with the pop-out guide (./PopGuide) stepping
 * through it beside it. The place is in the address (?folder=&file=), Esc
 * closes a file then the folder, and the arrow keys step the guide. The
 * content is lib/learning/systems; the look app/new-look/systems.css.
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
function Summary({ file, art }: { file: SysFile; art?: ReactNode }) {
  return (
    <div className="nl-sx-card">
      {art}
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

function viewsOf(file: SysFile, art?: ReactNode): View[] {
  const page = (p: LearningPage): View => ({ key: `page:${p}`, label: LEARNING_PAGES[p].label, draw: (n) => <Device key={p + String(n)} page={p} narrow={n} /> });
  const out: View[] = [];
  if (file.kind === "page" && file.page) out.push(page(file.page));
  if (file.kind === "email" && file.email) {
    const id = file.email;
    out.push({ key: "email", label: "The Email", draw: () => <Email id={id} /> });
  }
  if (file.kind === "process" && file.shows) out.push(page(file.shows));
  if (file.kind !== "process" && file.shows && file.shows !== file.page) out.push(page(file.shows));
  if (file.kind === "process") out.push({ key: "summary", label: "The Summary", draw: () => <Summary file={file} art={art} /> });
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
    const folder = withFile ?? folders.find((f) => f.id === initialFolder);
    return { folder: folder?.id ?? null, file: withFile ? initialFile : null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* No folder chosen: the folders on the page. */
  const [folderId, setFolderId] = useState<string | null>(start.folder);
  const [fileId, setFileId] = useState<string | null>(start.file);
  const [closing, setClosing] = useState(false);
  const [origin, setOrigin] = useState<string>("50% 30%");
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<"next" | "back">("next");
  const [small, setSmall] = useState(false);
  const [viewKey, setViewKey] = useState<string | null>(null);

  const fileHead = useRef<HTMLHeadingElement>(null);
  const lastTile = useRef<string | null>(null);
  const lastFolder = useRef<string | null>(null);

  const folder = folders.find((f) => f.id === folderId) ?? null;
  const file = folder?.files.find((x) => x.id === fileId) ?? null;
  /* Where the open folder and file sit, which is what picks a tile's colours. */
  const folderAt = folder ? folders.indexOf(folder) : 0;
  const fileScheme = schemeOf(folderAt, folder && file ? folder.files.indexOf(file) : 0);
  const views = useMemo(
    () =>
      file
        ? viewsOf(
            file,
            <span className={`nl-sx-card-art nl-ta is-s${fileScheme}`}>
              <TilePicture side={side} id={file.id} kind={file.kind} />
            </span>,
          )
        : [],
    [file, fileScheme, side],
  );
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

  /* The page stays put under a popped-out file. */
  useEffect(() => {
    if (!file) return;
    const was = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = was;
    };
  }, [file]);

  const openFolder = useCallback((id: string | null) => {
    if (id) lastFolder.current = id;
    setFolderId(id);
    setFileId(null);
    setClosing(false);
    if (!id) {
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-folder="${lastFolder.current}"]`)?.focus({ preventScroll: true }));
    }
  }, []);

  const openFile = useCallback((f: SysFile, tile: HTMLElement | null) => {
    /* It grows from the side of the screen its tile was on. */
    const r = tile?.getBoundingClientRect();
    if (r) setOrigin(`${Math.round(((r.left + r.width / 2) / window.innerWidth) * 100)}% ${Math.round(((r.top + r.height / 2) / window.innerHeight) * 100)}%`);
    lastTile.current = f.id;
    setFileId(f.id);
    setStep(0);
    setDir("next");
    setSmall(false);
    setViewKey(null);
    setClosing(false);
    window.requestAnimationFrame(() => fileHead.current?.focus({ preventScroll: true }));
  }, []);

  const closeFile = useCallback(() => {
    if (!fileId) return;
    const done = () => {
      setFileId(null);
      setClosing(false);
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-file="${lastTile.current}"]`)?.focus({ preventScroll: true }));
    };
    if (quiet()) return done();
    setClosing(true);
    window.setTimeout(done, 220);
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
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        if (file) {
          e.preventDefault();
          closeFile();
        } else if (folder) {
          e.preventDefault();
          openFolder(null);
        }
        return;
      }
      if (!file) return;
      if (e.key === "ArrowRight") {
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
  }, [file, folder, step, goStep, closeFile, openFolder]);

  return (
    <div data-look="new" className="nl-page nl-sx nl-edge">
      <Link href="/tools/learning/systems" className="nl-sx-back">
        <Chev back size={15} /> Systems
      </Link>
      <header className="nl-sx-head">
        <p className="nl-eyebrow">{journey ? `${total} ${total === 1 ? "file" : "files"} in ${folders.length} ${folders.length === 1 ? "folder" : "folders"}` : "Systems"}</p>
        <h1 className="nl-sx-title">{name}</h1>
        {journey?.says && <p className="nl-sx-says">{journey.says}</p>}
      </header>

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
      ) : !folder ? (
        /* The folders, on the page. */
        <ul className="nl-sx-folders" aria-label="Folders">
          {folders.map((f, i) => (
            <li key={f.id} style={{ animationDelay: `${60 + i * 80}ms` }}>
              <button type="button" className="nl-sx-fold" data-folder={f.id} onClick={() => openFolder(f.id)}>
                <span className={`nl-sx-fold-art nl-ta is-s${schemeOf(i, 4)}`}>
                  <FolderFan side={side} files={f.files} base={i} />
                </span>
                <span className="nl-sx-fold-text">
                  <span className="nl-sx-fold-n">{f.files.length === 1 ? "1 file" : `${f.files.length} files`}</span>
                  <span className="nl-sx-fold-name">{f.name}</span>
                  <span className="nl-sx-fold-blurb">{f.blurb}</span>
                  <span className="nl-sx-fold-go">
                    Open the folder <Chev />
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        /* Inside a folder: the folders as tabs, the files as tiles. */
        <section key={folder.id} className="nl-sx-folderview" aria-labelledby="nl-sx-folder-title">
          <div className="nl-sx-tabsrow">
            <button type="button" className="nl-sx-up" onClick={() => openFolder(null)}>
              <Chev back /> All folders
            </button>
            <Tabs
              label="Folders"
              className="nl-sx-tabs"
              value={folder.id}
              onChange={(id) => openFolder(id)}
              items={folders.map((f) => ({ id: f.id, label: f.name, count: f.files.length }))}
            />
          </div>
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
                    <span className={`nl-sx-tile-art nl-ta is-s${schemeOf(folderAt, i)}`}>
                      <TilePicture side={side} id={f.id} kind={f.kind} />
                      <em>{KIND_WORD[f.kind]}</em>
                      <i className="nl-ta-n">{String(i + 1).padStart(2, "0")}</i>
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

      {file && folder && (
        /* The file, popped out over the darkened page, its guide beside it. */
        <div className={`nl-sx-pop${closing ? " is-closing" : ""}${small ? " is-guide-small" : ""}`} role="dialog" aria-modal="true" aria-labelledby="nl-sx-file-title">
          <button type="button" className="nl-sx-pop-scrim" aria-label="Close the file" onClick={closeFile} />
          <div className="nl-sx-pop-grid">
            <section key={file.id} className="nl-sx-file" style={{ transformOrigin: origin }}>
              <header className="nl-sx-file-head">
                <div className="nl-sx-file-row">
                  <span className={`nl-sx-file-art nl-ta is-s${fileScheme}`}>
                    <TilePicture side={side} id={file.id} kind={file.kind} />
                  </span>
                  <div className="nl-sx-file-words">
                    <p className="nl-sx-file-when">
                      {folder.name} <span aria-hidden>·</span> {file.when}
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
            {!closing && (
              <div className={`nl-sx-dock${small ? " is-small" : ""}`}>
                <PopGuide file={file} step={step} dir={dir} onStep={goStep} small={small} onSmall={setSmall} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
