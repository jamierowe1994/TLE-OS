"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Mast } from "@/components/new-look/Parts";
import type { MerchDelivery, MerchLine } from "@/lib/merch-catalogue";

/**
 * Every merch order, newest first, for the owners to work through (lib/merch).
 * Send to Maker passes each part to its maker (Clothes2Order the clothing,
 * Prodigi the mugs); the daily check then moves it along to On Its Way, and the
 * person who ordered sees the same words and the tracking link in the shop.
 */

type Job = {
  maker: string;
  ref: string;
  makerRef: string;
  mode: "standin" | "test" | "live";
  sentAt: string;
  stage: string;
  said: string;
  carrier: string | null;
  tracking: string | null;
  cost: string | null;
  dispatchBy: string | null;
  issues: string[];
  photos: string[];
  checkedAt: string | null;
  error: string | null;
};
type Send = { ready: boolean; problems: string[]; makers: { maker: string; name: string; mode: Job["mode"] | null }[] };
type Order = {
  id: string;
  userName: string;
  userEmail: string;
  lines: MerchLine[];
  notes: string;
  status: string;
  delivery: MerchDelivery | null;
  jobs: Job[];
  send: Send;
  createdAt: string;
};

const STATUSES = [
  { id: "new", label: "With James" },
  { id: "ordered", label: "Being Made" },
  { id: "dispatched", label: "On Its Way" },
  { id: "delivered", label: "Delivered" },
  { id: "ready", label: "Ready to Collect" },
  { id: "collected", label: "Collected" },
  { id: "cancelled", label: "Cancelled" },
];

const MAKER: Record<string, string> = { c2o: "Clothes2Order", prodigi: "Prodigi" };
const STAGE: Record<string, string> = {
  sent: "Sent",
  making: "Being made",
  on_hold: "On hold",
  dispatched: "Dispatched",
  delivered: "Delivered",
  cancelled: "Cancelled",
  failed: "Failed",
};
const MODE: Record<Job["mode"], string> = { standin: "Stand-in", test: "Test", live: "Live" };

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Spin() {
  return <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" aria-hidden />;
}

export default function MerchOrders() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setError(null);
    fetch("/api/merch/orders?all=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; orders?: Order[]; error?: string }) => {
        if (!j.ok) throw new Error(j.error || "Could not read the orders.");
        setOrders(j.orders ?? []);
      })
      .catch((e: Error) => setError(e.message || "Could not read the orders."));
  }, []);
  useEffect(load, [load]);

  const patch = async (id: string, body: Record<string, string>, tag: string) => {
    setBusy(`${id}:${tag}`);
    setRowError((m) => ({ ...m, [id]: "" }));
    const r = await fetch("/api/merch/orders", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...body }) }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; order?: Order }) : null;
    setBusy(null);
    if (j?.order) setOrders((o) => (o ?? []).map((x) => (x.id === id ? j.order! : x)));
    else if (j?.ok && body.status) setOrders((o) => (o ?? []).map((x) => (x.id === id ? { ...x, status: body.status } : x)));
    if (!j?.ok) setRowError((m) => ({ ...m, [id]: j?.error || "That didn't work. Try again." }));
  };

  const totals = new Map<string, number>();
  for (const o of orders ?? []) {
    if (o.status !== "new") continue;
    for (const l of o.lines) totals.set(`${l.name}, ${l.colour}, ${l.size}`, (totals.get(`${l.name}, ${l.colour}, ${l.size}`) ?? 0) + l.qty);
  }

  return (
    <div data-look="new" className="nl-page nl-rise nl-edge">
      <Mast
        title="Merch Orders"
        blurb="Every order from the merch shop, newest first. Send each one to its maker, and the person who ordered sees it move to On Its Way with a tracking link."
      />
      <p className="mb-6">
        <Link href="/tools/merch" className="text-[13px] text-[var(--accent)] underline underline-offset-4">
          Back to the shop
        </Link>
      </p>

      {error && <p className="mb-4 bg-[var(--bad-soft,#f6e9e6)] px-3 py-2 text-[13px] text-[var(--bad-ink,#7d3a32)]">{error}</p>}

      {orders === null && !error ? (
        <p className="flex items-center gap-2 py-10 text-[13px] text-muted">
          <Spin />
          Reading the orders
        </p>
      ) : orders && orders.length === 0 ? (
        <p className="py-10 text-[13.5px] text-muted">No orders yet.</p>
      ) : orders ? (
        <>
          {totals.size > 0 && (
            <section className="mb-8 border border-line/70 bg-card p-5">
              <h2 className="nl-section-title">Still to Send</h2>
              <p className="nl-meta mb-3">Everything With James, added up.</p>
              <ul className="grid gap-1.5 text-[13.5px] sm:grid-cols-2">
                {[...totals.entries()].map(([k, n]) => (
                  <li key={k}>
                    <b className="font-semibold">{n}</b> x {k}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <ul className="divide-y divide-line/60 border-y border-line/60">
            {orders.map((o) => {
              const tests = o.send.makers.filter((m) => m.mode && m.mode !== "live");
              const sendLabel = tests.length ? `Send to Maker (${[...new Set(tests.map((m) => MODE[m.mode!]))].join(", ")})` : "Send to Maker";
              const canCheck = o.jobs.some((j) => !j.error && j.makerRef && !["dispatched", "delivered", "cancelled", "failed"].includes(j.stage));
              return (
                <li key={o.id} className="grid gap-4 py-5 md:grid-cols-[220px_1fr_240px] md:items-start">
                  <div className="min-w-0">
                    <p className="text-[14px] text-ink">{o.userName || o.userEmail}</p>
                    <p className="text-[12px] text-muted">{when(o.createdAt)}</p>
                    {o.delivery ? (
                      <p className="mt-2 text-[12.5px] leading-[1.5] text-muted">
                        {o.delivery.name}
                        <br />
                        {o.delivery.line1}
                        {o.delivery.line2 && (
                          <>
                            <br />
                            {o.delivery.line2}
                          </>
                        )}
                        <br />
                        {o.delivery.town} {o.delivery.postcode}
                      </p>
                    ) : (
                      <p className="mt-2 text-[12.5px] text-muted">No delivery address</p>
                    )}
                  </div>

                  <div className="min-w-0 text-[13.5px] text-ink">
                    {o.lines.map((l, i) => (
                      <p key={i}>
                        {l.qty} x {l.name} <span className="text-muted">{l.colour}, {l.size}</span>
                      </p>
                    ))}
                    {o.notes && <p className="mt-1.5 text-[12.5px] text-muted">&ldquo;{o.notes}&rdquo;</p>}

                    {o.jobs.length > 0 && (
                      <ul className="mt-3 grid gap-2">
                        {o.jobs.map((j) => (
                          <li key={j.ref} className="border border-line/70 bg-card px-3 py-2.5 text-[12.5px]">
                            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <b className="font-semibold text-ink">{MAKER[j.maker] ?? j.maker}</b>
                              {j.mode !== "live" && <span className="bg-[var(--warn-soft,#f7ece9)] px-1.5 py-px text-[11px] text-[#A85A51]">{MODE[j.mode]}</span>}
                              <span className="text-muted">{j.error ? "Not sent" : STAGE[j.stage] ?? j.stage}</span>
                              {j.makerRef && <span className="text-muted">· {j.makerRef}</span>}
                              {j.cost && <span className="text-muted">· £{j.cost}</span>}
                            </p>
                            {j.error && <p className="mt-1 text-[#7d3a32]">{j.error}</p>}
                            {j.said && !j.error && <p className="mt-1 text-muted">{j.said}</p>}
                            {j.dispatchBy && <p className="mt-1 text-muted">Due out {j.dispatchBy}</p>}
                            {j.issues.map((x, i) => (
                              <p key={i} className="mt-1 text-[#7d3a32]">
                                {x}
                              </p>
                            ))}
                            {j.tracking && (
                              <a href={j.tracking} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[var(--accent)] underline underline-offset-4">
                                Track it{j.carrier ? ` with ${j.carrier}` : ""}
                              </a>
                            )}
                            {j.photos.length > 0 && (
                              <p className="mt-1.5 flex gap-1.5">
                                {j.photos.slice(0, 4).map((src) => (
                                  <a key={src} href={src} target="_blank" rel="noopener noreferrer">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={src} alt="Being made" className="h-12 w-12 object-cover" />
                                  </a>
                                ))}
                              </p>
                            )}
                            <p className="mt-1 text-[11.5px] text-muted">
                              Sent {when(j.sentAt)}
                              {j.checkedAt ? ` · last checked ${when(j.checkedAt)}` : ""}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="grid gap-2">
                    {o.status === "new" && (
                      <>
                        <button
                          type="button"
                          disabled={!o.send.ready || busy !== null}
                          onClick={() => patch(o.id, { action: "send" }, "send")}
                          className="inline-flex h-10 items-center justify-center gap-2 bg-[#56423E] px-4 text-[13px] text-[#F8F7F4] disabled:cursor-not-allowed disabled:bg-[#56423E]/35"
                        >
                          {busy === `${o.id}:send` && <Spin />}
                          {busy === `${o.id}:send` ? "Sending" : sendLabel}
                        </button>
                        {!o.send.ready && (
                          <ul className="grid gap-1 text-[12px] text-muted">
                            {o.send.problems.map((p) => (
                              <li key={p}>{p}</li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                    {o.jobs.some((j) => j.error) && (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => patch(o.id, { action: "retry" }, "retry")}
                        className="inline-flex h-10 items-center justify-center gap-2 border border-ink px-4 text-[13px] text-ink disabled:opacity-40"
                      >
                        {busy === `${o.id}:retry` && <Spin />}
                        Send Again
                      </button>
                    )}
                    {canCheck && (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => patch(o.id, { action: "check" }, "check")}
                        className="inline-flex h-10 items-center justify-center gap-2 border border-line px-4 text-[13px] text-ink disabled:opacity-40"
                      >
                        {busy === `${o.id}:check` && <Spin />}
                        {busy === `${o.id}:check` ? "Asking" : "Check Now"}
                      </button>
                    )}
                    <label className="block">
                      <span className="mb-1 block text-[11.5px] text-muted">Or move it by hand</span>
                      <select
                        value={o.status}
                        disabled={busy !== null}
                        onChange={(e) => patch(o.id, { status: e.target.value }, "status")}
                        className="h-9 w-full border border-line bg-card px-2 text-[13px] text-ink"
                      >
                        {STATUSES.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {rowError[o.id] && <p className="bg-[var(--bad-soft,#f6e9e6)] px-3 py-2 text-[12.5px] text-[var(--bad-ink,#7d3a32)]">{rowError[o.id]}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}
