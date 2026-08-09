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
  /** Certificates in the vault, keyed propertyId:cert. Loaded from R2 when
   *  the drawer opens and added to as files land — so what you filed last
   *  week is still on the screen this week, not just this session. */
  const [files, setFiles] = useState<Record<string, { name: string; url: string }[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  async function attach(certKey: string, file: File) {
    if (!property) return;
    const slot = `${property.id}:${certKey}`;
    setBusy(slot);
    setUploadErr(null);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("scope", "document");
      body.set("ref", `compliance-${property.id}-${certKey}`);
      const res = await fetch("/api/r2/upload", { method: "POST", body });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? "Upload failed");
      setFiles((cur) => ({
        ...cur,
        [slot]: [...(cur[slot] ?? []), { name: j.name, url: j.url }],
      }));
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!property) { setShown(false); return; }
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [property]);

  // Ask the vault what's already filed against this property. Without this
  // every attached certificate disappeared on refresh — still stored, but
  // invisible, which invites somebody to upload it all over again.
  useEffect(() => {
    if (!property) return;
    const pid = property.id;
    let gone = false;
    setFiles({});
    (async () => {
      const found: Record<string, { name: string; url: string }[]> = {};
      await Promise.all(
        requiredCerts(property).map(async (certKey) => {
          try {
            const res = await fetch(
              `/api/r2/list?scope=document&ref=${encodeURIComponent(`compliance-${pid}-${certKey}`)}`
            );
            const j = await res.json();
            if (!j.ok || !j.files?.length) return;
            found[`${pid}:${certKey}`] = j.files.map((f: { key: string; name: string }) => ({
              name: f.name,
              url: `/api/r2/file?key=${encodeURIComponent(f.key)}`,
            }));
          } catch {
            /* a vault that won't answer shows as nothing filed, not a crash */
          }
        })
      );
      if (!gone) setFiles(found);
    })();
    return () => { gone = true; };
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
        className={`absolute inset-y-0 right-0 flex overflow-hidden rounded-l-2xl w-full max-w-xl flex-col bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[420ms] ${
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
                        {/* The storage is REAL: the file lands in the R2
                            vault under this property and certificate, and
                            opens back out of a signed link. */}
                        {(files[`${p.id}:${key}`] ?? []).map((f) => (
                          <a
                            key={f.url}
                            href={f.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[10.5px] font-semibold text-accent-dark transition-opacity hover:opacity-80"
                          >
                            <DoodleIcon name="doc" size={11} />
                            {f.name.length > 26 ? `${f.name.slice(0, 24)}…` : f.name}
                          </a>
                        ))}
                        <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line/80 px-2.5 py-1 text-[10.5px] font-semibold text-muted transition-colors hover:border-ink hover:text-ink">
                          <DoodleIcon name="upload" size={11} />
                          {busy === `${p.id}:${key}` ? "Storing…" : "Attach certificate"}
                          <input
                            type="file"
                            accept="application/pdf,image/*"
                            className="hidden"
                            disabled={busy !== null}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void attach(key, f);
                              e.target.value = "";
                            }}
                          />
                        </label>
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

          {uploadErr && (
            <p className="mb-3 rounded-lg bg-accent-soft/60 px-3 py-2 text-[11px] font-semibold text-accent-dark">
              {uploadErr}
            </p>
          )}
          <p className="border-t border-line/60 pt-3 text-[10px] leading-relaxed text-muted">
            Attach certificate is LIVE — files store in the agency&apos;s own vault (R2)
            under this property and certificate, and open from time-limited signed links.
            Next: reading REX&apos;s dates and existing certificates in beside them.
          </p>
        </div>
      </aside>
    </div>
  );
}
