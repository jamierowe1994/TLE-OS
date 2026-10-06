"use client";

import { useMemo } from "react";
import CornerSwell from "@/components/CornerSwell";
import { doneAgo, type DonePassport } from "@/lib/passports-done-shape";
import type { Lead } from "@/lib/leads-sample";

/**
 * Leads > Tenants > Passports done.
 *
 * Kirstie, 6 Oct 2026: she books no viewing until the tenant has filled in
 * their passport, and with many homes on the market at once she needs the
 * people who are READY in one place, newest first, rather than a pill inside
 * each drawer. A row that matches a lead on the board opens it; a finished
 * passport with no lead still shows, because the tenant is still ready.
 */

/** The sage tick, the same as the drawer's. */
export function PassportDonePill({ at }: { at?: string }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-sage/40 px-2 py-0.5 text-[10.5px] font-semibold text-ink">
      <span aria-hidden>✓</span> Passport done{at ? ` · ${doneAgo(at)}` : ""}
    </span>
  );
}

export default function PassportsDoneList({
  passports,
  error,
  leads,
  activeId,
  onOpen,
  q,
  manyAgents,
}: {
  passports: DonePassport[] | null;
  error: string | null;
  /** The tenant side of the board, to match a passport to its lead. */
  leads: Lead[];
  activeId: string | null;
  onOpen: (leadId: string) => void;
  q: string;
  manyAgents: boolean;
}) {
  const rows = useMemo(() => {
    if (!passports) return [];
    const byEmail = new Map<string, Lead>();
    const byId = new Map<string, Lead>();
    for (const l of leads) {
      byId.set(l.id, l);
      const e = (l.email ?? "").trim().toLowerCase();
      /* The book is newest first, so the first lead an email meets is its newest. */
      if (e && !byEmail.has(e)) byEmail.set(e, l);
    }
    const needle = q.trim().toLowerCase();
    return passports
      .map((p) => ({ p, lead: (p.leadId ? byId.get(p.leadId) : undefined) ?? byEmail.get(p.email.trim().toLowerCase()) ?? null }))
      .filter(({ p, lead }) => {
        if (!needle) return true;
        const homes = [...p.homes, lead?.address ?? "", lead?.preferred ?? ""].join(" ");
        return `${p.name} ${p.email} ${p.phone ?? ""} ${homes} ${p.agent ?? ""}`.toLowerCase().includes(needle);
      });
  }, [passports, leads, q]);

  return (
    <div className="fade-up relative min-w-0 rounded-[22px] border border-line/50 bg-white p-5">
      <CornerSwell />
      <p className="relative text-[11px] leading-relaxed text-muted">
        Every tenant who has finished their passport, newest first. They are ready to book a viewing.
      </p>

      {error ? (
        <div className="relative mt-4 rounded-2xl border border-line/50 px-4 py-6 text-center" role="alert">
          <p className="text-[13px] font-semibold text-ink">The passports didn&apos;t load</p>
          <p className="mx-auto mt-1.5 max-w-md text-[12px] leading-relaxed text-muted">{error}</p>
        </div>
      ) : passports === null ? (
        <p className="relative mt-5 flex items-center gap-2 text-[12px] text-muted" role="status">
          <span className="block h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
          Reading the finished passports…
        </p>
      ) : rows.length === 0 ? (
        <p className="relative mt-5 text-[12px] text-muted" role="status">
          {q.trim() ? "Nobody with a finished passport matches that search." : "No tenant has finished their passport yet."}
        </p>
      ) : (
        <div className="relative mt-4 overflow-x-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead className="bg-page">
              <tr className="border-b border-line/70">
                {["Tenant", "Passport", "Homes asked about", ...(manyAgents ? ["Agent"] : []), "Phone"].map((h) => (
                  <th key={h} className="whitespace-nowrap bg-page pb-2.5 pr-3 pt-1 text-[9.5px] font-bold uppercase tracking-wider text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, lead }) => {
                const homes = p.homes.length ? p.homes : lead?.address ? [lead.address] : [];
                const active = Boolean(lead && activeId === lead.id);
                return (
                  <tr
                    key={p.id}
                    onClick={lead ? () => onOpen(lead.id) : undefined}
                    title={lead ? "Open their lead" : "Not on the board - nothing to open"}
                    className={`border-b border-line/40 transition-[border-color,background-color] duration-200 last:border-0 ${
                      lead ? "cursor-pointer" : ""
                    } ${active ? "bg-accent-soft/50" : lead ? "hover:border-ink hover:bg-page" : ""}`}
                  >
                    <td className="py-3.5 pr-3">
                      <span className="block whitespace-nowrap">
                        <span className="hand text-[13px]">{p.name}</span>
                        <span className="block text-[10.5px] text-muted">{p.email}</span>
                      </span>
                    </td>
                    <td className="py-3.5 pr-3">
                      <PassportDonePill />
                      <span className="mt-1 block whitespace-nowrap text-[10.5px] text-muted">
                        {new Date(p.submittedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {/* "2h ago" while it is recent; past a fortnight the date says it. */}
                        {/ago|yesterday|now/.test(doneAgo(p.submittedAt)) && ` · ${doneAgo(p.submittedAt)}`}
                      </span>
                    </td>
                    <td className="py-3.5 pr-3 text-muted">
                      {homes.length ? (
                        <span className="block min-w-[180px]">
                          {homes.slice(0, 2).join("; ")}
                          {homes.length > 2 && <span className="text-[10.5px]"> and {homes.length - 2} more</span>}
                        </span>
                      ) : (
                        <span className="text-[11px]">-</span>
                      )}
                    </td>
                    {manyAgents && <td className="whitespace-nowrap py-3.5 pr-3 text-muted">{p.agent ?? "-"}</td>}
                    <td className="whitespace-nowrap py-3.5 pr-3 text-muted">{p.phone ?? lead?.phone ?? "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
