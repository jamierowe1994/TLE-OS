"use client";

import { useEffect, useState } from "react";

/** The landlord's own details — light, honest, and no payment fields:
 *  bank changes happen by phone with verification, never a web form. */

const STORE = "tle-landlord-profile";

type P = { photo?: string; phone: string; contactPref: string; approvalLimit: string };
const EMPTY: P = { phone: "07922 415 780", contactPref: "", approvalLimit: "" };

export default function LandlordProfile() {
  const [p, setP] = useState<P>(EMPTY);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) setP({ ...EMPTY, ...JSON.parse(raw) });
    } catch { /* fresh */ }
  }, []);

  function save(next: P) {
    setP(next);
    try { localStorage.setItem(STORE, JSON.stringify(next)); } catch { /* session */ }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="mx-auto max-w-2xl py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-[30px] leading-tight">My details</h1>
        {saved && <span className="text-[12px] font-semibold" style={{ color: "var(--accent-dark)" }}>Saved ✓</span>}
      </div>

      <div className="mt-6 flex items-center gap-5">
        <label className="group relative block h-20 w-20 shrink-0 cursor-pointer overflow-hidden rounded-full border border-line/70 bg-box">
          {p.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photo} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[22px] font-semibold text-muted">RC</span>
          )}
          <span className="absolute inset-x-0 bottom-0 bg-ink/70 py-1 text-center text-[8.5px] font-semibold uppercase tracking-wide text-white opacity-0 transition-opacity group-hover:opacity-100">
            {p.photo ? "Change" : "Add"}
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const im = new Image();
              im.onload = () => {
                const c = document.createElement("canvas");
                c.width = c.height = 256;
                const ctx = c.getContext("2d")!;
                const side = Math.min(im.width, im.height);
                ctx.drawImage(im, (im.width - side) / 2, (im.height - side) / 2, side, side, 0, 0, 256, 256);
                save({ ...p, photo: c.toDataURL("image/jpeg", 0.85) });
                URL.revokeObjectURL(im.src);
              };
              im.src = URL.createObjectURL(file);
            }}
          />
        </label>
        <div>
          <p className="text-[15px] font-semibold">Raj Chauhan</p>
          <p className="text-[12px] text-muted">raj.chauhan@outlook.com · your sign-in, fixed</p>
        </div>
      </div>

      <div className="mt-8 space-y-6">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">Phone</span>
          <input
            value={p.phone}
            onChange={(e) => save({ ...p, phone: e.target.value })}
            className="w-full rounded-xl border border-line/80 px-3.5 py-3 text-[13.5px] outline-none transition-colors focus:border-accent"
          />
        </label>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
            How should we contact you?
          </p>
          <div className="flex flex-wrap gap-1.5">
            {["Ring me", "WhatsApp", "Email", "Only urgent things"].map((o) => {
              const on = p.contactPref === o;
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => save({ ...p, contactPref: on ? "" : o })}
                  className={`rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold transition-colors ${
                    on ? "text-white" : "border-line/80 hover:border-ink/40/50"
                  }`}
                  style={on ? { backgroundColor: "var(--accent-dark)", borderColor: "var(--accent-dark)" } : undefined}
                >
                  {o}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Approve repairs without asking, up to…
          </p>
          <div className="flex flex-wrap gap-1.5">
            {["£100", "£150", "£250", "£500", "Always ask me"].map((o) => {
              const on = p.approvalLimit === o;
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => save({ ...p, approvalLimit: on ? "" : o })}
                  className={`rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold transition-colors ${
                    on ? "text-white" : "border-line/80 hover:border-ink/40/50"
                  }`}
                  style={on ? { backgroundColor: "var(--accent-dark)", borderColor: "var(--accent-dark)" } : undefined}
                >
                  {o}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[10.5px] text-muted">
            Small fixes move faster when we don&apos;t have to catch you on the phone.
          </p>
        </div>

        <div className="rounded-2xl border border-line/70 bg-box p-4">
          <p className="text-[12.5px] font-semibold">Payment details</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            Your rent is paid to the account ending <span className="font-semibold">··624</span>.
            For your protection, bank changes are never done on a web form — ring us on
            0115 XXX XXXX and we&apos;ll verify it&apos;s you.
          </p>
        </div>
      </div>
    </div>
  );
}
