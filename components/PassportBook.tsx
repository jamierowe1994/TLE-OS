"use client";

import Image from "next/image";
import { SECTIONS, type PassportData } from "@/lib/passport-shape";

/**
 * The passport, drawn as they fill it in.
 *
 * James: "we'll build them out an actual fake passport in real time, just to
 * make it a bit more interesting. It's just a bit of a fun game."
 *
 * ── Why the game earns its pixels ─────────────────────────────────────────
 *
 * A referencing form is a chore with no visible progress: you answer intrusive
 * questions and nothing happens. People stop not because the questions are hard
 * but because there is no reason to reach the end. So every field fills in
 * something you can see, and each finished section earns a stamp.
 *
 * ── It is RED, and that is a decision not a style ─────────────────────────
 *
 * The first version was drawn in passport greens and creams, which was a
 * mistake: a convincing replica of an identity document is a thing somebody
 * screenshots and misuses, and it would be our artwork on it. In TLE red
 * (#e31f36) it reads instantly as ours and could not be mistaken for a UK
 * passport by anybody, while keeping the LAYOUT familiar - which is where the
 * fun actually comes from.
 *
 * ── No photograph, on purpose ─────────────────────────────────────────────
 *
 * A tenant-uploaded passport photo gives no statutory excuse under the Right to
 * Rent scheme - only a share code check, a certified IDSP, or an agent seeing
 * the original in person does. So asking for one would be collecting sensitive
 * identity data we are not allowed to rely on. The portrait panel carries one
 * of our illustrations instead, and the real photograph is the agent's job.
 */

const cap = (s: string) => s.trim().toUpperCase();
const pad = (s: string, n: number) => (s + "<".repeat(n)).slice(0, n);

/** The two machine-readable lines. Real passports use this shape, which is what
 *  makes it read as a passport at a glance; the content is entirely ours. */
function mrz(d: PassportData): [string, string] {
  const parts = cap(d.legalName).split(/\s+/).filter(Boolean);
  const last = parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? "";
  const first = parts.slice(0, -1).join("<");
  const name = pad(`${last}<<${first}`.replace(/[^A-Z<]/g, ""), 39);
  const dob = d.dob ? d.dob.slice(2).replace(/-/g, "") : "<<<<<<";
  const nat = pad(cap(d.nationality).replace(/[^A-Z]/g, ""), 3);
  return [`PT<TLE${name}`, pad(`${docNumber(d)}<${nat}${dob}`, 44)];
}

/** Derived from their name and date of birth, so it is stable. A number that
 *  reshuffles on every keystroke reads as broken rather than as generated. */
export function docNumber(d: PassportData): string {
  const seed = `${d.legalName}${d.dob}`.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!seed) return "TLE000000";
  let h = 7;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 1000000;
  return `TLE${String(h).padStart(6, "0")}`;
}

const RED = "#e31f36";
const DEEP = "#a4121f";

export default function PassportBook({ data }: { data: PassportData }) {
  const [l1, l2] = mrz(data);

  return (
    <div className="w-full">
      {/* The cover, in our red. Only a sliver shows, as a real book does. */}
      <div
        className="overflow-hidden rounded-[18px] p-3 shadow-[0_30px_60px_-24px_rgba(163,18,31,0.55)]"
        style={{ background: `linear-gradient(150deg, ${RED} 0%, ${DEEP} 100%)` }}
      >
        <div className="flex items-center justify-between px-1 pb-2.5">
          <p className="text-[8px] font-bold uppercase tracking-[0.24em] text-white/85">
            The Letting Experts
          </p>
          <p className="text-[8px] font-bold uppercase tracking-[0.24em] text-white/70">
            Tenant Passport
          </p>
        </div>

        {/* The data page. Warm off-white, because a passport page is paper. */}
        <div className="relative overflow-hidden rounded-[10px] bg-[#faf7f2] px-5 pb-4 pt-4">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.13]"
            style={{
              backgroundImage:
                `radial-gradient(circle at 22% 28%, ${DEEP} 0.6px, transparent 0.7px), radial-gradient(circle at 72% 66%, ${RED} 0.6px, transparent 0.7px)`,
              backgroundSize: "15px 15px, 21px 21px",
            }}
          />

          <div className="relative">
            <div className="flex gap-4">
              {/* The portrait panel. One of our illustrations, never a photo -
                  see the note at the top of this file for why. */}
              <div
                className="flex h-[120px] w-[94px] shrink-0 items-center justify-center overflow-hidden rounded-[4px] border bg-white/70"
                style={{ borderColor: `${DEEP}33` }}
              >
                <Image
                  src="/illustrations/people/checking-in.svg"
                  alt=""
                  width={94}
                  height={120}
                  className="h-[104px] w-auto opacity-80"
                />
              </div>

              <dl className="min-w-0 flex-1 space-y-2">
                <Row label="Surname / Given names" value={cap(data.legalName)} big />
                <div className="flex gap-4">
                  <Row label="Date of birth" value={data.dob || ""} />
                  <Row label="Nationality" value={cap(data.nationality)} />
                </div>
                <div className="flex gap-4">
                  <Row label="Known as" value={data.knownAs.trim()} />
                  <Row label="Document no." value={docNumber(data)} />
                </div>
              </dl>
            </div>

            {/* Stamps. One per finished section, and only when it is genuinely
                finished - a stamp you can earn by skipping is worth nothing,
                and everybody works that out within about a minute. */}
            <div
              className="mt-4 flex min-h-[52px] flex-wrap items-center gap-2 border-t border-dashed pt-3"
              style={{ borderColor: `${DEEP}30` }}
            >
              {SECTIONS.map((s) => {
                const done = s.done(data);
                return (
                  <span
                    key={s.key}
                    title={done ? `${s.title}: done` : `${s.title}: not yet`}
                    className={`rounded-[3px] border px-2 py-[4px] text-[7.5px] font-bold uppercase tracking-[0.1em] transition-all duration-500 ${
                      done ? "-rotate-3 opacity-95" : "opacity-25"
                    }`}
                    style={{
                      borderColor: done ? DEEP : `${DEEP}40`,
                      color: done ? DEEP : `${DEEP}80`,
                    }}
                  >
                    {s.stamp}
                  </span>
                );
              })}
            </div>

            <div
              className="mt-3 select-all break-all rounded-[3px] px-2.5 py-2 font-mono text-[9.5px] leading-[1.55] tracking-[0.06em]"
              style={{ background: `${DEEP}0f`, color: `${DEEP}cc` }}
            >
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

function Row({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="min-w-0 flex-1">
      <dt
        className="text-[7px] font-bold uppercase tracking-[0.15em]"
        style={{ color: `${DEEP}99` }}
      >
        {label}
      </dt>
      <dd
        className={`truncate font-semibold leading-tight ${big ? "text-[15px]" : "text-[12px]"}`}
        style={{ color: value ? "#2b2b2c" : "#2b2b2c40" }}
      >
        {value || "—"}
      </dd>
    </div>
  );
}
