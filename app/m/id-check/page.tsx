"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import DocCamera, { type FrameShape } from "@/components/landlord/DocCamera";
import DoodleIcon from "@/components/DoodleIcon";
import type { Appt } from "@/lib/diary";
import { ErrorLine, PhoneTop, Spinner } from "../bits";

/**
 * RIGHT TO RENT ID: who, which document, the photos, sent.
 *
 * Four steps with one decision each, because this is done standing in a
 * hallway with somebody waiting. The camera is the landlord portal's own
 * (components/landlord/DocCamera) with a frame the shape of the document -
 * what is inside the frame is what gets sent.
 */

type DocType = "passport" | "card" | "other";

const DOCS: Record<DocType, { title: string; sub: string; shots: string[]; more: boolean; shapes?: Record<string, FrameShape>; hint: string }> = {
  passport: {
    title: "Passport",
    sub: "The photo page",
    shots: ["Photo page"],
    more: false,
    /* The photo page of a passport is 125 x 88mm. */
    shapes: { passport: { w: 1.42, h: 1, label: "Passport" } },
    hint: "Open it flat at the photo page and fit the page inside the frame. Tilt it away from lights to stop glare.",
  },
  card: {
    title: "ID Card or Permit",
    sub: "Front and back",
    shots: ["Front", "Back"],
    more: false,
    /* ISO ID-1, the size of a bank card: 85.6 x 54mm. */
    shapes: { card: { w: 1.586, h: 1, label: "Card" } },
    hint: "Fit the card inside the frame. Tilt it away from lights to stop glare.",
  },
  other: {
    title: "Other Document",
    sub: "Every page",
    shots: ["Page 1"],
    more: true,
    hint: "Fit the whole page inside the frame. Everything outside it is cut off.",
  },
};

interface Sent {
  id: string;
  name: string;
  property: string;
  docType: string;
  pages: number;
  at: string;
}

export default function PhoneIdCheck() {
  const [step, setStep] = useState<"who" | "doc" | "photos" | "sent">("who");
  const [name, setName] = useState("");
  const [property, setProperty] = useState("");
  const [appt, setAppt] = useState<string | null>(null);
  const [doc, setDoc] = useState<DocType | null>(null);
  const [labels, setLabels] = useState<string[]>([]);
  const [shots, setShots] = useState<(File | null)[]>([]);
  const [previews, setPreviews] = useState<(string | null)[]>([]);
  const [camera, setCamera] = useState<number | null>(null);
  const [seen, setSeen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState<Appt[] | null>(null);
  const [sent, setSent] = useState<Sent[] | null>(null);
  const [sentError, setSentError] = useState<string | null>(null);
  const library = useRef<HTMLInputElement | null>(null);
  const libraryFor = useRef<number>(0);

  /* Arriving from a viewing in the diary brings the name and address with it. */
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setName(sp.get("name") ?? "");
    setProperty(sp.get("property") ?? "");
    setAppt(sp.get("appt"));
  }, []);

  /* Today's viewings, so the name is a tap rather than typing on a doorstep. */
  useEffect(() => {
    fetch("/api/diary", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; live?: boolean; appts?: Appt[]; mine?: Appt[] }) => {
        const all = j.live ? j.appts ?? [] : j.mine ?? [];
        setToday(all.filter((a) => a.day === 0 && a.kind === "viewing" && a.who).sort((a, b) => a.start.localeCompare(b.start)));
      })
      .catch(() => setToday([]));
  }, []);

  const loadSent = useCallback(() => {
    setSentError(null);
    fetch("/api/m/id-check", { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json()) as { ok?: boolean; checks?: Sent[]; error?: string };
        if (!r.ok || !j.ok) throw new Error(j.error ?? "Could not read your sent checks.");
        setSent(j.checks ?? []);
      })
      .catch((e: Error) => {
        setSent([]);
        setSentError(e.message);
      });
  }, []);
  useEffect(loadSent, [loadSent]);

  /* Object URLs are memory until revoked; a set of ID photos is not small. */
  const previewsRef = useRef(previews);
  previewsRef.current = previews;
  useEffect(() => () => previewsRef.current.forEach((u) => u && URL.revokeObjectURL(u)), []);

  const chooseDoc = (d: DocType) => {
    previews.forEach((u) => u && URL.revokeObjectURL(u));
    setDoc(d);
    setLabels(DOCS[d].shots);
    setShots(DOCS[d].shots.map(() => null));
    setPreviews(DOCS[d].shots.map(() => null));
    setSeen(false);
    setError(null);
    setStep("photos");
  };

  const put = (i: number, f: File) => {
    setShots((s) => s.map((x, n) => (n === i ? f : x)));
    setPreviews((p) =>
      p.map((u, n) => {
        if (n !== i) return u;
        if (u) URL.revokeObjectURL(u);
        return URL.createObjectURL(f);
      })
    );
  };

  const addPage = () => {
    setLabels((l) => [...l, `Page ${l.length + 1}`]);
    setShots((s) => [...s, null]);
    setPreviews((p) => [...p, null]);
  };

  const removePage = (i: number) => {
    if (previews[i]) URL.revokeObjectURL(previews[i]!);
    setLabels((l) => l.filter((_, n) => n !== i).map((x, n) => (x.startsWith("Page ") ? `Page ${n + 1}` : x)));
    setShots((s) => s.filter((_, n) => n !== i));
    setPreviews((p) => p.filter((_, n) => n !== i));
  };

  const ready = doc !== null && shots.length > 0 && shots.every(Boolean) && seen && !sending;

  const send = async () => {
    if (!doc || !ready) return;
    setSending(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("name", name.trim());
      form.set("property", property.trim());
      if (appt) form.set("appt", appt);
      form.set("docType", doc);
      form.set("seenInPerson", seen ? "yes" : "no");
      shots.forEach((f) => f && form.append("pages", f));
      const r = await fetch("/api/m/id-check", { method: "POST", body: form });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "The photos did not send. Try again.");
      setStep("sent");
      loadSent();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    previews.forEach((u) => u && URL.revokeObjectURL(u));
    setName("");
    setProperty("");
    setAppt(null);
    setDoc(null);
    setLabels([]);
    setShots([]);
    setPreviews([]);
    setSeen(false);
    setError(null);
    setStep("who");
    window.history.replaceState(null, "", "/m/id-check");
  };

  const d = doc ? DOCS[doc] : null;
  const field = "h-14 w-full rounded-2xl border border-line/80 bg-card px-4 text-[16px] outline-none focus:border-accent";
  const primary = "flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[16px] font-semibold text-white disabled:opacity-40";

  return (
    <main>
      <PhoneTop title="Right to Rent ID" />

      {step !== "sent" && (
        <ol className="mb-5 flex gap-1.5" aria-label="Steps">
          {(["who", "doc", "photos"] as const).map((s, i) => {
            const at = ["who", "doc", "photos"].indexOf(step);
            return <li key={s} className="h-1.5 flex-1 rounded-full" style={{ background: i <= at ? "var(--accent)" : "var(--line)" }} />;
          })}
        </ol>
      )}

      {/* ── 1. who ── */}
      {step === "who" && (
        <>
          <h2 className="hand text-[21px] leading-tight">Whose ID Is It?</h2>

          {today === null ? (
            <Spinner label="Loading today's viewings" className="mt-3" />
          ) : (
            today.length > 0 && (
              <div className="mt-3">
                <p className="text-[13px] text-muted">From today&rsquo;s viewings</p>
                <ul className="mt-2 grid grid-cols-1 gap-2">
                  {today.map((a) => {
                    const picked = appt === a.id;
                    return (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setName(a.who);
                            setProperty(a.where);
                            setAppt(a.id);
                          }}
                          className="flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left"
                          style={{ borderColor: picked ? "var(--accent)" : "color-mix(in srgb, var(--line) 70%, transparent)", background: picked ? "var(--accent-soft)" : "var(--card)" }}
                        >
                          <span className="figures w-[46px] shrink-0 text-[15px]">{a.start}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-semibold">{a.who}</span>
                            <span className="block truncate text-[13px] text-muted">{a.where}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )
          )}

          <label className="mt-5 block">
            <span className="text-[13px] font-semibold">Their full name</span>
            <input className={`${field} mt-1.5`} value={name} onChange={(e) => { setName(e.target.value); setAppt(null); }} autoComplete="off" autoCapitalize="words" placeholder="As it is on the document" />
          </label>
          <label className="mt-3 block">
            <span className="text-[13px] font-semibold">Property</span>
            <input className={`${field} mt-1.5`} value={property} onChange={(e) => setProperty(e.target.value)} autoComplete="off" placeholder="The address they are applying for" />
          </label>

          <button type="button" disabled={name.trim().length < 2} onClick={() => setStep("doc")} className={`${primary} mt-5`} style={{ background: "var(--brown)" }}>
            Next
          </button>

          <section className="mt-8">
            <h3 className="hand text-[17px]">Sent in the Last Two Weeks</h3>
            {sent === null ? (
              <Spinner label="Loading" className="mt-2" />
            ) : sentError ? (
              <p className="mt-2 text-[13.5px] text-muted">{sentError}</p>
            ) : sent.length === 0 ? (
              <p className="mt-2 text-[13.5px] text-muted">Nothing sent yet.</p>
            ) : (
              <ul className="mt-2 grid grid-cols-1 gap-2">
                {sent.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 rounded-2xl bg-panel px-4 py-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card" style={{ color: "#56634a" }}>
                      <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-semibold">{s.name}</span>
                      <span className="block truncate text-[12.5px] text-muted">
                        {s.docType} · {new Date(s.at).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {/* ── 2. which document ── */}
      {step === "doc" && (
        <>
          <h2 className="hand text-[21px] leading-tight">Which Document?</h2>
          <p className="mt-1 text-[14px] text-muted">For {name.trim()}</p>
          <div className="mt-4 grid grid-cols-1 gap-3">
            {(Object.keys(DOCS) as DocType[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => chooseDoc(k)}
                className="flex min-h-[72px] items-center gap-4 rounded-[20px] border border-line/70 bg-card px-4 py-3 text-left active:bg-panel"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-dark">
                  <DoodleIcon name={k === "other" ? "doc" : "user"} size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="hand block text-[18px] leading-tight">{DOCS[k].title}</span>
                  <span className="block text-[13.5px] text-muted">{DOCS[k].sub}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="mt-4 rounded-2xl bg-panel px-4 py-3 text-[13.5px] leading-relaxed text-muted">
            If they have a share code instead, no photo is needed - send them to the office to check it online.
          </p>
          <button type="button" onClick={() => setStep("who")} className="mt-4 h-12 w-full text-[14.5px] font-semibold text-muted">
            Back
          </button>
        </>
      )}

      {/* ── 3. the photos ── */}
      {step === "photos" && d && (
        <>
          <h2 className="hand text-[21px] leading-tight">{d.title}</h2>
          <p className="mt-1 text-[14px] text-muted">For {name.trim()}</p>

          <ul className="mt-4 grid grid-cols-1 gap-3">
            {labels.map((label, i) => (
              <li key={`${label}-${i}`} className="rounded-[20px] border border-line/70 bg-card p-3">
                <div className="flex items-center justify-between gap-2 px-1">
                  <span className="text-[14.5px] font-semibold">{label}</span>
                  {d.more && labels.length > 1 && (
                    <button type="button" onClick={() => removePage(i)} className="text-[13px] font-semibold text-muted underline underline-offset-2">
                      Remove
                    </button>
                  )}
                </div>
                {previews[i] ? (
                  <div className="mt-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previews[i]!} alt={`${label} photo`} className="max-h-[220px] w-full rounded-xl bg-panel object-contain" />
                    <button type="button" onClick={() => setCamera(i)} className="mt-2 h-11 w-full rounded-xl border border-line/70 text-[14px] font-semibold">
                      Retake
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 grid grid-cols-1 gap-2">
                    <button type="button" onClick={() => setCamera(i)} className={primary} style={{ background: "var(--brown)" }}>
                      <DoodleIcon name="camera" size={18} /> Take Photo
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        libraryFor.current = i;
                        library.current?.click();
                      }}
                      className="h-11 w-full text-[13.5px] font-semibold text-muted"
                    >
                      Use a Photo Already Taken
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {d.more && labels.length < 6 && (
            <button type="button" onClick={addPage} className="mt-3 h-12 w-full rounded-2xl border border-dashed border-line text-[14.5px] font-semibold">
              Add Another Page
            </button>
          )}

          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-line/70 bg-card p-4">
            <input type="checkbox" checked={seen} onChange={(e) => setSeen(e.target.checked)} className="mt-0.5 h-6 w-6 shrink-0 accent-[var(--brown)]" />
            <span className="text-[14.5px] leading-snug">
              I have seen the original document with {name.trim() || "the person"} in front of me, and the photo looks like them.
            </span>
          </label>

          {error && <div className="mt-4"><ErrorLine text={error} /></div>}

          <button type="button" disabled={!ready} onClick={send} className={`${primary} mt-5`} style={{ background: "var(--brown)" }}>
            {sending ? (
              <>
                <span className="block h-5 w-5 animate-spin rounded-full border-[2.5px] border-white/40 border-t-white" /> Sending
              </>
            ) : (
              "Send to the Office"
            )}
          </button>
          <button type="button" onClick={() => setStep("doc")} disabled={sending} className="mt-2 h-12 w-full text-[14.5px] font-semibold text-muted">
            Back
          </button>

          <input
            ref={library}
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.currentTarget.value = "";
              if (f) put(libraryFor.current, f);
            }}
          />
        </>
      )}

      {/* ── 4. sent ── */}
      {step === "sent" && (
        <div className="pt-6 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "#f1f4ec", color: "#56634a" }}>
            <svg viewBox="0 0 24 24" aria-hidden className="h-8 w-8"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <h2 className="hand mt-4 text-[24px]">Sent to the Office</h2>
          <p className="mt-2 text-[15px] text-muted">
            {name.trim()}&rsquo;s {d?.title.toLowerCase() ?? "ID"} is filed with today&rsquo;s date and your name.
          </p>
          <div className="mt-6 grid gap-2">
            <button type="button" onClick={reset} className={primary} style={{ background: "var(--brown)" }}>
              Check Another Person
            </button>
            <Link href="/m" className="flex h-14 items-center justify-center rounded-2xl border border-line/70 bg-card text-[15px] font-semibold">
              Back to Home
            </Link>
          </div>
        </div>
      )}

      {camera !== null && d && (
        <DocCamera
          title={`${name.trim()} - ${labels[camera]}`}
          shapes={d.shapes}
          hint={d.hint}
          onShot={(f) => {
            put(camera, f);
            setCamera(null);
          }}
          onClose={() => setCamera(null)}
        />
      )}
    </main>
  );
}
