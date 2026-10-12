"use client";

import { useEffect, useState } from "react";

/**
 * THE SERVICE AND THE FEE, UNDER "MANAGED" (Susan, 12 Oct 2026).
 *
 * "We have them tagged to say experts manage service with RLP or experts
 * manage service without RLP ... legal cover only, which is LEC. So we just
 * need to have those on the property records." And the management fee, held
 * in PayProp as pounds (E&W) or a percentage (Scotland), shown both ways:
 * the percentage is the fee over the rent. From /api/portfolio/service, the
 * 10am/4pm PayProp copy. A home with no service tag says so, in red: that is
 * what her monthly RLP cross-check is looking for.
 */

type Service =
  | { state: "unreachable" | "unmatched"; detail: string }
  | {
      state: "ok";
      checkedAt: string;
      agency: string;
      tags: string[] | null;
      tagsWhy: string | null;
      service: { kind: "rlp" | "no-rlp" | "lec"; tag: string } | null;
      fee: { monthly: number | null; percent: number | null; fixed: boolean; rent: number | null } | null;
      feeWhy: string | null;
    };

const LABEL = { rlp: "With RLP", "no-rlp": "No RLP", lec: "Legal cover only" } as const;
const TONE = {
  rlp: "border-[#56634a]/30 bg-[#f1f4ec] text-[#56634a]",
  "no-rlp": "border-line bg-white text-ink",
  lec: "border-line bg-white text-ink",
} as const;
const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${n.toLocaleString("en-GB", { maximumFractionDigits: 1 })}%`;

export default function ServiceTag({ listingId }: { listingId: string }) {
  const [s, setS] = useState<Service | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setS(null);
    setFailed(null);
    fetch(`/api/portfolio/service?listing=${encodeURIComponent(listingId)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (j.ok) setS(j.service);
        else setFailed(j.error || "PayProp couldn't be read just now.");
      })
      .catch(() => live && setFailed("PayProp couldn't be read just now."));
    return () => {
      live = false;
    };
  }, [listingId]);

  if (failed) return <p className="text-[11.5px] text-muted">{failed}</p>;
  if (!s)
    return (
      <p className="flex items-center gap-1.5 text-[11.5px] text-muted">
        <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
        Checking PayProp…
      </p>
    );
  if (s.state !== "ok") return <p className="text-[11.5px] text-muted">{s.detail}</p>;

  const others = (s.tags ?? []).filter((t) => t !== s.service?.tag);
  const fee = s.fee;
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
        {s.service ? (
          <span title={`PayProp tag: ${s.service.tag}`} className={`rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold ${TONE[s.service.kind]}`}>
            {LABEL[s.service.kind]}
          </span>
        ) : s.tags ? (
          <span title="No 'Experts Managed Service' tag on this property in PayProp" className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-red-700">
            No service tag in PayProp
          </span>
        ) : (
          <span className="text-[11.5px] text-muted">{s.tagsWhy}</span>
        )}
        {others.map((t) => (
          <span key={t} className="rounded-full border border-line/80 bg-white px-2.5 py-0.5 text-[11.5px] text-muted">
            {t}
          </span>
        ))}
      </div>
      <p className="figures text-[12px] text-muted">
        {fee ? (
          <>
            <span className="font-semibold text-ink">Fee {fee.monthly != null ? `${gbp(fee.monthly)} a month` : pct(fee.percent ?? 0)}</span>
            {fee.monthly != null && fee.percent != null && ` · ${pct(fee.percent)} of the rent`}
            {fee.rent ? ` (${gbp(fee.rent)})` : ""}
          </>
        ) : (
          s.feeWhy
        )}
      </p>
    </div>
  );
}
