"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";
import { PLC_SENDS_EVENT, unwatchSend, watchedSends, type WatchedSend } from "@/lib/plc-send-watch";
import { toast } from "@/lib/toast";

/**
 * The corner card for a PLC check being sent (James, 16 Oct 2026).
 *
 * Reading a pack takes a few minutes, and the agent was stuck on the screen
 * for all of it. Now Send answers at once, and this card sits in the
 * bottom-right corner on every page, pushing Steve up out of the way, saying
 * how many documents have been read. When it is done it says so: sent to
 * compliance, or the one thing to fix, with the way back in.
 *
 * It asks the server every few seconds (send-status) for each pack this
 * browser sent. On the PLC page itself the wizard shows its own progress, so
 * the card keeps out of the way there.
 */

type Seen =
  | { kind: "reading"; read: number; of: number }
  | { kind: "sent" }
  | { kind: "fix"; error: string }
  | { kind: "lost"; error: string };

const GAP = 14;

export default function PlcSendCard() {
  const path = usePathname() ?? "";
  const [list, setList] = useState<WatchedSend[]>([]);
  const [seen, setSeen] = useState<Record<string, Seen>>({});
  const card = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const read = () => setList(watchedSends());
    read();
    window.addEventListener(PLC_SENDS_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(PLC_SENDS_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);

  /* Ask after each pack still being read. */
  const ids = list.map((s) => s.id).join(",");
  useEffect(() => {
    if (!list.length) return;
    let live = true;
    const ask = async () => {
      for (const s of list) {
        const now = seen[s.id];
        if (now && now.kind !== "reading") continue;
        try {
          const r = await fetch(`/api/plc/${encodeURIComponent(s.id)}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "send-status" }),
          });
          const j = (await r.json().catch(() => ({}))) as { ok?: boolean; reading?: boolean; error?: string; progress?: { read: number; of: number } };
          if (!live) return;
          let next: Seen;
          if (r.status === 202 || j.reading) next = { kind: "reading", read: j.progress?.read ?? 0, of: j.progress?.of ?? 0 };
          else if (r.ok && j.ok !== false) next = { kind: "sent" };
          else if (r.status === 409 && /didn't finish/i.test(j.error ?? ""))
            /* Asked before the send had started (another tab, a quick press): give it a moment. */
            next = Date.now() - s.startedAt < 20_000 ? { kind: "reading", read: 0, of: 0 } : { kind: "lost", error: j.error ?? "" };
          else next = { kind: "fix", error: j.error ?? "That didn't send." };
          setSeen((cur) => {
            const was = cur[s.id];
            if (was?.kind === "reading" && next.kind === "sent") toast(`PLC check sent to compliance: ${s.address}`);
            if (was?.kind === "reading" && next.kind === "fix") toast(`PLC check needs a fix: ${s.address}`, "bad");
            return { ...cur, [s.id]: next };
          });
        } catch {
          /* offline a moment: ask again next time */
        }
      }
    };
    void ask();
    const t = window.setInterval(ask, 4000);
    return () => {
      live = false;
      window.clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, JSON.stringify(Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, v.kind])))]);

  /* A sent one says so for a while, then goes by itself. */
  useEffect(() => {
    const done = list.filter((s) => seen[s.id]?.kind === "sent");
    if (!done.length) return;
    const t = window.setTimeout(() => done.forEach((s) => unwatchSend(s.id)), 20_000);
    return () => window.clearTimeout(t);
  }, [list, seen]);

  const onPlcPage = path.startsWith("/plc/start");
  const shown = onPlcPage ? [] : list;

  /* Steve and his bubble rise above the card, as they do for a toast. */
  useLayoutEffect(() => {
    const root = document.documentElement;
    const up = shown.length > 0 && Boolean(card.current);
    if (up) root.style.setProperty("--os-send-lift", `${card.current!.offsetHeight + GAP}px`);
    if (up) root.dataset.osSend = "up";
    else delete root.dataset.osSend;
  });
  useEffect(() => () => { delete document.documentElement.dataset.osSend; }, []);

  if (!shown.length) return null;
  return (
    <div ref={card} className="os-send-card fixed bottom-3 right-3 z-[190] flex w-[min(340px,calc(100vw-1.5rem))] flex-col gap-2">
      {shown.map((s) => {
        const v = seen[s.id] ?? { kind: "reading", read: 0, of: 0 };
        const pct = v.kind === "reading" && v.of ? Math.round((v.read / v.of) * 100) : v.kind === "reading" ? 4 : 100;
        return (
          <div key={s.id} role="status" aria-live="polite" className="rounded-2xl border border-line/70 bg-white p-4 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.25)]">
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${v.kind === "fix" || v.kind === "lost" ? "bg-[#fdefec]" : "bg-accent/15"}`}>
                <DoodleIcon name={v.kind === "sent" ? "checklist" : v.kind === "reading" ? "shield" : "info"} size={15} className="text-accent-dark" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-ink">
                  {v.kind === "reading" ? "Sending the PLC check" : v.kind === "sent" ? "PLC check sent" : v.kind === "lost" ? "PLC check not sent" : "PLC check needs a fix"}
                </p>
                <p className="truncate text-[12px] text-muted">{s.address}</p>
              </div>
              {v.kind !== "reading" && (
                <button type="button" aria-label="Close" onClick={() => unwatchSend(s.id)} className="-mr-1 -mt-1 rounded-full p-1 text-muted hover:text-ink">
                  <DoodleIcon name="cross" size={13} />
                </button>
              )}
            </div>
            {v.kind === "reading" && (
              <>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line/60">
                  <div className="h-full rounded-full bg-accent-dark transition-[width] duration-700" style={{ width: `${Math.max(4, pct)}%` }} />
                </div>
                <p className="mt-2 text-[11.5px] text-muted">
                  {v.of ? `Read ${v.read} of ${v.of} documents` : "Starting to read the documents"} · carry on, we&apos;ll say when it&apos;s done
                </p>
              </>
            )}
            {v.kind === "sent" && <p className="mt-2 text-[12px] text-ink">With the compliance team now.</p>}
            {(v.kind === "fix" || v.kind === "lost") && (
              <>
                <p className="mt-2 text-[12px] text-ink">{v.error}</p>
                <Link href={s.href} onClick={() => unwatchSend(s.id)} className="mt-2 inline-flex text-[12px] font-semibold text-accent-dark hover:underline">
                  Open the PLC check →
                </Link>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
