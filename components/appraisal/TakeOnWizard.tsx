"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import { trackSave, useSaveReporter } from "@/components/SaveChip";
import type { MarketAppraisal } from "@/lib/market-appraisal";

/**
 * AFTER THE VISIT, IN ONE POP-OUT (James, 17 Sep 2026).
 *
 * "I would rather a pop-out modal where they can just drop their files in ...
 * We'll click Next, and then it'll ask them for the description ... When they
 * finish that, that modal will then say fill in any gaps."
 *
 * Photographs, then the advert, then the gaps, then what happens next - which
 * is the landlord's compliance, with a nudge if they have sent nothing. Each
 * screen can be walked past: an agent standing in a hallway with one bar of
 * signal should not be trapped on step two.
 */
type Photo = { id: string; name: string; bytes: number | null };
type Job = { name: string; pct: number; error?: string };
type Field = { id: string; label: string; hint?: string };
type Suggestion = { id: string; value: string; why: string };

export default function TakeOnWizard({ ma, onClose, onSaved }: { ma: MarketAppraisal; onClose: () => void; onSaved?: () => void }) {
  const [step, setStep] = useState(0);
  const [mounted, setMounted] = useState(false);
  /* The file's scope: the portal keeps the page's context, so the page's
     Auto save chip and its toasts hear the wizard's saves (23 Sep 2026). */
  const reporter = useSaveReporter();
  useEffect(() => setMounted(true), []);

  /* ── photographs ── */
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [over, setOver] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const j = await fetch(`/api/appraisals/${encodeURIComponent(ma.id)}/photos`, { cache: "no-store" })
      .then((r) => r.json() as Promise<{ ok?: boolean; photos?: Photo[] }>)
      .catch(() => null);
    setPhotos(j?.ok ? j.photos ?? [] : []);
  }, [ma.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = (file: File, at: number) =>
    new Promise<void>((resolve) => {
      const form = new FormData();
      form.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/appraisals/${encodeURIComponent(ma.id)}/photos`);
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        const pct = Math.round((e.loaded / e.total) * 100);
        setJobs((all) => all.map((j, i) => (i === at ? { ...j, pct } : j)));
      };
      xhr.onload = () => {
        let error: string | undefined;
        try {
          const j = JSON.parse(xhr.responseText) as { ok?: boolean; error?: string };
          if (!j.ok) error = j.error ?? "It didn't store.";
        } catch {
          error = "It didn't store.";
        }
        setJobs((all) => all.map((j, i) => (i === at ? { ...j, pct: 100, error } : j)));
        resolve();
      };
      xhr.onerror = () => {
        setJobs((all) => all.map((j, i) => (i === at ? { ...j, pct: 100, error: "The connection dropped." } : j)));
        resolve();
      };
      xhr.send(form);
    });

  async function take(files: File[]) {
    const pics = files.filter((f) => f.type.startsWith("image/"));
    if (!pics.length) return;
    const from = jobs.length;
    setJobs((all) => [...all, ...pics.map((f) => ({ name: f.name, pct: 0 }))]);
    for (let i = 0; i < pics.length; i += 3) {
      await Promise.all(pics.slice(i, i + 3).map((f, n) => upload(f, from + i + n)));
      await load();
    }
  }

  const done = jobs.filter((j) => j.pct === 100).length;
  const failed = jobs.filter((j) => j.error).length;
  const busy = jobs.length > 0 && done < jobs.length;
  const overall = jobs.length ? Math.round(jobs.reduce((n, j) => n + j.pct, 0) / jobs.length) : 0;

  /* ── the advert ── */
  const [steer, setSteer] = useState("");
  const [asking, setAsking] = useState(false);
  const [writing, setWriting] = useState(false);
  const [advert, setAdvert] = useState<{ heading: string; body: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function write() {
    if (writing) return;
    setWriting(true);
    setNote(null);
    try {
      const r = await fetch(`/api/appraisals/${encodeURIComponent(ma.id)}/advert`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ steer, current: advert?.body ?? null }),
      });
      const j = (await r.json()) as { ok?: boolean; heading?: string; body?: string; error?: string; photos?: number };
      if (!j.ok || !j.body) throw new Error(j.error ?? "Nothing came back.");
      setAdvert({ heading: j.heading ?? "", body: j.body });
      setNote(j.photos ? `Written from ${j.photos} photograph${j.photos === 1 ? "" : "s"} and what the file holds.` : "Written from what the file holds - there were no photographs to read.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "The writer could not be reached.");
    } finally {
      setWriting(false);
    }
  }

  /* ── the gaps ── */
  const [fields, setFields] = useState<Field[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [filling, setFilling] = useState(false);
  const [compliance, setCompliance] = useState<{ has: number; missing: string[]; landlord: string; email: string | null } | null>(null);

  const details = useCallback(async () => {
    const j = await fetch(`/api/appraisals/${encodeURIComponent(ma.id)}/details`, { cache: "no-store" })
      .then((r) => r.json() as Promise<{ ok?: boolean; fields?: Field[]; known?: Record<string, string>; advert?: { heading: string; body: string } | null; compliance?: { has: number; missing: string[]; landlord: string; email: string | null } }>)
      .catch(() => null);
    if (!j?.ok) return;
    setFields(j.fields ?? []);
    setValues(j.known ?? {});
    setCompliance(j.compliance ?? null);
    if (j.advert && !advert) setAdvert(j.advert);
  }, [ma.id, advert]);

  useEffect(() => {
    void details();
    /* Once, on open: re-reading on every keystroke would fight the inputs. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ma.id]);

  async function suggest() {
    if (filling) return;
    setFilling(true);
    setNote(null);
    try {
      const missing = fields.filter((f) => !values[f.id]?.trim()).map((f) => ({ id: f.id, label: f.label }));
      const r = await fetch(`/api/appraisals/${encodeURIComponent(ma.id)}/advert`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "gaps", missing }),
      });
      const j = (await r.json()) as { ok?: boolean; fields?: Suggestion[]; error?: string };
      if (!j.ok) throw new Error(j.error ?? "Nothing came back.");
      setSuggestions(j.fields ?? []);
      if (!j.fields?.length) setNote("Nothing it could tell from the photographs. Fill them in yourself.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "It could not be reached.");
    } finally {
      setFilling(false);
    }
  }

  const [saving, setSaving] = useState(false);
  const [saveProblem, setSaveProblem] = useState<string | null>(null);
  async function save(next: number) {
    if (saving) return;
    setSaving(true);
    setSaveProblem(null);
    /* It used to swallow a refusal and move on to "That is the visit written
       up" regardless (23 Sep 2026). Now a refusal keeps the agent here, with
       everything they typed, and says why. */
    const r = await trackSave<{ ok?: boolean; error?: string }>(reporter, "Take-on details", () =>
      fetch(`/api/appraisals/${encodeURIComponent(ma.id)}/details`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fields: values, advert: advert?.body?.trim() ? advert : null }),
      })
    );
    setSaving(false);
    if (!r.ok) {
      setSaveProblem(`${r.body?.error ?? "That didn't save."} Your answers are still here - press Save and finish again.`);
      return;
    }
    setStep(next);
    onSaved?.();
  }

  /* ── the compliance nudge ── */
  const [nudging, setNudging] = useState(false);
  const [nudged, setNudged] = useState<string | null>(null);
  async function nudge() {
    if (nudging) return;
    setNudging(true);
    const j = await fetch(`/api/appraisals/${encodeURIComponent(ma.id)}/docs-nudge`, { method: "POST" })
      .then((r) => r.json() as Promise<{ ok?: boolean; message?: string; error?: string }>)
      .catch(() => null);
    setNudged(j?.ok ? j.message ?? "Sent." : (j?.error ?? "It didn't send."));
    setNudging(false);
  }

  if (!mounted) return null;

  const STEPS = ["Photographs", "The advert", "The gaps", "What's next"];
  const primary = "rounded-full bg-accent-dark px-6 py-3 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40";
  const ghost = "rounded-full border border-line/80 px-5 py-3 text-[13px] font-semibold transition-colors hover:border-ink/40";

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-ink/50 p-3 backdrop-blur-sm sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="After the take-on visit"
        onClick={(e) => e.stopPropagation()}
        className="popout-in flex h-full max-h-[900px] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-line bg-page shadow-2xl"
      >
        <div className="flex items-start gap-4 border-b border-line/70 px-6 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">After the visit · {ma.address.split(",")[0]}</p>
            <h2 className="hand mt-1 text-[22px] leading-tight">{STEPS[step]}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 rounded-full border border-line/70 px-3 py-1.5 text-[11.5px] transition-colors hover:border-ink/30">
            Close
          </button>
        </div>

        {/* Where they are. */}
        <div className="flex gap-1.5 px-6 pt-3">
          {STEPS.map((s, i) => (
            <span key={s} className="h-1.5 flex-1 rounded-full transition-colors" style={{ background: i <= step ? "#56423e" : "rgba(86,66,62,0.15)" }} />
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {step === 0 && (
            <>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(true);
                }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(false);
                  void take([...e.dataTransfer.files]);
                }}
                onClick={() => picker.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && picker.current?.click()}
                className="flex cursor-copy flex-col items-center justify-center rounded-[22px] px-6 py-14 text-center transition-transform"
                /* The light pink, not the brown (James, 18 Sep 2026). */
                style={{ background: "var(--accent-soft, #fdf2ef)", transform: over ? "scale(1.01)" : "none", outline: over ? "2px solid #56423e" : "2px dashed rgba(86,66,62,0.3)", outlineOffset: -10 }}
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-accent-dark">
                  <DoodleIcon name="pack/photo" size={24} />
                </span>
                <p className="mt-4 text-[18px] font-semibold text-ink">Drop the photographs here</p>
                <p className="mt-1.5 text-[13px] text-muted">All of them at once. Or click to pick them off the camera.</p>
                <input
                  ref={picker}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    void take([...(e.target.files ?? [])]);
                    e.target.value = "";
                  }}
                />
              </div>

              {jobs.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-semibold">
                      {busy ? `Uploading ${Math.min(done + 1, jobs.length)} of ${jobs.length}` : `${jobs.length - failed} of ${jobs.length} uploaded`}
                      {failed ? ` · ${failed} didn't` : ""}
                    </span>
                    <span className="text-muted">{overall}%</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-line/50">
                    <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${overall}%`, background: "#56423e" }} />
                  </div>
                  {jobs.filter((j) => j.error).map((j) => (
                    <p key={j.name} className="mt-1 text-[11.5px] text-accent-dark">
                      {j.name}: {j.error}
                    </p>
                  ))}
                </div>
              )}

              {photos && photos.length > 0 && (
                <ul className="mt-5 grid grid-cols-3 gap-2.5 sm:grid-cols-5">
                  {photos.map((p) => (
                    <li key={p.id} className="group relative overflow-hidden rounded-xl border border-line/60">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/appraisals/${encodeURIComponent(ma.id)}/photos?photo=${encodeURIComponent(p.id)}`} alt={p.name} className="h-24 w-full object-cover" loading="lazy" />
                      <button
                        type="button"
                        onClick={async () => {
                          await trackSave(reporter, "Photo", () =>
                            fetch(`/api/appraisals/${encodeURIComponent(ma.id)}/photos?photo=${encodeURIComponent(p.id)}`, { method: "DELETE" })
                          );
                          void load();
                        }}
                        aria-label={`Remove ${p.name}`}
                        className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-[13px] text-muted opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {step === 1 && (
            <>
              {/* WRITE IT YOURSELF FIRST (James, 18 Sep 2026: "some people
                  might not want to use AI for it"). The boxes are always
                  here; the AI below writes into them, and whatever it writes
                  stays theirs to change. */}
              <label className="block text-[12.5px] font-semibold">The headline</label>
              <input
                value={advert?.heading ?? ""}
                onChange={(e) => setAdvert({ heading: e.target.value, body: advert?.body ?? "" })}
                placeholder="Two-bedroom apartment with a sea-view balcony"
                className="mt-1.5 w-full rounded-xl border border-line/70 bg-white px-3.5 py-2.5 text-[14px] font-semibold outline-none focus:border-ink/40"
              />
              <label className="mt-4 block text-[12.5px] font-semibold">The description</label>
              <textarea
                value={advert?.body ?? ""}
                onChange={(e) => setAdvert({ heading: advert?.heading ?? "", body: e.target.value })}
                rows={10}
                placeholder="Write it here in your own words - or let AI draft it from the photographs below."
                className="mt-1.5 w-full resize-y rounded-xl border border-line/70 bg-white px-3.5 py-2.5 text-[13px] leading-relaxed outline-none focus:border-ink/40"
              />
              {advert?.body?.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(`${advert.heading}\n\n${advert.body}`);
                    setNote("Copied.");
                  }}
                  className={`${ghost} mt-2`}
                >
                  Copy it
                </button>
              )}

              <div className="mt-6 rounded-2xl border border-line/60 bg-white p-4">
                <p className="text-[13.5px] font-semibold">Or write it with AI</p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">
                  It reads the photographs and everything the file holds - the rent, the EPC, whether anyone is living there and from when - and writes into the boxes above.
                </p>
                {!asking ? (
                  <button type="button" onClick={() => setAsking(true)} disabled={writing} className={`${primary} mt-3`}>
                    Write it with AI
                  </button>
                ) : (
                  <>
                    <label className="mt-3 block text-[12.5px] font-semibold">Anything to add before it writes?</label>
                    <p className="mt-0.5 text-[11.5px] text-muted">Optional. You were there and it wasn&apos;t: what to lead on, what the photographs miss.</p>
                    <textarea
                      value={steer}
                      onChange={(e) => setSteer(e.target.value)}
                      rows={3}
                      placeholder="Lead on the sea view and the balcony. New build, quiet block. The second bedroom is a good single."
                      className="mt-2 w-full resize-y rounded-xl border border-line/70 bg-white px-3.5 py-2.5 text-[13px] outline-none focus:border-ink/40"
                    />
                    <button type="button" onClick={() => void write()} disabled={writing} className={`${primary} mt-3`}>
                      {writing ? "Writing…" : advert?.body?.trim() ? "Rewrite it with AI" : "Write it with AI"}
                    </button>
                    {advert?.body?.trim() && !writing && (
                      <p className="mt-2 text-[11.5px] text-muted">It will improve on what is in the box rather than start again.</p>
                    )}
                  </>
                )}
                {note && <p className="mt-3 text-[11.5px] leading-relaxed text-muted">{note}</p>}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-[13px] leading-relaxed text-muted">
                Everything we hold, from the landlord&apos;s answers and the file. Fill in what is blank - or let it suggest from the photographs, and change anything it gets wrong.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => void suggest()} disabled={filling} className={ghost}>
                  {filling ? "Looking…" : "Suggest the missing ones"}
                </button>
                {note && <span className="text-[11.5px] text-muted">{note}</span>}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {fields.map((f) => {
                  const sug = suggestions.find((s) => s.id === f.id);
                  return (
                    <div key={f.id}>
                      <label className="block text-[12px] font-semibold">{f.label}</label>
                      <input
                        value={values[f.id] ?? ""}
                        placeholder={f.hint ?? ""}
                        onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
                        className="mt-1 w-full rounded-xl border border-line/70 bg-white px-3.5 py-2.5 text-[13px] outline-none focus:border-ink/40"
                      />
                      {sug && !values[f.id]?.trim() && (
                        <button
                          type="button"
                          onClick={() => setValues((v) => ({ ...v, [f.id]: sug.value }))}
                          className="mt-1.5 text-left text-[11.5px] text-accent-dark underline underline-offset-2"
                        >
                          Suggested: {sug.value} — {sug.why}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <p className="text-[14px] font-semibold">That is the visit written up.</p>
              <ul className="mt-3 space-y-1 text-[12.5px] text-muted">
                <li>{photos?.length ?? 0} photograph{(photos?.length ?? 0) === 1 ? "" : "s"} on the file</li>
                <li>{advert?.body?.trim() ? "The advert is written and saved" : "No advert yet - write it whenever you like"}</li>
                <li>{Object.values(values).filter(Boolean).length} details recorded</li>
              </ul>
              <div className="mt-5 rounded-2xl border border-line/60 bg-white p-4">
                <p className="text-[13.5px] font-semibold">Next: AML and compliance</p>
                {compliance && compliance.missing.length === 0 ? (
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                    {compliance.landlord} has sent everything. Nothing to chase.
                  </p>
                ) : (
                  <>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                      {compliance?.landlord ?? "The landlord"} still owes{" "}
                      {compliance?.missing.length ? compliance.missing.join(", ").toLowerCase() : "their compliance documents"}.
                    </p>
                    <button type="button" onClick={() => void nudge()} disabled={nudging || !compliance?.email} className={`${primary} mt-3`}>
                      {nudging ? "Sending…" : "Send a nudge for the documents"}
                    </button>
                    {!compliance?.email && <p className="mt-2 text-[11.5px] text-muted">No email address on their record, so a nudge cannot go.</p>}
                  </>
                )}
                {nudged && <p className="mt-2 text-[11.5px] leading-relaxed">{nudged}</p>}
                <p className="mt-3">
                  <Link href={`/market-appraisals/${ma.id}`} className="text-[12px] text-muted underline underline-offset-4 hover:text-ink">
                    Back to the file
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line/70 px-6 py-3.5">
          {step > 0 && (
            <button type="button" onClick={() => setStep(step - 1)} className={ghost}>
              ← Back
            </button>
          )}
          {saveProblem && step === 2 && <span className="text-[11.5px] leading-snug text-accent-dark">{saveProblem}</span>}
          <span className="ml-auto" />
          {step < 2 && (
            <button type="button" onClick={() => setStep(step + 1)} disabled={busy} className={primary}>
              {busy ? "Uploading…" : step === 0 ? `Next${photos?.length ? ` · ${photos.length} on the file` : ""}` : "Next"} <span aria-hidden>→</span>
            </button>
          )}
          {step === 2 && (
            <button type="button" onClick={() => void save(3)} disabled={saving} className={primary}>
              {saving ? "Saving…" : "Save and finish"} <span aria-hidden>→</span>
            </button>
          )}
          {step === 3 && (
            <button type="button" onClick={onClose} className={primary}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
