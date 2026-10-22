"use client";

import { useMemo, useState } from "react";
import { PressButton } from "@/components/Bits";
import type { Inspection } from "@/lib/inspections";
import FieldSelect from "@/components/FieldSelect";
import { EmailPreview } from "@/components/inspections/SentEmails";

/**
 * BOOK THE VISIT (James, 3 Oct 2026: "we need to be able to book inspections,
 * confirm it with the tenant, and then record it afterwards").
 *
 * One form: the day and time, how long, who is going, how we get in, and
 * whether the tenant gets the confirmation now. The confirmation is their
 * written notice, so the form will not book inside the notice the tenancy
 * needs unless somebody says the tenant agreed to less. Booking puts it in the
 * inspector's diary and Outlook (lib/inspection-diary); moving it later moves
 * that same entry.
 */

export interface Person {
  id: string;
  name: string;
}

type Move = (body: unknown, label?: string) => Promise<boolean>;

const LENGTH: Record<string, number> = { check_in: 45, interim: 30, hmo: 45, void: 20, check_out: 45, follow_up: 20 };
const TIMES = Array.from({ length: (19 - 8) * 4 + 1 }, (_, n) => {
  const m = 8 * 60 + n * 15;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});
const ACCESS = [
  { id: "tenant_present", label: "The tenant lets us in" },
  { id: "keys", label: "We use our keys" },
  { id: "landlord", label: "The landlord is there" },
] as const;

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The first weekday after the notice period. */
function firstDay(noticeHours: number): string {
  const d = new Date(Date.now() + noticeHours * 3600_000);
  d.setDate(d.getDate() + (d.getHours() >= 16 ? 1 : 0));
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return ymd(d);
}

export default function BookForm({
  inspection,
  team,
  me,
  busy,
  onMove,
  onDone,
  submitLabel,
  styled = false,
}: {
  inspection: Inspection;
  team: Person[];
  me: Person | null;
  busy: boolean;
  onMove: Move;
  onDone?: () => void;
  submitLabel?: string;
  /** Our own drop-downs and a roomier layout (the property page's pop-up). */
  styled?: boolean;
}) {
  const was = inspection.bookedAt ? new Date(inspection.bookedAt) : null;
  const [date, setDate] = useState(was ? ymd(was) : firstDay(inspection.noticeHours || 24));
  const [time, setTime] = useState(was ? `${String(was.getHours()).padStart(2, "0")}:${String(Math.round(was.getMinutes() / 15) * 15 % 60).padStart(2, "0")}` : "10:00");
  const [mins, setMins] = useState(inspection.visitMins && inspection.bookedAt ? inspection.visitMins : LENGTH[inspection.kind] ?? 30);
  /* Empty until somebody picks: the team can arrive after the form opens, so
     the default is worked out on every draw, not frozen at the first. */
  const [picked, setPicked] = useState("");
  const [access, setAccess] = useState<string>(inspection.accessMethod || "tenant_present");
  const hasEmail = Boolean(inspection.tenantEmail);
  const [notify, setNotify] = useState(hasEmail);
  /* The landlord too, when the agent asks (Rhiannon, 21 Oct 2026, ticket
     cf2d722c). Off until ticked: nothing goes to a customer unasked. */
  const landlordEmail = (inspection.landlordEmail ?? "").trim();
  const [notifyLandlord, setNotifyLandlord] = useState(false);
  /* Which email is open to read before it goes. */
  const [seeing, setSeeing] = useState<null | "tenant-booked" | "landlord-booked">(null);
  const [shortNotice, setShortNotice] = useState(false);

  const at = useMemo(() => new Date(`${date}T${time}:00`), [date, time]);
  const hoursAway = (at.getTime() - Date.now()) / 3600_000;
  const inPast = hoursAway < 0;
  const tooSoon = !inPast && hoursAway < (inspection.noticeHours || 24);
  const first = (inspection.tenant || "the tenant").split(/\s+/)[0];
  const landlordWho = /\b(ltd|limited|llp|plc|properties|property|homes|estates?|lettings|investments|holdings|group|trust)\b/i.test(inspection.landlord ?? "")
    ? inspection.landlord.trim()
    : (inspection.landlord || "the landlord").split(/\s+/)[0];
  const people = team.length ? team : me ? [me] : [];
  const inspectorId = [picked, inspection.inspectorId ?? "", me?.id ?? "", people[0]?.id ?? ""].find((x) => x && people.some((p) => p.id === x)) ?? "";
  const who = people.find((p) => p.id === inspectorId);
  const previewUrl = (which: "tenant-booked" | "landlord-booked") =>
    `/api/inspections/${encodeURIComponent(inspection.id)}?preview=${which}&at=${encodeURIComponent(Number.isNaN(at.getTime()) ? "" : at.toISOString())}&inspector=${encodeURIComponent(who?.name ?? me?.name ?? "")}`;
  const seeLink = (which: "tenant-booked" | "landlord-booked") => (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); setSeeing(seeing === which ? null : which); }}
      className="ml-1 text-[11.5px] font-semibold text-accent-dark underline"
    >
      {seeing === which ? "Hide the email" : "See the email"}
    </button>
  );
  const sendsTo = [notify && hasEmail ? first : null, notifyLandlord && landlordEmail ? landlordWho : null].filter(Boolean) as string[];

  const field = styled ? "w-full rounded-lg border border-line/80 bg-box px-3 py-2.5 text-[13px] outline-none focus:border-ink" : "w-full rounded-xl border border-line/80 bg-page px-3 py-2 text-[13px]";
  const lab = "mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-muted";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        <label className="block">
          <span className={lab}>Day</span>
          <input type="date" value={date} min={ymd(new Date())} onChange={(e) => setDate(e.target.value)} className={field} />
        </label>
        <label className="block">
          <span className={lab}>Time</span>
          {styled ? (
            <FieldSelect value={time} onChange={setTime} options={TIMES.map((t) => ({ value: t, label: t }))} />
          ) : (
          <select value={time} onChange={(e) => setTime(e.target.value)} className={field}>
            {TIMES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          )}
        </label>
        <label className="block">
          <span className={lab}>How long</span>
          {styled ? (
            <FieldSelect value={String(mins)} onChange={(v) => setMins(Number(v))} options={[15, 20, 30, 45, 60, 90].map((m) => ({ value: String(m), label: `${m} minutes` }))} />
          ) : (
          <select value={mins} onChange={(e) => setMins(Number(e.target.value))} className={field}>
            {[15, 20, 30, 45, 60, 90].map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </select>
          )}
        </label>
        <label className="block">
          <span className={lab}>Who is going</span>
          {styled ? (
            <FieldSelect value={inspectorId} onChange={setPicked} options={people.map((p) => ({ value: p.id, label: `${p.name}${me && p.id === me.id ? " (you)" : ""}` }))} />
          ) : (
          <select value={inspectorId} onChange={(e) => setPicked(e.target.value)} className={field}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {me && p.id === me.id ? " (you)" : ""}
              </option>
            ))}
          </select>
          )}
        </label>
      </div>

      <div>
        <span className={lab}>How we get in</span>
        <div className="flex flex-wrap gap-1.5">
          {ACCESS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAccess(a.id)}
              className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold ${access === a.id ? "bg-ink text-page" : "border border-line/80 text-muted"}`}
            >
              {a.label}
            </button>
          ))}
        </div>
        {access === "keys" && <p className="mt-1.5 text-[11.5px] text-muted">Keys are not consent: the tenant still gets the notice in writing.</p>}
      </div>

      <label className={`flex items-start gap-2.5 rounded-xl border border-line/80 p-3 text-[12.5px] ${hasEmail ? "cursor-pointer" : "opacity-60"}`}>
        <input type="checkbox" checked={notify && hasEmail} disabled={!hasEmail} onChange={(e) => setNotify(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent-dark)]" />
        <span>
          {hasEmail ? (
            <>
              Email {first} the confirmation now, with a button to say the time works or ask for another. <span className="text-muted">It&apos;s their written notice. Goes to {inspection.tenantEmail}.</span>
              {seeLink("tenant-booked")}
            </>
          ) : (
            <>No email address for {first}. Ring them, then press Confirm it once they know.</>
          )}
        </span>
      </label>
      {seeing === "tenant-booked" && hasEmail && <EmailPreview url={previewUrl("tenant-booked")} />}

      <label className={`flex items-start gap-2.5 rounded-xl border border-line/80 p-3 text-[12.5px] ${landlordEmail ? "cursor-pointer" : "opacity-60"}`}>
        <input type="checkbox" checked={notifyLandlord && Boolean(landlordEmail)} disabled={!landlordEmail} onChange={(e) => setNotifyLandlord(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent-dark)]" />
        <span>
          {landlordEmail ? (
            <>
              Email {landlordWho} the date as well. <span className="text-muted">Goes to {landlordEmail}.</span>
              {seeLink("landlord-booked")}
            </>
          ) : (
            <>No email address for the landlord, so they can&apos;t be emailed from here.</>
          )}
        </span>
      </label>
      {seeing === "landlord-booked" && landlordEmail && <EmailPreview url={previewUrl("landlord-booked")} />}

      <p className="text-[11.5px] text-muted">
        {sendsTo.length ? `Booking it emails ${sendsTo.join(" and ")}. ` : "Booking it emails nobody. "}
        What went, and what it said, stays on the visit under Emails.
      </p>

      {inPast && <p className="rounded-xl bg-accent-soft/50 px-3 py-2 text-[12px] text-accent-dark">That time has already gone.</p>}
      {tooSoon && (
        <label className="flex items-start gap-2.5 rounded-xl bg-accent-soft/50 px-3 py-2 text-[12px] text-accent-dark">
          <input type="checkbox" checked={shortNotice} onChange={(e) => setShortNotice(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent-dark)]" />
          <span>
            That&apos;s less than the {inspection.noticeHours || 24} hours&apos; notice the tenancy needs. Tick only if {first} has agreed to a shorter notice.
          </span>
        </label>
      )}

      <PressButton
        disabled={busy || inPast || (tooSoon && !shortNotice) || !inspectorId}
        onClick={async () => {
          const ok = await onMove(
            { action: "schedule", at: at.toISOString(), mins, inspectorId, inspector: who?.name ?? me?.name ?? "", accessMethod: access, notify: notify && hasEmail, notifyLandlord: notifyLandlord && Boolean(landlordEmail) },
            "Booking"
          );
          if (ok) onDone?.();
        }}
        className="rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page disabled:opacity-40"
      >
        {busy ? "Booking…" : submitLabel ?? (sendsTo.length ? `Book it and email ${sendsTo.join(" and ")}` : "Book it")}
      </PressButton>
    </div>
  );
}
