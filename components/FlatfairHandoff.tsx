"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Everything the Flatfair form asks for, on one screen, ready to copy.
 *
 * Until Flatfair's API exists this is the hand-off: the agent opens Flatfair
 * beside it, copies each line across, and ticks "Done in Flatfair" so the
 * board and Kirstie know without asking. The tick is the deal's "deposit
 * registered" checklist item, because for a Flatfair deal that is what it
 * means - there is no cash deposit to register anywhere else.
 */

interface Party {
  name: string | null;
  email: string | null;
  phone: string | null;
}

interface Facts {
  id: string;
  property: string;
  rentPcm: number | null;
  depositCap: number | null;
  moveIn: string | null;
  service: string | null;
  standingOrderRef: string | null;
  flatfairClause: boolean;
  tenants: Party[];
  guarantors: Party[];
  landlord: Party | null;
  agent: string | null;
}

interface Payload {
  ok: boolean;
  error?: string;
  url?: string;
  deal?: Facts;
  done?: { by: string; at: string } | null;
}

const gbp = (n: number | null) => (n == null ? "—" : `£${Math.round(n).toLocaleString("en-GB")}`);
const longDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—";

function Line({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard refused; the value is still on screen to select */
    }
  };
  return (
    <div className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
      <span className="w-36 shrink-0 text-[11px] uppercase tracking-wide text-muted">{label}</span>
      <span className="min-w-0 flex-1 select-all text-[13.5px]">{value || "—"}</span>
      {value && value !== "—" && (
        <button
          type="button"
          onClick={() => void copy()}
          className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[11px] text-muted transition hover:border-ink hover:text-ink"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      )}
    </div>
  );
}

function PartyLines({ title, p }: { title: string; p: Party }) {
  return (
    <>
      <Line label={title} value={p.name ?? ""} />
      <Line label="Email" value={p.email ?? ""} />
      <Line label="Phone" value={p.phone ?? ""} />
    </>
  );
}

export default function FlatfairHandoff({ dealId }: { dealId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/pretenancy/flatfair?deal=${encodeURIComponent(dealId)}`, { cache: "no-store" });
      const body = (await res.json()) as Payload;
      if (!body.ok) throw new Error(body.error ?? "Could not load the deal.");
      setData(body);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the deal.");
    }
  }, [dealId]);

  useEffect(() => {
    void load();
  }, [load]);

  const tick = async (done: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pretenancy/flatfair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal: dealId, done }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string; done?: Payload["done"] };
      if (!body.ok) throw new Error(body.error ?? "Could not save that.");
      setData((d) => (d ? { ...d, done: body.done ?? null } : d));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that.");
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) return <p className="text-[13px] text-red-600">{error}</p>;
  if (!data?.deal) {
    return (
      <div className="space-y-2.5" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-9 animate-pulse rounded-lg bg-line/40" />
        ))}
      </div>
    );
  }

  const d = data.deal;
  const everything = [
    `Property: ${d.property}`,
    `Rent: ${gbp(d.rentPcm)} pcm`,
    `Deposit equivalent: ${gbp(d.depositCap)}`,
    `Move-in: ${longDate(d.moveIn)}`,
    ...d.tenants.map((t, i) => `Tenant ${i + 1}: ${t.name ?? ""} · ${t.email ?? ""} · ${t.phone ?? ""}`),
    ...d.guarantors.map((g, i) => `Guarantor ${i + 1}: ${g.name ?? ""} · ${g.email ?? ""} · ${g.phone ?? ""}`),
    d.landlord ? `Landlord: ${d.landlord.name ?? ""} · ${d.landlord.email ?? ""} · ${d.landlord.phone ?? ""}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="rounded-2xl border border-line bg-card px-5 py-3">
        {!d.flatfairClause && (
          <p className="mb-3 mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
            This deal has no Flatfair clause in Propoly. If the tenant is paying a cash deposit, Kirstie
            registers it with the scheme instead and this screen is not needed.
          </p>
        )}
        <Line label="Property" value={d.property} />
        <Line label="Rent pcm" value={gbp(d.rentPcm)} />
        <Line label="Deposit equivalent" value={gbp(d.depositCap)} />
        <Line label="Move-in" value={longDate(d.moveIn)} />
        <Line label="Service" value={d.service ?? ""} />
        {d.tenants.map((t, i) => (
          <PartyLines key={`t${i}`} title={`Tenant ${i + 1}`} p={t} />
        ))}
        {d.guarantors.map((g, i) => (
          <PartyLines key={`g${i}`} title={`Guarantor ${i + 1}`} p={g} />
        ))}
        {d.landlord && <PartyLines title="Landlord" p={d.landlord} />}
      </div>

      <div className="space-y-3">
        <a
          href={data.url}
          target="_blank"
          rel="noreferrer"
          className="block rounded-2xl bg-ink px-4 py-3 text-center text-[13px] font-semibold text-white transition hover:opacity-90"
        >
          Open Flatfair
        </a>
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(everything).catch(() => undefined)}
          className="block w-full rounded-2xl border border-line bg-card px-4 py-3 text-center text-[13px] transition hover:border-ink"
        >
          Copy everything
        </button>

        <div className="rounded-2xl border border-line bg-card p-4">
          {data.done ? (
            <>
              <p className="text-[13px] font-semibold">Done in Flatfair</p>
              <p className="mt-1 text-[12px] text-muted">
                {data.done.by},{" "}
                {new Date(data.done.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}. Kirstie
                can generate the agreement.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void tick(false)}
                className="mt-3 text-[12px] text-muted underline-offset-2 hover:underline disabled:opacity-50"
              >
                Undo
              </button>
            </>
          ) : (
            <>
              <p className="text-[13px] font-semibold">When you have submitted it</p>
              <p className="mt-1 text-[12px] text-muted">
                Tick this and it shows on Kirstie's board as registered. She generates the tenancy
                agreement from there.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void tick(true)}
                className="mt-3 w-full rounded-full border border-ink px-4 py-2 text-[13px] font-semibold transition hover:bg-ink hover:text-white disabled:opacity-50"
              >
                Done in Flatfair
              </button>
            </>
          )}
          {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
