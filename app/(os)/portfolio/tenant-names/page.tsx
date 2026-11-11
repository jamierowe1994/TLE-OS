"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Ico, Mast } from "@/components/new-look/Parts";
import { initialOnly } from "@/lib/first-names";
import type { ManagedProperty } from "@/lib/portfolio-types";

/**
 * THE FIRST NAMES NOBODY HOLDS, TO TYPE IN ONCE (Lianna Denholm, 11 Nov 2026,
 * 1 Marchmont Road; James: "why does this keep happening").
 *
 * 77 tenants on 24 homes came across as an initial and a surname: the old
 * system's tenancy record named the joint let that way and PayProp holds the
 * same spelling. The book now spells out every one it can from PayProp or the
 * tenant's own email (lib/first-names); the rest are not written down in
 * anything the OS can read, so a person has to give them. Until now that meant
 * opening each home and pressing Edit on each tenant, which nobody did.
 *
 * This is every tenant on your book still held by an initial, home by home,
 * with one box each: their first name, Enter, next. Saved exactly as Edit on
 * the home saves it (PATCH /api/people/contact: kept in the OS beside the
 * record's spelling, never written to the old system), so the home, its jobs
 * and every works order show the whole name from then on.
 */

type Row = { listingId: string; ref: string; recordName: string; shown: string; email: string | null; phone: string | null };
type Home = { listingId: string; name: string; locality: string; agent: string | null; rows: Row[] };
type State = { status: "loading" } | { status: "failed"; error: string } | { status: "ready"; homes: Home[] };

const surnameOf = (name: string) => name.trim().split(/\s+/).pop() ?? "";

export default function TenantNamesPage() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const j = (await fetch("/api/portfolio", { cache: "no-store" }).then((r) => r.json())) as { ok?: boolean; error?: string; properties?: Array<ManagedProperty & { test?: boolean }> };
      if (!j.ok || !j.properties) return setState({ status: "failed", error: j.error ?? "The book couldn't be read just now." });
      const homes: Home[] = [];
      for (const p of j.properties) {
        if (p.test) continue;
        const rows = p.tenants
          .filter((t) => initialOnly(t.name))
          .map((t) => ({ listingId: String(p.listingId), ref: String(t.contactId ?? ""), recordName: t.recordName || t.name, shown: t.name, email: t.email, phone: t.phone }));
        if (rows.length) homes.push({ listingId: String(p.listingId), name: p.name, locality: p.locality, agent: p.agent?.name ?? null, rows });
      }
      homes.sort((a, b) => a.name.localeCompare(b.name, "en-GB", { numeric: true }));
      setState({ status: "ready", homes });
    } catch {
      setState({ status: "failed", error: "The book couldn't be read just now." });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const key = (r: Row) => `${r.listingId}|${r.ref}|${r.recordName}`;
  const total = useMemo(() => (state.status === "ready" ? state.homes.reduce((n, h) => n + h.rows.length, 0) : 0), [state]);
  const done = Object.keys(saved).length;

  async function save(r: Row) {
    const k = key(r);
    const first = (draft[k] ?? "").replace(/\s+/g, " ").trim();
    if (!first || busy) return;
    if (first.replace(/\./g, "").length < 2) return setProblem((p) => ({ ...p, [k]: "Their whole first name, not the initial." }));
    const full = `${first[0].toUpperCase()}${first.slice(1)} ${surnameOf(r.recordName)}`;
    setBusy(k);
    setProblem((p) => ({ ...p, [k]: "" }));
    try {
      const res = await fetch("/api/people/contact", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ref: r.ref, tenantName: r.recordName, name: full, keep: { email: r.email ?? "", phone: r.phone ?? "" } }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (j.ok) setSaved((s) => ({ ...s, [k]: full }));
      else setProblem((p) => ({ ...p, [k]: j.error ?? "That didn't save. Try again." }));
    } catch {
      setProblem((p) => ({ ...p, [k]: "That didn't save. Check your connection and try again." }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div data-look="new" className="nl-page nl-rise nl-edge nl-names">
      <Mast
        eyebrow="Portfolio"
        title="Tenant First Names"
        blurb={
          state.status === "loading"
            ? "Reading your book…"
            : state.status === "failed"
              ? "The book couldn't be read."
              : total === 0
                ? "Every tenant on your book has a first name."
                : `${total - done} of ${total} ${total === 1 ? "tenant is" : "tenants are"} still held by an initial. Their first names aren't written down in the old system or in PayProp, so type each one in once and it shows everywhere: the home, its jobs and every works order.`
        }
        actions={
          <Link href="/portfolio" className="nl-btn nl-btn--secondary">
            <Ico name="back" /> Back to Properties
          </Link>
        }
      />

      {state.status === "loading" ? (
        <p className="nl-meta nl-names-wait" role="status">
          <span className="nl-tq-spin" aria-hidden />
          Reading your book…
        </p>
      ) : state.status === "failed" ? (
        <div className="py-6" role="alert">
          <p className="nl-block-title">The book couldn&apos;t be read</p>
          <p className="nl-meta mt-1.5 max-w-xl">{state.error}</p>
          <button type="button" onClick={() => void load()} className="nl-btn nl-btn--secondary nl-btn--sm mt-4">Try again</button>
        </div>
      ) : total === 0 ? (
        <p className="nl-names-none">
          <Ico name="check" size={16} /> Nothing to type in.
        </p>
      ) : (
        <div className="nl-names-list">
          {state.homes.map((h) => (
            <section key={h.listingId} className="nl-names-home">
              <header>
                <div className="min-w-0">
                  <h2 className="nl-names-title">{h.name}</h2>
                  <p className="nl-meta">{[h.locality, h.agent].filter(Boolean).join("  ·  ")}</p>
                </div>
                <Link href={`/portfolio/${h.listingId}`} className="nl-link">Open the home</Link>
              </header>
              <ul>
                {h.rows.map((r) => {
                  const k = key(r);
                  const now = saved[k];
                  const editable = r.ref.startsWith("rexpm:");
                  return (
                    <li key={k} className={now ? "is-done" : undefined}>
                      <div className="nl-names-who">
                        <span className="nl-strong">{now ?? r.shown}</span>
                        <span className="nl-meta">{[r.email, r.phone].filter(Boolean).join("  ·  ") || "No email or number on file"}</span>
                      </div>
                      {now ? (
                        <span className="nl-names-saved"><Ico name="check" size={14} /> Saved</span>
                      ) : editable ? (
                        <form
                          className="nl-names-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void save(r);
                          }}
                        >
                          <label className="sr-only" htmlFor={`fn-${k}`}>First name for {r.shown}</label>
                          <input
                            id={`fn-${k}`}
                            className="nl-input"
                            value={draft[k] ?? ""}
                            onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                            placeholder={`First name (${r.shown.trim()[0]}…)`}
                            autoComplete="off"
                            autoCapitalize="words"
                          />
                          <span className="nl-names-sur">{surnameOf(r.recordName)}</span>
                          <button type="submit" className="nl-btn nl-btn--primary nl-btn--sm" disabled={busy === k || !(draft[k] ?? "").trim()}>
                            {busy === k ? "Saving…" : "Save"}
                          </button>
                        </form>
                      ) : (
                        <Link href={`/portfolio/${h.listingId}`} className="nl-btn nl-btn--secondary nl-btn--sm">Change on the home</Link>
                      )}
                      {problem[k] ? <p className="nl-names-bad" role="alert">{problem[k]}</p> : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
