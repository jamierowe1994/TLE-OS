"use client";

import { useEffect, useState } from "react";

/**
 * The tenant's landlord-facing profile — the half of the portal that works
 * FOR them. Landlords choosing between two offers pick the finished
 * profile; this page makes finishing it feel like five minutes, because
 * it is.
 */

const RED = "#e31f36";
const STORE = "tle-tenant-profile";

type TenantProfile = {
  photo?: string;
  household: string;
  employment: string;
  income: string;
  pets: string;
  smoker: string;
  about: string;
};

const EMPTY: TenantProfile = {
  household: "", employment: "", income: "", pets: "", smoker: "", about: "",
};

const FIELDS: {
  key: keyof Omit<TenantProfile, "photo" | "about">;
  label: string;
  options: string[];
}[] = [
  { key: "household", label: "Who's moving?", options: ["Just me", "Me + partner", "Family with children", "Sharers"] },
  { key: "employment", label: "Work situation", options: ["Employed full-time", "Employed part-time", "Self-employed", "Student", "Retired"] },
  { key: "income", label: "Household income", options: ["Under £20k", "£20–30k", "£30–45k", "£45–60k", "£60k+"] },
  { key: "pets", label: "Pets", options: ["No pets", "Cat(s)", "Dog(s)", "Other"] },
  { key: "smoker", label: "Smoking", options: ["Non-smoker", "Outdoors only", "Smoker"] },
];

export default function TenantProfilePage() {
  const [p, setP] = useState<TenantProfile>(EMPTY);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) setP({ ...EMPTY, ...JSON.parse(raw) });
    } catch { /* fresh profile */ }
  }, []);

  function save(next: TenantProfile) {
    setP(next);
    try { localStorage.setItem(STORE, JSON.stringify(next)); } catch { /* session-only */ }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  }

  const parts = [p.photo, p.household, p.employment, p.income, p.pets, p.smoker, p.about];
  const done = parts.filter(Boolean).length;
  const pct = Math.round((done / parts.length) * 100);

  return (
    <div className="mx-auto max-w-2xl py-10">
      <h1 className="text-[24px] font-bold leading-tight">My profile</h1>
      <p className="mt-1 text-[13.5px] leading-relaxed text-black/60">
        This is what a landlord sees beside your offer. Finished profiles get chosen —
        it&apos;s the single best thing you can do for your application.
      </p>

      {/* The meter. */}
      <div className="mt-5">
        <div className="flex items-center justify-between text-[11.5px] font-bold">
          <span className="text-black/50">{pct}% complete</span>
          {saved && <span style={{ color: RED }}>Saved ✓</span>}
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/10">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: RED }} />
        </div>
      </div>

      {/* Photo. */}
      <div className="mt-8 flex items-center gap-5">
        <label className="group relative block h-24 w-24 shrink-0 cursor-pointer overflow-hidden rounded-full border border-black/10 bg-[#fafafa]">
          {p.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photo} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[26px] font-bold text-black/20">
              ST
            </span>
          )}
          <span className="absolute inset-x-0 bottom-0 bg-black/60 py-1 text-center text-[9px] font-bold uppercase tracking-wide text-white opacity-0 transition-opacity group-hover:opacity-100">
            {p.photo ? "Change" : "Add photo"}
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const img = new Image();
              img.onload = () => {
                const c = document.createElement("canvas");
                c.width = c.height = 256;
                const ctx = c.getContext("2d")!;
                const side = Math.min(img.width, img.height);
                ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256);
                save({ ...p, photo: c.toDataURL("image/jpeg", 0.85) });
                URL.revokeObjectURL(img.src);
              };
              img.src = URL.createObjectURL(file);
            }}
          />
        </label>
        <div>
          <p className="text-[15px] font-bold">Sophie Turner</p>
          <p className="text-[12px] text-black/50">A friendly face makes a real difference to landlords.</p>
        </div>
      </div>

      {/* The situation, as choices — nobody writes essays on their phone. */}
      <div className="mt-8 space-y-6">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-black/50">{f.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {f.options.map((o) => {
                const on = p[f.key] === o;
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => save({ ...p, [f.key]: on ? "" : o })}
                    className={`rounded-lg border px-3.5 py-2 text-[12.5px] font-semibold transition-colors ${
                      on ? "text-white" : "border-black/15 hover:border-black/50"
                    }`}
                    style={on ? { backgroundColor: RED, borderColor: RED } : undefined}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <label className="block">
          <span className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-black/50">
            A few words about you
          </span>
          <textarea
            value={p.about}
            onChange={(e) => save({ ...p, about: e.target.value })}
            rows={4}
            placeholder="Where you work, why you're moving, what kind of tenant you are — the things you'd tell a landlord over a cup of tea."
            className="w-full resize-none rounded-lg border border-black/15 px-3.5 py-3 text-[13px] leading-relaxed outline-none transition-colors focus:border-black/50"
          />
        </label>
      </div>

      <p className="mt-6 text-[11px] leading-relaxed text-black/40">
        Only shown to landlords of homes you actually offer on — never published, never
        shared anywhere else. Delete any of it whenever you like.
      </p>
    </div>
  );
}
