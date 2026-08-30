"use client";

import { SECTIONS, type PassportData } from "@/lib/passport-shape";

/**
 * The passport, drawn as they fill it in.
 *
 * James: "we'll build them out an actual fake passport in real time, just to
 * make it a bit more interesting. It's just a bit of a fun game."
 *
 * ── Why the game is worth the pixels ──────────────────────────────────────
 *
 * A referencing form is a chore with no visible progress: you answer intrusive
 * questions and nothing happens. The drop-off is not because the questions are
 * hard, it is because there is no reason to reach the end. So every field fills
 * in something you can see, and each finished section earns a stamp.
 *
 * ── It is obviously NOT a real passport ───────────────────────────────────
 *
 * Deliberately: it says LETTING EXPERTS across the top, the country is "The
 * Letting Experts", and the document number is derived from their own details
 * rather than looking like a Home Office number. A convincing replica of an
 * identity document is a thing somebody screenshots and misuses, and it would
 * be our artwork on it. The fun comes from the LAYOUT being familiar, not from
 * the thing being mistakable.
 */

const cap = (s: string) => s.trim().toUpperCase();
const pad = (s: string, n: number) => (s + "<".repeat(n)).slice(0, n);

/** The two machine-readable lines. Real passports use this shape, which is
 *  what makes it read as a passport at a glance; the content is ours. */
function mrz(d: PassportData): [string, string] {
  const parts = cap(d.legalName).split(/\s+/).filter(Boolean);
  const last = parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? "";
  const first = parts.slice(0, -1).join("<");
  const name = pad(`${last}<<${first}`.replace(/[^A-Z<]/g, ""), 39);
  const dob = d.dob ? d.dob.slice(2).replace(/-/g, "") : "<<<<<<";
  const nat = pad(cap(d.nationality).replace(/[^A-Z]/g, ""), 3);
  return [`PL<TLE${name}`, pad(`${docNumber(d)}<${nat}${dob}`, 44)];
}

/** Stable, derived from their name and date of birth, so it does not change
 *  every keystroke - a number that reshuffles as you type reads as broken. */
export function docNumber(d: PassportData): string {
  const seed = `${d.legalName}${d.dob}`.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!seed) return "TLE000000";
  let h = 7;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 1000000;
  return `TLE${String(h).padStart(6, "0")}`;
}

export default function PassportBook({ data }: { data: PassportData }) {
  const [l1, l2] = mrz(data);
  const initials =
    cap(data.legalName)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join("") || "?";

  return (
    <div className="mx-auto w-full max-w-[400px]">
      <div className="overflow-hidden rounded-[14px] bg-[#1d2b24] p-2.5 shadow-[0_24px_50px_-20px_rgba(0,0,0,0.55)]">
        {/* The inside page. Cream, not white: a passport page is paper. */}
        <div className="relative overflow-hidden rounded-[8px] bg-[#f3efe6] px-4 pb-3 pt-3.5">
          {/* The guilloche wash. Two soft radials, no library, no image. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.16]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 22% 28%, #1d2b24 0.5px, transparent 0.6px), radial-gradient(circle at 72% 66%, #8a6a3a 0.5px, transparent 0.6px)",
              backgroundSize: "13px 13px, 17px 17px",
            }}
          />

          <div className="relative">
            <div className="flex items-baseline justify-between">
              <p className="text-[7.5px] font-bold uppercase tracking-[0.18em] text-[#1d2b24]/70">
                The Letting Experts
              </p>
              <p className="text-[7.5px] font-bold uppercase tracking-[0.18em] text-[#1d2b24]/70">
                Tenant Passport
              </p>
            </div>

            <div className="mt-2.5 flex gap-3.5">
              {/* The portrait panel. Initials until there is a photo. */}
              <div className="flex h-[92px] w-[72px] shrink-0 items-center justify-center rounded-[3px] border border-[#1d2b24]/25 bg-[#e6dfd1]">
                <span className="text-[26px] font-semibold tracking-tight text-[#1d2b24]/45">
                  {initials}
                </span>
              </div>

              <dl className="min-w-0 flex-1 space-y-[5px]">
                <Row label="Surname / Given names" value={cap(data.legalName)} />
                <Row label="Known as" value={data.knownAs.trim() || "—"} />
                <div className="flex gap-3">
                  <Row label="Date of birth" value={data.dob || "—"} small />
                  <Row label="Nationality" value={cap(data.nationality) || "—"} small />
                </div>
                <Row label="Document no." value={docNumber(data)} />
              </dl>
            </div>

            {/* The stamps. One per finished section, and they only appear when
                that section is genuinely complete - a stamp you can earn by
                skipping is worth nothing and everyone works that out. */}
            <div className="mt-3 flex min-h-[46px] flex-wrap items-center gap-1.5 border-t border-dashed border-[#1d2b24]/25 pt-2.5">
              {SECTIONS.map((s) => {
                const done = s.done(data);
                return (
                  <span
                    key={s.key}
                    title={done ? `${s.title}: done` : `${s.title}: not yet`}
                    className={`rounded-[3px] border px-1.5 py-[3px] text-[7px] font-bold uppercase tracking-[0.1em] transition-all duration-500 ${
                      done
                        ? "-rotate-3 border-[#8c3b34] text-[#8c3b34] opacity-90"
                        : "border-[#1d2b24]/15 text-[#1d2b24]/20"
                    }`}
                  >
                    {s.stamp}
                  </span>
                );
              })}
            </div>

            <div className="mt-2.5 select-all break-all rounded-[3px] bg-[#e6dfd1]/70 px-2 py-1.5 font-mono text-[8.5px] leading-[1.5] tracking-[0.05em] text-[#1d2b24]/80">
              {l1}
              <br />
              {l2}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className={small ? "min-w-0 flex-1" : "min-w-0"}>
      <dt className="text-[6.5px] font-bold uppercase tracking-[0.14em] text-[#1d2b24]/50">
        {label}
      </dt>
      <dd className="truncate text-[11px] font-semibold leading-tight text-[#1d2b24]">
        {value || "—"}
      </dd>
    </div>
  );
}
