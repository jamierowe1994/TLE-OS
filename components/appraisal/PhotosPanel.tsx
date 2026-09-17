"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import type { MarketAppraisal } from "@/lib/market-appraisal";

/**
 * THE PHOTOGRAPHS OFF THE CAMERA (James, 17 Sep 2026).
 *
 * "A nice big drop box, so they should just be able to grab all of the photos
 * and then drop them into the file in mass. We'll slowly upload them, and
 * we'll show them the completion percentage."
 *
 * One request per photograph, so each one fills up and the bar across the top
 * is honest: forty photographs in one post shows nothing for a minute and
 * then either works or does not. Failures are named and the rest carry on.
 *
 * Underneath, the advert - written here rather than a week later on the
 * listing, because "it's always better to do it once you've been to the
 * property and you can remember what it's like". The agent can steer it
 * first: they were there and the model was not.
 */
type Photo = { id: string; name: string; bytes: number | null; contentType: string; uploadedBy: string; uploadedAt: string };
type Job = { name: string; pct: number; error?: string };

const size = (n: number | null) => (n == null ? "" : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`);

export default function PhotosPanel({ ma }: { ma: MarketAppraisal }) {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [over, setOver] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  /* The advert. */
  const [steer, setSteer] = useState("");
  const [writing, setWriting] = useState(false);
  const [advert, setAdvert] = useState<{ heading: string; body: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/appraisals/${encodeURIComponent(ma.id)}/photos`, { cache: "no-store" });
      const j = (await r.json()) as { ok?: boolean; photos?: Photo[] };
      setPhotos(j.ok ? j.photos ?? [] : []);
    } catch {
      setPhotos([]);
    }
  }, [ma.id]);

  useEffect(() => {
    void load();
  }, [load]);

  /** One photograph, with its own progress. */
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
    /* Three at a time: a phone on site has one bar, and forty at once is
       forty that all stall. */
    for (let i = 0; i < pics.length; i += 3) {
      await Promise.all(pics.slice(i, i + 3).map((f, n) => upload(f, from + i + n)));
      await load();
    }
  }

  const done = jobs.filter((j) => j.pct === 100).length;
  const failed = jobs.filter((j) => j.error).length;
  const busy = jobs.length > 0 && done < jobs.length;
  const overall = jobs.length ? Math.round(jobs.reduce((n, j) => n + j.pct, 0) / jobs.length) : 0;

  async function write() {
    if (writing) return;
    setWriting(true);
    setNote(null);
    try {
      const urls = (photos ?? []).slice(0, 4).map((p) => `${window.location.origin}/api/appraisals/${encodeURIComponent(ma.id)}/photos?photo=${encodeURIComponent(p.id)}`);
      const r = await fetch("/api/listings/describe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: ma.address,
          locality: ma.postcode ?? "",
          rent: ma.valuation ?? null,
          rentPeriod: "month",
          photos: urls,
          steer,
          current: advert?.body ?? null,
        }),
      });
      const j = (await r.json()) as { ok?: boolean; heading?: string; body?: string; error?: string };
      if (!j.ok || !j.body) throw new Error(j.error ?? "Nothing came back.");
      setAdvert({ heading: j.heading ?? "", body: j.body });
    } catch (e) {
      setNote(e instanceof Error ? e.message : "The writer could not be reached.");
    } finally {
      setWriting(false);
    }
  }

  return (
    <section className="rounded-[22px] border border-line/50 bg-white p-5">
      <h2 className="hand flex items-center gap-3 text-[17px] leading-tight">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
          <DoodleIcon name="pack/photo" size={16} />
        </span>
        Photographs and the advert
      </h2>

      {/* ── the drop box ── */}
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
        className="mt-4 flex cursor-copy flex-col items-center justify-center rounded-[20px] border-2 border-dashed px-6 py-10 text-center transition-colors"
        style={{ borderColor: over ? "#56423e" : "rgba(86,66,62,0.25)", background: over ? "rgba(86,66,62,0.05)" : "transparent" }}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
          <DoodleIcon name="pack/photo" size={22} />
        </span>
        <p className="mt-3 text-[14px] font-semibold">Drop the photographs here</p>
        <p className="mt-1 text-[12.5px] text-muted">All of them at once is fine. Or click to pick them off the camera.</p>
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
              {busy ? `Uploading ${done + 1} of ${jobs.length}` : `${jobs.length - failed} of ${jobs.length} uploaded`}
              {failed ? ` · ${failed} didn't` : ""}
            </span>
            <span className="text-muted">{overall}%</span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-line/50">
            <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${overall}%`, background: "#56423e" }} />
          </div>
          {failed > 0 && (
            <ul className="mt-2 space-y-0.5">
              {jobs.filter((j) => j.error).map((j) => (
                <li key={j.name} className="text-[11.5px] text-accent-dark">
                  {j.name}: {j.error}
                </li>
              ))}
            </ul>
          )}
          {!busy && (
            <button type="button" onClick={() => setJobs([])} className="mt-2 text-[11.5px] text-muted underline underline-offset-2 hover:text-ink">
              Clear this list
            </button>
          )}
        </div>
      )}

      {/* ── what is on the file ── */}
      <div className="mt-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          {photos === null ? "Reading the file…" : photos.length ? `${photos.length} on the file` : "Nothing on the file yet"}
        </p>
        {photos && photos.length > 0 && (
          <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
            {photos.map((p) => (
              <li key={p.id} className="group relative overflow-hidden rounded-xl border border-line/60">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/appraisals/${encodeURIComponent(ma.id)}/photos?photo=${encodeURIComponent(p.id)}`} alt={p.name} className="h-28 w-full object-cover" loading="lazy" />
                <button
                  type="button"
                  onClick={async () => {
                    await fetch(`/api/appraisals/${encodeURIComponent(ma.id)}/photos?photo=${encodeURIComponent(p.id)}`, { method: "DELETE" });
                    void load();
                  }}
                  aria-label={`Remove ${p.name}`}
                  className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-[13px] text-muted opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
                >
                  ✕
                </button>
                <span className="absolute inset-x-0 bottom-0 truncate bg-black/45 px-1.5 py-0.5 text-[10px] text-white">{size(p.bytes)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── the advert ── */}
      <div className="mt-6 border-t border-line/50 pt-5">
        <p className="text-[13.5px] font-semibold">Write the advert while you remember it</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          It reads the photographs you have just put on. Tell it anything worth leading on first - you were there, it wasn&apos;t.
        </p>
        <textarea
          value={steer}
          onChange={(e) => setSteer(e.target.value)}
          rows={2}
          placeholder="Lead on the garden and the new kitchen. The third bedroom is a good single, not a box room."
          className="mt-3 w-full resize-y rounded-xl border border-line/70 px-3.5 py-2.5 text-[13px] outline-none focus:border-ink/40"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void write()}
            disabled={writing || !photos?.length}
            className="rounded-full bg-accent-dark px-5 py-2.5 text-[12.5px] font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {writing ? "Writing…" : advert ? "Write it again" : "Write it with AI"}
          </button>
          {!photos?.length && <span className="text-[11.5px] text-muted">Put the photographs on first.</span>}
          {ma.rexPropertyId && (
            <Link href={`/listings?open=${encodeURIComponent(ma.rexPropertyId)}`} className="text-[12px] text-muted underline underline-offset-4 hover:text-ink">
              Open the listing to fill in the rest
            </Link>
          )}
        </div>
        {note && <p className="mt-2 text-[11.5px] text-accent-dark">{note}</p>}
        {advert && (
          <div className="mt-4 rounded-2xl border border-line/60 bg-page/60 p-4">
            <p className="text-[13.5px] font-semibold">{advert.heading}</p>
            <p className="mt-2 whitespace-pre-wrap text-[12.5px] leading-relaxed">{advert.body}</p>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(`${advert.heading}\n\n${advert.body}`);
                setNote("Copied. Paste it onto the listing.");
              }}
              className="mt-3 rounded-full border border-line/80 px-4 py-2 text-[12px] font-semibold transition-colors hover:border-ink/40"
            >
              Copy it
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
