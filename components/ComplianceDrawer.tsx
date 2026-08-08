"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { Pill } from "@/components/Wire";
import { PressButton } from "@/components/Bits";
import type { OrderTarget } from "@/components/WorksOrder";
import {
  BIG_THREE, CERT_META, HMO_SET, QUIET_SET, requiredCerts, statusOf,
  type CertKey, type CompProperty,
} from "@/lib/compliance";

/**
 * One property's full compliance file: every duty it carries, where each
 * stands, whether the actual certificate is on record, and the button that
 * fixes whatever's wrong. The quiet duties (alarms, legionella) appear here
 * even though the page's table doesn't carry them — the drawer is the whole
 * truth, the table is the headline.
 */

function certLine(expires: number | null): string {
  if (expires == null) return "No record on file";
  if (expires < 0) return `Expired ${Math.abs(expires)} days ago`;
  if (expires <= 60) return `Expires in ${expires} days`;
  const months = Math.round(expires / 30.4);
  return `Expires in ~${months} month${months === 1 ? "" : "s"}`;
}

export default function ComplianceDrawer({
  property,
  onClose,
  orders,
  onOrder,
}: {
  property: CompProperty | null;
  onClose: () => void;
  orders: Record<string, { contractor: string; when: string }>;
  onOrder: (t: OrderTarget) => void;
}) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!property) { setShown(false); return; }
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [property]);

  useEffect(() => {
    if (!property) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [property, onClose]);

  if (!property) return null;
  const p = property;
  const required = requiredCerts(p);

  const groups: { title: string; keys: CertKey[] }[] = [
    { title: "The big three — safety law", keys: BIG_THREE.filter((k) => required.includes(k)) },
    ...(p.hmo ? [{ title: "Because it's an HMO", keys: HMO_SET }] : []),
    { title: "The quiet duties", keys: QUIET_SET },
  ];

  return (
    <div className="fixed inset-0 z-[130]">
      <button
        aria-label="Close"
        onClick={onClose}
        className={`absolute inset-0 cursor-default bg-ink/35 transition-opacity duration-300 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      />
      <aside
        className={`absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[420ms] ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line/70 px-6 py-5">
          <div className="min-w-0">
            <h2 className="text-[20px] leading-tight">{p.name}</h2>
            <p className="mt-1 text-[12px] text-muted">
              {p.locality} · landlord {p.landlord}
              {p.tenant ? ` · ${p.tenant} in situ` : " · vacant"}
              {p.hmo && <span className="ml-1.5 font-semibold text-accent-dark">HMO</span>}
              {!p.hasGas && " · no gas supply"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {groups.map((g) => (
            <div key={g.title} className="mb-6 last:mb-0">
              <p className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                {g.title}
              </p>
              <ul className="space-y-2.5">
                {g.keys.map((key) => {
                  const cert = p.certs[key];
                  const s = statusOf(cert);
                  const bad = s === "expired" || s === "urgent" || s === "missing";
                  const order = orders[`${p.id}:${key}`];
                  return (
                    <li
                      key={key}
                      className={`rounded-2xl border p-4 ${
                        s === "expired"
                          ? "border-accent-dark bg-accent-soft/30"
                          : bad
                            ? "border-accent-dark/40"
                            : "border-line/70"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2.5">
                          <DoodleIcon name={CERT_META[key].icon} size={16} className="text-accent-dark" />
                          <span className="text-[13px] font-semibold">{CERT_META[key].label}</span>
                        </span>
                        <Pill tone={s === "ok" || s === "watch" ? "good" : "accent"}>
                          {certLine(cert?.expires ?? null)}
                        </Pill>
                      </div>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                        {CERT_META[key].rule}
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        {/* A date without a document is half a record — the
                            real book's biggest quiet problem. */}
                        {cert?.expires != null &&
                          (cert.attached ? (
                            <span className="flex items-center gap-1.5 text-[11px] text-muted">
                              <DoodleIcon name="doc" size={12} /> Certificate on file
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-accent-dark">
                              <DoodleIcon name="doc" size={12} /> Date recorded, certificate NOT attached
                            </span>
                          ))}
                        {order ? (
                          <Pill tone="good">
                            Order out — {order.contractor.split(" (")[0]}, {order.when}
                          </Pill>
                        ) : (
                          bad && (
                            <PressButton
                              onClick={() => onOrder({ property: p, cert: key })}
                              className="press-ring flex items-center gap-1.5 rounded-full bg-accent-dark px-3.5 py-1.5 text-[11px] font-semibold text-page"
                            >
                              <DoodleIcon name="setting" size={12} />
                              Book the {CERT_META[key].trade}
                            </PressButton>
                          )
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <p className="border-t border-line/60 pt-3 text-[10px] leading-relaxed text-muted">
            Wired up, this reads REX&apos;s compliance entries for this property — dates and
            the certificate files themselves — and every works order writes back as a note
            on the record.
          </p>
        </div>
      </aside>
    </div>
  );
}
