"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Mast, Menu } from "@/components/new-look/Parts";
import { toast } from "@/lib/toast";

/* One case study, being written (James, 11 Nov 2026, from Richard). A set
   format, filled from the listing's advert and photos when it was started:
   the agent puts the photos in their order, drops or adds some, writes the
   intro, the story and their notes, then puts it on the website. Saves as
   they go. */

type Photo = { url: string; from: "rex" | "upload" };
type Facts = { beds: number | null; baths: number | null; propertyType: string | null; rent: number | null; rentPeriod: "month" | "week" | null; publishedOn: string | null; letOn: string | null; daysToLet: number | null };
type Study = {
  id: string; slug: string; listingId: string; status: "draft" | "published"; agentName: string;
  title: string; area: string; intro: string; headline: string; advert: string; story: string; notes: string;
  photos: Photo[]; facts: Facts; showRent: boolean; showDays: boolean; publishedAt: string | null; updatedAt: string; websiteUrl: string;
};
type Editable = Pick<Study, "title" | "area" | "intro" | "headline" | "advert" | "story" | "notes" | "photos" | "showRent" | "showDays">;
const EDITABLE: (keyof Editable)[] = ["title", "area", "intro", "headline", "advert", "story", "notes", "photos", "showRent", "showDays"];

function pick(s: Study): Editable {
  return Object.fromEntries(EDITABLE.map((k) => [k, s[k]])) as Editable;
}

/** An uploaded photo is on this server; the editor shows it from here. */
const src = (u: string) => u;

const money = (n: number | null) => (n == null ? null : `£${n.toLocaleString("en-GB")}`);
const longDay = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null);

export default function CaseStudyEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [study, setStudy] = useState<Study | null>(null);
  const [form, setForm] = useState<Editable | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [save, setSave] = useState<"saved" | "saving" | "unsaved" | "failed">("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "publish" | "unpublish" | "remove">(null);
  const [uploading, setUploading] = useState(0);
  const [askRemove, setAskRemove] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
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
      })
      .catch(() => live && setLoadError("This case study couldn't be opened. Check your connection and try again."));
    return () => { live = false; };
  }, [id]);

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

  /* Saves a second after the last change. */
  const change = useCallback((patch: Partial<Editable>) => {
    setForm((f) => {
      if (!f) return f;
      const next = { ...f, ...patch };
      latest.current = next;
      return next;
    });
    setSave("unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (latest.current) void persist(latest.current); }, 900);
  }, [persist]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (save === "unsaved" || save === "saving") { e.preventDefault(); } };
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
    router.push("/case-studies");
  };

  const upload = async (files: FileList | null) => {
    if (!files || !form) return;
    const list = Array.from(files);
    setUploading((n) => n + list.length);
    for (const f of list) {
      const fd = new FormData();
      fd.append("file", f);
      try {
        const r = await fetch(`/api/case-studies/${encodeURIComponent(id)}/photo`, { method: "POST", body: fd });
        const d = (await r.json().catch(() => ({}))) as { ok?: boolean; photo?: Photo; error?: string };
        if (!r.ok || !d.photo) toast(d.error ?? `${f.name} didn't upload.`, "bad");
        else {
          const photo = d.photo;
          setForm((cur) => {
            if (!cur) return cur;
            const next = { ...cur, photos: [...cur.photos, photo] };
            latest.current = next;
            return next;
          });
          setSave("unsaved");
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => { if (latest.current) void persist(latest.current); }, 400);
        }
      } catch {
        toast(`${f.name} didn't upload. Check your connection.`, "bad");
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileIn.current) fileIn.current.value = "";
  };

  const move = (from: number, to: number) => {
    if (!form || to < 0 || to >= form.photos.length || from === to) return;
    const photos = form.photos.slice();
    const [p] = photos.splice(from, 1);
    photos.splice(to, 0, p);
    change({ photos });
  };

  if (loadError) {
    return (
      <div data-look="new" className="nl-page py-16">
        <p className="nl-blurb">{loadError}</p>
        <Link href="/case-studies" className="nl-btn nl-btn--secondary mt-6">Back to case studies</Link>
      </div>
    );
  }
  if (!study || !form) {
    return (
      <div data-look="new" className="nl-page py-16" aria-busy>
        <div className="cs-loading"><span className="cs-spin" aria-hidden /> Opening the case study…</div>
      </div>
    );
  }

  const live = study.status === "published";
  const f = study.facts;
  const rent = money(f.rent);
  const saveWord = save === "saving" ? "Saving…" : save === "unsaved" ? "Unsaved changes" : save === "failed" ? "Not saved" : "All changes saved";

  return (
    <div data-look="new" className="nl-page cs-edit">
      <Link href="/case-studies" className="nl-meta cs-back">Case studies</Link>
      <Mast
        eyebrow={<span className="cs-eyebrow"><Badge tone={live ? "good" : "neutral"}>{live ? "On the website" : "Draft"}</Badge><span className={`nl-meta cs-save cs-save--${save}`}>{saveWord}</span></span>}
        title={form.title || "Untitled case study"}
        blurb={live ? <>Live at <a href={study.websiteUrl} target="_blank" rel="noopener" className="cs-link">{study.websiteUrl.replace(/^https?:\/\//, "")}</a></> : "Only you can see this until you put it on the website. It will show on the case studies page and on your own page."}
        actions={
          <>
            {live ? (
              <>
                <a className="nl-btn nl-btn--secondary" href={study.websiteUrl} target="_blank" rel="noopener">Open on the website</a>
                <button type="button" className="nl-btn nl-btn--secondary" onClick={() => { void navigator.clipboard?.writeText(study.websiteUrl).then(() => toast("Link copied."), () => toast("Couldn't copy. The link is under the title.", "bad")); }}>Copy link</button>
              </>
            ) : (
              <button type="button" className="nl-btn nl-btn--primary" disabled={busy !== null || form.photos.length === 0} onClick={() => void setStatus("published")}>{busy === "publish" ? "Putting it on…" : "Put on the website"}</button>
            )}
            <Menu
              label="More for this case study"
              items={[
                ...(live ? [{ label: busy === "unpublish" ? "Taking it off…" : "Take off the website", sub: "Back to a draft. The link stops working", onClick: () => void setStatus("draft") }] : []),
                ...(live ? ["rule" as const] : []),
                { label: "Remove this case study", danger: true, onClick: () => setAskRemove(true) },
              ]}
            />
          </>
        }
      />
      {saveError && <p className="cs-error" role="alert">{saveError} <button type="button" className="cs-linkbtn" onClick={() => latest.current && void persist(latest.current)}>Try again</button></p>}
      {askRemove && (
        <div className="nl-confirm">
          <p>Remove this case study? It comes off the website and out of your list. The home and its listing are not touched.</p>
          <button type="button" className="nl-btn nl-btn--quiet nl-btn--sm" onClick={() => setAskRemove(false)}>Keep it</button>
          <button type="button" className="nl-btn nl-btn--sm" disabled={busy === "remove"} onClick={() => void remove()}>{busy === "remove" ? "Removing…" : "Remove"}</button>
        </div>
      )}

      {/* 1. The headline */}
      <section className="nl-card cs-card">
        <h2 className="nl-section-title">The Headline</h2>
        <p className="nl-meta">The street and town show, never the house number.</p>
        <div className="cs-two">
          <label className="nl-field"><span>Title</span><input value={form.title} maxLength={120} onChange={(e) => change({ title: e.target.value })} /></label>
          <label className="nl-field"><span>Area</span><input value={form.area} maxLength={80} onChange={(e) => change({ area: e.target.value })} /></label>
        </div>
        <label className="nl-field"><span>A short write-up</span><textarea rows={2} maxLength={400} value={form.intro} onChange={(e) => change({ intro: e.target.value })} /><small>One or two sentences under the title, and on the card on your page.</small></label>
      </section>

      {/* 2. Photos */}
      <section className="nl-card cs-card">
        <div className="cs-head">
          <div>
            <h2 className="nl-section-title">Photos</h2>
            <p className="nl-meta">Drag them into order, or use the arrows. The first is the cover. {form.photos.length} {form.photos.length === 1 ? "photo" : "photos"}.</p>
          </div>
          <button type="button" className="nl-btn nl-btn--secondary" disabled={uploading > 0} onClick={() => fileIn.current?.click()}>{uploading > 0 ? `Adding ${uploading}…` : "Add photos"}</button>
          <input ref={fileIn} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => void upload(e.target.files)} />
        </div>
        {form.photos.length === 0 ? (
          <div className="cs-empty">No photos yet. Add at least one before it goes on the website.</div>
        ) : (
          <ol className="cs-photos">
            {form.photos.map((p, i) => (
              <li
                key={`${p.url}-${i}`}
                className={`cs-photo${drag === i ? " is-drag" : ""}`}
                draggable
                onDragStart={(e) => { setDrag(i); e.dataTransfer.effectAllowed = "move"; }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                onDrop={(e) => { e.preventDefault(); if (drag != null) move(drag, i); setDrag(null); }}
                onDragEnd={() => setDrag(null)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src(p.url)} alt={`Photo ${i + 1}`} loading="lazy" draggable={false} />
                <span className="cs-photo-n">{i === 0 ? "Cover" : i + 1}</span>
                <span className="cs-photo-tools">
                  <button type="button" aria-label={`Move photo ${i + 1} earlier`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>
                  </button>
                  <button type="button" aria-label={`Move photo ${i + 1} later`} disabled={i === form.photos.length - 1} onClick={() => move(i, i + 1)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 18l6-6-6-6" /></svg>
                  </button>
                  {i !== 0 && (
                    <button type="button" aria-label={`Make photo ${i + 1} the cover`} title="Make this the cover" onClick={() => move(i, 0)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" /></svg>
                    </button>
                  )}
                  <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => change({ photos: form.photos.filter((_, j) => j !== i) })}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* 3. The story */}
      <section className="nl-card cs-card">
        <h2 className="nl-section-title">The Story</h2>
        <label className="nl-field"><span>How it went</span><textarea rows={6} maxLength={6000} value={form.story} placeholder="The landlord, the work before it went on, the viewings, how quickly it let and who to." onChange={(e) => change({ story: e.target.value })} /><small>Leave a blank line between paragraphs. Keep the landlord and tenants unnamed.</small></label>
      </section>

      {/* 4. How it was advertised */}
      <section className="nl-card cs-card">
        <h2 className="nl-section-title">How It Was Advertised</h2>
        <p className="nl-meta">Brought over from the listing. Shown word for word, so trim anything that no longer fits.</p>
        <label className="nl-field"><span>Advert heading</span><input value={form.headline} maxLength={300} onChange={(e) => change({ headline: e.target.value })} /></label>
        <label className="nl-field"><span>Advert</span><textarea rows={10} maxLength={8000} value={form.advert} onChange={(e) => change({ advert: e.target.value })} /></label>
      </section>

      {/* 5. The let */}
      <section className="nl-card cs-card">
        <h2 className="nl-section-title">The Let</h2>
        <dl className="cs-facts">
          <div><dt>Home</dt><dd>{/share|hmo|room/i.test(f.propertyType ?? "") ? `Room, ${(f.propertyType ?? "").toLowerCase()}` : [f.beds ? `${f.beds} bed` : null, f.propertyType?.toLowerCase()].filter(Boolean).join(" ") || "Not known"}</dd></div>
          <div><dt>Advertised</dt><dd>{longDay(f.publishedOn) ?? "Not known"}</dd></div>
          <div><dt>Let</dt><dd>{longDay(f.letOn) ?? "Not known"}</dd></div>
          <div><dt>Let in</dt><dd>{f.daysToLet == null ? "Not known" : f.daysToLet <= 1 ? "A day" : `${f.daysToLet} days`}</dd></div>
          <div><dt>Rent</dt><dd>{rent ? `${rent} ${f.rentPeriod === "week" ? "pw" : "pcm"}` : "Not known"}</dd></div>
        </dl>
        <div className="cs-toggles">
          <label className="cs-toggle"><input type="checkbox" checked={form.showDays} disabled={f.daysToLet == null} onChange={(e) => change({ showDays: e.target.checked })} /> Show how quickly it let</label>
          <label className="cs-toggle"><input type="checkbox" checked={form.showRent} disabled={!rent} onChange={(e) => change({ showRent: e.target.checked })} /> Show the rent</label>
        </div>
      </section>

      {/* 6. Your notes */}
      <section className="nl-card cs-card">
        <h2 className="nl-section-title">Your Notes</h2>
        <label className="nl-field"><span>At the foot of the page, beside your photo</span><textarea rows={4} maxLength={4000} value={form.notes} placeholder="A word from you to a landlord reading it." onChange={(e) => change({ notes: e.target.value })} /><small>Signed with your name. Blank shows a short line from you instead.</small></label>
      </section>

      <div className="cs-foot">
        <span className={`nl-meta cs-save cs-save--${save}`}>{saveWord}</span>
        {!live && <button type="button" className="nl-btn nl-btn--primary" disabled={busy !== null || form.photos.length === 0} onClick={() => void setStatus("published")}>{busy === "publish" ? "Putting it on…" : "Put on the website"}</button>}
      </div>
    </div>
  );
}
