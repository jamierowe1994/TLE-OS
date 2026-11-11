"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Menu } from "@/components/new-look/Parts";
import { toast } from "@/lib/toast";
import { hiddenOf, toWebsiteShape, type CaseFacts, type CasePhoto, type HideKey } from "@/lib/case-study-shape";

/* One case study, in the visual editor (James, 11 Nov 2026: "a bit like
   Squarespace"). The middle of the screen is the real website page, drawn
   by the website itself in a frame (its /editor/case-study), with this case
   study handed to it by message. In Edit the words are typed in place on the
   page, every photo has Change photo, and each fact and the advert can be
   shown or hidden; Preview is the page exactly as it will go out. It saves as
   the agent goes; Put on the website publishes it. */

type Study = {
  id: string; slug: string; listingId: string; status: "draft" | "published"; agentRexId: string | null; agentName: string;
  title: string; area: string; intro: string; headline: string; advert: string; story: string; notes: string;
  photos: CasePhoto[]; facts: CaseFacts; showRent: boolean; showDays: boolean; hidden: HideKey[];
  publishedAt: string | null; updatedAt: string; websiteUrl: string;
};
type Editable = Pick<Study, "title" | "intro" | "headline" | "advert" | "story" | "notes" | "photos" | "showRent" | "showDays" | "hidden">;
const EDITABLE: (keyof Editable)[] = ["title", "intro", "headline", "advert", "story", "notes", "photos", "showRent", "showDays", "hidden"];
const TEXT_FIELDS = ["title", "intro", "story", "headline", "advert", "notes"] as const;
type TextField = (typeof TEXT_FIELDS)[number];

const FRAME_PATIENCE_MS = 15_000;

const pick = (s: Study): Editable => Object.fromEntries(EDITABLE.map((k) => [k, s[k]])) as Editable;

export default function CaseStudyStudio() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [study, setStudy] = useState<Study | null>(null);
  const [form, setForm] = useState<Editable | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [save, setSave] = useState<"saved" | "saving" | "unsaved" | "failed">("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "publish" | "unpublish" | "remove">(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [frameReady, setFrameReady] = useState(false);
  /* The frame's load: 0 while waiting, "failed" after FRAME_PATIENCE_MS with no answer. */
  const [frameState, setFrameState] = useState<"waiting" | "failed">("waiting");
  const [frameKey, setFrameKey] = useState(0);
  const [picker, setPicker] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [askRemove, setAskRemove] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Editable | null>(null);
  const fileIn = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/case-studies/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (r) => ({ r, d: (await r.json().catch(() => ({}))) as { ok?: boolean; caseStudy?: Study; error?: string } }))
      .then(({ r, d }) => {
        if (!live) return;
        if (!r.ok || !d.caseStudy) return setLoadError(d.error ?? "This case study couldn't be opened.");
        setStudy(d.caseStudy);
        setForm(pick(d.caseStudy));
        latest.current = pick(d.caseStudy);
      })
      .catch(() => live && setLoadError("This case study couldn't be opened. Check your connection and try again."));
    return () => { live = false; };
  }, [id]);

  const site = useMemo(() => (study ? new URL(study.websiteUrl).origin : null), [study]);

  const persist = useCallback(async (body: Partial<Editable> & { status?: "draft" | "published" }) => {
    setSave("saving");
    try {
      const r = await fetch(`/api/case-studies/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; caseStudy?: Study; error?: string };
      if (!r.ok || !d.caseStudy) throw new Error(d.error ?? "That didn't save. Try again.");
      setStudy(d.caseStudy);
      setSave(latest.current && JSON.stringify(latest.current) !== JSON.stringify(pick(d.caseStudy)) ? "unsaved" : "saved");
      setSaveError(null);
      return d.caseStudy;
    } catch (e) {
      setSave("failed");
      setSaveError(e instanceof Error ? e.message : "That didn't save. Try again.");
      return null;
    }
  }, [id]);

  /* Saves a moment after the last change. */
  const change = useCallback((patch: Partial<Editable>, wait = 900) => {
    const base = latest.current;
    if (!base) return;
    const next = { ...base, ...patch };
    latest.current = next;
    setForm(next);
    setSave("unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (latest.current) void persist(latest.current); }, wait);
  }, [persist]);

  const toggle = useCallback((key: HideKey) => {
    const f = latest.current;
    if (!f) return;
    const off = hiddenOf(f).includes(key);
    const hidden = off ? f.hidden.filter((k) => k !== key) : [...f.hidden, key];
    change({ hidden, ...(key === "rent" ? { showRent: off } : {}), ...(key === "days" ? { showDays: off } : {}) }, 300);
  }, [change]);

  /* What the frame draws: the website's own shape, built the same way as the feed. */
  const draft = useMemo(() => {
    if (!study || !form) return null;
    const c = toWebsiteShape({ ...study, ...form }, window.location.origin, { full: true });
    return { c, hidden: hiddenOf(form), mode };
  }, [study, form, mode]);

  useEffect(() => {
    if (!frameReady || !draft || !site) return;
    frame.current?.contentWindow?.postMessage({ type: "cs:draft", draft }, site);
  }, [draft, frameReady, site]);

  /* The hand-over (James, 11 Nov 2026: stuck on "Loading the website" for
     two minutes). Waiting for the page to say hello once could miss it, so
     until it answers the draft is offered every half second; the page
     answers each one. No answer in FRAME_PATIENCE_MS says so, with Try again,
     instead of spinning for ever. */
  const draftRef = useRef(draft);
  draftRef.current = draft;
  useEffect(() => {
    if (frameReady || !site) return;
    setFrameState("waiting");
    const started = Date.now();
    const offer = setInterval(() => {
      if (draftRef.current) frame.current?.contentWindow?.postMessage({ type: "cs:draft", draft: draftRef.current }, site);
      if (Date.now() - started > FRAME_PATIENCE_MS) {
        clearInterval(offer);
        setFrameState("failed");
      }
    }, 500);
    return () => clearInterval(offer);
  }, [frameReady, site, frameKey]);

  useEffect(() => {
    if (!site) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== site || e.source !== frame.current?.contentWindow) return;
      const d = e.data as { type?: string; field?: string; value?: string; slot?: number; key?: HideKey };
      if (d?.type === "cs:ready") setFrameReady(true);
      else if (d?.type === "cs:text" && TEXT_FIELDS.includes(d.field as TextField) && typeof d.value === "string") change({ [d.field as TextField]: d.value.slice(0, 8000) });
      else if (d?.type === "cs:photo" && typeof d.slot === "number") setPicker(d.slot);
      else if (d?.type === "cs:toggle" && d.key) toggle(d.key);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [site, change, toggle]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (save === "unsaved" || save === "saving") e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save]);

  const flush = async () => {
    if (timer.current) clearTimeout(timer.current);
    if (latest.current && save !== "saved") return persist(latest.current);
    return study;
  };

  const setStatus = async (status: "draft" | "published") => {
    setBusy(status === "published" ? "publish" : "unpublish");
    await flush();
    const s = await persist({ status });
    setBusy(null);
    if (s) toast(status === "published" ? "On the website. It can take a couple of minutes to appear." : "Taken off the website.");
  };

  const remove = async () => {
    setBusy("remove");
    const r = await fetch(`/api/case-studies/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    setBusy(null);
    if (!r?.ok) return toast("It couldn't be removed. Try again.", "bad");
    toast("Case study removed.");
    router.push("/profile?tab=page");
  };

  /* Change photo: the chosen photo takes this spot and the one there moves to where it was. */
  const place = (slot: number, from: number) => {
    const f = latest.current;
    if (!f || slot === from) return setPicker(null);
    const photos = f.photos.slice();
    [photos[slot], photos[from]] = [photos[from], photos[slot]];
    change({ photos }, 200);
    setPicker(null);
  };

  const dropPhoto = (slot: number) => {
    const f = latest.current;
    if (!f || f.photos.length <= 1) return toast("A case study needs at least one photo.", "bad");
    change({ photos: f.photos.filter((_, i) => i !== slot) }, 200);
    setPicker(null);
  };

  const upload = async (file: File | undefined, slot: number) => {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await fetch(`/api/case-studies/${encodeURIComponent(id)}/photo`, { method: "POST", body: fd });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; photo?: CasePhoto; error?: string };
      if (!r.ok || !d.photo) return toast(d.error ?? `${file.name} didn't upload.`, "bad");
      const f = latest.current;
      if (!f) return;
      /* The new photo takes the spot; the one it replaces stays in the set, at the end. */
      const photos = f.photos.slice();
      const old = photos[slot];
      photos[slot] = d.photo;
      if (old) photos.push(old);
      change({ photos }, 200);
      setPicker(null);
    } catch {
      toast(`${file.name} didn't upload. Check your connection.`, "bad");
    } finally {
      setUploading(false);
      if (fileIn.current) fileIn.current.value = "";
    }
  };

  if (loadError) {
    return (
      <div data-look="new" className="nl-page py-16">
        <p className="nl-blurb">{loadError}</p>
        <Link href="/profile?tab=page" className="nl-btn nl-btn--secondary mt-6">Back to Your page</Link>
      </div>
    );
  }
  if (!study || !form || !site) {
    return (
      <div data-look="new" className="nl-page py-16" aria-busy>
        <div className="cs-loading"><span className="cs-spin" aria-hidden /> Opening the case study…</div>
      </div>
    );
  }

  const live = study.status === "published";
  const saveWord = save === "saving" ? "Saving…" : save === "unsaved" ? "Saving soon" : save === "failed" ? "Not saved" : "Saved";
  const frameSrc = `${site}/editor/case-study${study.agentRexId ? `?agent=${encodeURIComponent(study.agentRexId)}` : ""}`;
  const slotName = (n: number) => (n === 0 ? "the cover" : `photo ${n + 1}`);

  return (
    <div data-look="new" className="cs-studio">
      <div className="cs-bar">
        <div className="cs-bar-left">
          <Link href="/profile?tab=page" className="cs-back" aria-label="Back to Your page" />
          <div className="cs-bar-title">
            <b>{form.title || "Untitled case study"}</b>
            <span className="cs-bar-meta">
              <Badge tone={live ? "good" : "neutral"}>{live ? "On the website" : "Draft"}</Badge>
              <span className={`cs-save cs-save--${save}`}>{saveWord}</span>
            </span>
          </div>
        </div>
        <div className="cs-seg" role="tablist" aria-label="Edit or preview">
          <button type="button" role="tab" aria-selected={mode === "edit"} className={mode === "edit" ? "is-on" : ""} onClick={() => setMode("edit")}>Edit</button>
          <button type="button" role="tab" aria-selected={mode === "preview"} className={mode === "preview" ? "is-on" : ""} onClick={() => setMode("preview")}>Preview</button>
        </div>
        <div className="cs-seg cs-seg--device" role="group" aria-label="Screen size">
          <button type="button" aria-pressed={device === "desktop"} className={device === "desktop" ? "is-on" : ""} onClick={() => setDevice("desktop")} title="Computer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>
            <span>Computer</span>
          </button>
          <button type="button" aria-pressed={device === "phone"} className={device === "phone" ? "is-on" : ""} onClick={() => setDevice("phone")} title="Phone">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="7" y="2.5" width="10" height="19" rx="2" /><path d="M11 18.5h2" /></svg>
            <span>Phone</span>
          </button>
        </div>
        <div className="cs-bar-right">
          {live ? (
            <>
              <a className="nl-btn nl-btn--secondary" href={study.websiteUrl} target="_blank" rel="noopener">Open on the website</a>
              <button type="button" className="nl-btn nl-btn--secondary" onClick={() => { void navigator.clipboard?.writeText(study.websiteUrl).then(() => toast("Link copied."), () => toast("Couldn't copy the link.", "bad")); }}>Copy link</button>
            </>
          ) : (
            <button type="button" className="nl-btn nl-btn--primary" disabled={busy !== null || form.photos.length === 0} onClick={() => void setStatus("published")}>{busy === "publish" ? "Putting it on…" : "Put on the website"}</button>
          )}
          <Menu
            label="More for this case study"
            items={[
              ...(live ? [{ label: busy === "unpublish" ? "Taking it off…" : "Take off the website", sub: "Back to a draft. The link stops working", onClick: () => void setStatus("draft") }, "rule" as const] : []),
              { label: "Remove this case study", danger: true, onClick: () => setAskRemove(true) },
            ]}
          />
        </div>
      </div>

      {saveError && <p className="cs-error" role="alert">{saveError} <button type="button" className="cs-linkbtn" onClick={() => latest.current && void persist(latest.current)}>Try again</button></p>}
      {askRemove && (
        <div className="nl-confirm cs-confirm">
          <p>Remove this case study? It comes off the website and out of your list. The home and its listing are not touched.</p>
          <button type="button" className="nl-btn nl-btn--quiet nl-btn--sm" onClick={() => setAskRemove(false)}>Keep it</button>
          <button type="button" className="nl-btn nl-btn--sm" disabled={busy === "remove"} onClick={() => void remove()}>{busy === "remove" ? "Removing…" : "Remove"}</button>
        </div>
      )}

      <p className="cs-hint">
        {mode === "edit"
          ? "Click any words on the page to change them. Change photo swaps a picture. Shown and Hidden decide what goes out."
          : "This is the page exactly as it will look on the website."}
      </p>

      <div className={`cs-stage cs-stage--${device}`}>
        <div className="cs-frame-wrap">
          {!frameReady && (frameState === "failed" ? (
            <div className="cs-frame-wait cs-frame-failed" role="alert">
              <p>The website page didn&rsquo;t open. Your words are saved; only the preview is missing.</p>
              <button type="button" className="nl-btn nl-btn--secondary" onClick={() => { setFrameState("waiting"); setFrameKey((k) => k + 1); }}>Try again</button>
            </div>
          ) : (
            <div className="cs-frame-wait"><span className="cs-spin" aria-hidden /> Loading the website…</div>
          ))}
          <iframe key={frameKey} ref={frame} src={frameSrc} title="The case study on the website" className="cs-frame" />
        </div>
      </div>

      {picker != null && (
        <div className="cs-sheet-back" role="presentation" onClick={() => setPicker(null)}>
          <div className="cs-sheet" role="dialog" aria-modal aria-label={`Change ${slotName(picker)}`} onClick={(e) => e.stopPropagation()}>
            <div className="cs-sheet-head">
              <div>
                <h2 className="nl-section-title">Change {slotName(picker)}</h2>
                <p className="nl-meta">Pick a photo to put here. The one there now takes its place.</p>
              </div>
              <button type="button" className="nl-btn nl-btn--quiet nl-btn--sm" onClick={() => setPicker(null)}>Close</button>
            </div>
            <ul className="cs-pick">
              {form.photos.map((p, i) => (
                <li key={`${p.url}-${i}`}>
                  <button type="button" className={i === picker ? "is-current" : ""} onClick={() => place(picker, i)} aria-label={i === picker ? `Photo ${i + 1}, here now` : `Use photo ${i + 1}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" loading="lazy" />
                    <span>{i === picker ? "Here now" : i === 0 ? "Cover" : i + 1}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="cs-sheet-foot">
              <button type="button" className="nl-btn nl-btn--secondary" disabled={uploading} onClick={() => fileIn.current?.click()}>{uploading ? "Uploading…" : "Upload a new photo"}</button>
              <input ref={fileIn} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => void upload(e.target.files?.[0], picker)} />
              <button type="button" className="nl-btn nl-btn--quiet" onClick={() => dropPhoto(picker)}>Remove this photo from the case study</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
