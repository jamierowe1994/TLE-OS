"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";
import SendSheet, { type SendTarget } from "@/components/landlord/SendSheet";

/**
 * THE PHONE SCREEN THE QR CODE OPENS.
 *
 * One list and one job. What it is NOT is the point: no navigation, no other
 * pages, nothing to open, nothing that would make a photographed code worth
 * having. The whole surface is "here is what is outstanding, press one to
 * photograph it".
 *
 * ── The clock is on the screen ─────────────────────────────────────────────
 *
 * The code dies twenty minutes after the desktop drew it, and a landlord who
 * discovers that by having an upload refused after taking five photographs has
 * been let down badly. So the time left is on the page from the first second,
 * and in the last two minutes it says so rather than just counting.
 */

interface Need {
  title: string;
  sub: string;
  kind: string;
}

export default function SendDocuments({
  token,
  firstName,
  expiresAt,
  needed,
  have,
  total,
}: {
  token: string;
  firstName: string;
  expiresAt: string;
  needed: Need[];
  have: number;
  total: number;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<SendTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  /**
   * NULL UNTIL THE CLIENT HAS LOOKED AT ITS OWN CLOCK.
   *
   * Seeded from Date.now() in useState this rendered on the server too, and
   * the server's second and the phone's second are never the same one - so
   * every visit threw a hydration mismatch and React discarded the markup it
   * had already painted. Null renders no clock at all for one frame, which is
   * the only honest thing a server can say about what time it is on somebody
   * else's phone.
   *
   * Recomputed from expiresAt on every tick rather than counted down, so a
   * phone that sleeps in a pocket for five minutes wakes up telling the truth.
   */
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [expiresAt]);

  async function send(files: File[]) {
    if (!target) return;
    setBusy(true);
    setErr(null);
    try {
      const body = new FormData();
      for (const f of files) body.append("file", f);
      body.set("token", token);
      body.set("kind", target.kind);
      body.set("label", target.label);
      const res = await fetch("/api/landlord/documents/send", { method: "POST", body });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!j.ok) throw new Error(j.error ?? "That did not send.");
      setDone((d) => [...d, target.label]);
      setTarget(null);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That did not send.");
    } finally {
      setBusy(false);
    }
  }

  const dead = left === 0;
  const low = left !== null && left < 120;
  const mmss = left === null ? "" : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const outstanding = needed.filter((n) => !done.includes(n.title));

  return (
    <main className="min-h-[100dvh] bg-[#faf9f7] px-5 pb-10 pt-[max(20px,env(safe-area-inset-top))] text-ink">
      <div className="mx-auto w-full max-w-[520px]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">The Letting Experts</p>
        <h1 className="mt-2 text-[27px] leading-[1.15]">
          {firstName ? `${firstName}, send us a document` : "Send us a document"}
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          Photograph it here and it goes straight onto your file. You do not need to sign in.
        </p>

        {/* ── the clock ── */}
        <p
          className={`mt-4 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-semibold ${
            dead || low ? "bg-accent-soft text-accent-dark" : "bg-white text-muted"
          }`}
        >
          <DoodleIcon name="clock" size={13} />
          {left === null
            ? "Checking how long this link has left"
            : dead
              ? "This link has run out"
              : low
                ? `Nearly out of time - ${mmss} left`
                : `This link works for ${mmss}`}
        </p>

        {dead ? (
          <p className="mt-6 rounded-[22px] bg-white p-6 text-[14px] leading-relaxed text-muted">
            Go back to your computer, press <span className="font-semibold text-ink">Send from your phone</span> and scan
            the new code. Anything you already sent is safely on your file.
          </p>
        ) : (
          <>
            {/* ── what is still outstanding ── */}
            <section className="mt-6">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                {outstanding.length > 0 ? "Still to send" : "Anything else"}
              </h2>

              {outstanding.length > 0 ? (
                <ul className="mt-3 space-y-2.5">
                  {outstanding.map((n) => (
                    <li key={n.title}>
                      <button
                        type="button"
                        onClick={() => setTarget({ kind: n.kind, label: n.title })}
                        className="flex w-full items-center gap-4 rounded-2xl border border-line/60 bg-white px-5 py-4 text-left active:bg-[#f6f5f2]"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-dark">
                          <DoodleIcon name="doc" size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14.5px] font-semibold leading-snug">{n.title}</span>
                          <span className="block text-[12px] leading-snug text-muted">{n.sub}</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-accent-dark px-4 py-2 text-[12.5px] font-semibold text-white">
                          Send
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 rounded-2xl bg-white p-5 text-[13.5px] leading-relaxed text-muted">
                  {total > 0 && have >= total
                    ? "Everything we asked for is in. Thank you."
                    : "Nothing outstanding on your file right now."}
                </p>
              )}
            </section>

            {/* ── and anything they simply want on the file ── */}
            <button
              type="button"
              onClick={() => setTarget({ kind: "other", label: "Something else" })}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line py-4 text-[13.5px] font-semibold text-muted active:bg-white"
            >
              <DoodleIcon name="upload" size={14} />
              Send something else
            </button>
          </>
        )}

        {/* ── what has gone up in this session ── */}
        {done.length > 0 && (
          <section className="mt-7">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Sent just now</h2>
            <ul className="mt-3 space-y-2">
              {done.map((t, i) => (
                <li key={`${t}-${i}`} className="flex items-center gap-3 rounded-2xl bg-white px-5 py-3.5">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
                    style={{ background: "#f1f4ec", color: "#56634a" }}
                  >
                    ✓
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{t}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
              These are on your file already. Your computer has them too - you can close this when you are finished.
            </p>
          </section>
        )}

        {err && (
          <p className="mt-5 rounded-2xl bg-accent-soft px-5 py-4 text-[13px] font-semibold leading-relaxed text-accent-dark">
            {err}
          </p>
        )}

        <p className="mt-9 text-[11.5px] leading-relaxed text-muted/80">
          This page can only add to your file. It cannot open anything already on it.
        </p>
      </div>

      {target && (
        <SendSheet target={target} busy={busy} onSend={(files) => void send(files)} onClose={() => setTarget(null)} />
      )}
    </main>
  );
}
