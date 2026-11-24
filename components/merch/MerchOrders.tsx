"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Mast } from "@/components/new-look/Parts";
import type { MerchLine } from "@/lib/merch-catalogue";

/**
 * Every merch order, newest first, for the owners to work through (lib/merch).
 * Each moves With James > Ordered > Ready to Collect > Collected, and the
 * person who ordered sees the same word under Your Orders in the shop.
 */

type Order = { id: string; userName: string; userEmail: string; lines: MerchLine[]; notes: string; status: string; createdAt: string };

const STATUSES = [
  { id: "new", label: "With James" },
  { id: "ordered", label: "Ordered" },
  { id: "ready", label: "Ready to Collect" },
  { id: "collected", label: "Collected" },
];

export default function MerchOrders() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

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

  const move = async (id: string, status: string) => {
    setSaving(id);
    const r = await fetch("/api/merch/orders", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status }) }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { ok?: boolean; error?: string }) : null;
    setSaving(null);
    if (!j?.ok) {
      setError(j?.error || "That didn't save. Try again.");
      return;
    }
    setOrders((o) => (o ?? []).map((x) => (x.id === id ? { ...x, status } : x)));
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
        blurb="Every order from the merch shop, newest first. Move each one along and the person who ordered sees it under Your Orders."
      />
      <p className="mb-6">
        <Link href="/tools/merch" className="text-[13px] text-[var(--accent)] underline underline-offset-4">
          Back to the shop
        </Link>
      </p>

      {error && <p className="mb-4 bg-[var(--bad-soft,#f6e9e6)] px-3 py-2 text-[13px] text-[var(--bad-ink,#7d3a32)]">{error}</p>}

      {orders === null && !error ? (
        <p className="flex items-center gap-2 py-10 text-[13px] text-muted">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />
          Reading the orders
        </p>
      ) : orders && orders.length === 0 ? (
        <p className="py-10 text-[13.5px] text-muted">No orders yet.</p>
      ) : orders ? (
        <>
          {totals.size > 0 && (
            <section className="mb-8 border border-line/70 bg-card p-5">
              <h2 className="nl-section-title">Still to Order</h2>
              <p className="nl-meta mb-3">Everything With James, added up, so it can go to the supplier in one go.</p>
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
            {orders.map((o) => (
              <li key={o.id} className="grid gap-3 py-4 md:grid-cols-[220px_1fr_220px] md:items-start">
                <div>
                  <p className="text-[14px] text-ink">{o.userName || o.userEmail}</p>
                  <p className="text-[12px] text-muted">
                    {new Date(o.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div className="text-[13.5px] text-ink">
                  {o.lines.map((l, i) => (
                    <p key={i}>
                      {l.qty} x {l.name} <span className="text-muted">{l.colour}, {l.size}</span>
                    </p>
                  ))}
                  {o.notes && <p className="mt-1.5 text-[12.5px] text-muted">&ldquo;{o.notes}&rdquo;</p>}
                </div>
                <label className="block">
                  <span className="sr-only">Where this order is</span>
                  <select
                    value={o.status}
                    disabled={saving === o.id}
                    onChange={(e) => move(o.id, e.target.value)}
                    className="h-9 w-full border border-line bg-card px-2 text-[13px] text-ink"
                  >
                    {STATUSES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
