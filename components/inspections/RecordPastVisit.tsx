"use client";

import { useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { PressButton } from "@/components/Bits";
import type { DueVisit, Inspection } from "@/lib/inspections";

/**
 * A VISIT ALREADY MADE, RECORDED AFTERWARDS (Kayleigh Wright, call of
 * 19 Oct 2026).
 *
 * She did her inspections in Inventory Base. To put one on the home here she
 * would have had to book it - which asks the tenant for access, books a diary
 * slot and offers the confirmation email - and then answer the whole visit
 * sheet again, room by room with photos, when the report already exists.
 *
 * So: what it was, the day, who went, the report itself, and that is it. It
 * is raised already visited and closed (POST /api/inspections with doneOn),
 * the report goes on the visit as its file, and a check-in's report can go
 * in the home's Documents as its inventory too. Nobody is emailed and nothing
 * goes in a diary: none of the moves used here sends anything
 * (lib/inspection-emails sends only on ask_access, confirm and report_sent).
 *
 * A visit of the same kind already raised here and not yet booked is the one
 * finished, rather than a second record beside it, so the due list and the
 * cadence move on from the day it was really done.
 */

const KIND_CHOICES = [
  { id: "interim", label: "Property visit" },
  { id: "check_in", label: "Check-in" },
  { id: "check_out", label: "Check-out" },
  { id: "hmo", label: "HMO check" },
] as const;
type PastKind = (typeof KIND_CHOICES)[number]["id"];

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic";
const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export type PastVisitHome = {
  propertyName: string;
  locality: string;
  propertyId: string;
  listingId: string;
  /** The home's one-line address, for its Documents. */
  address: string;
  /** The REX property id, where there is one, for its Documents. */
  rexPropertyId: string | null;
  landlord: string;
  landlordEmail: string;
  tenant: string;
  tenantEmail: string;
  tenantPhone: string;
  tenancyStart: string | null;
};

export default function RecordPastVisit({
  home,
  open,
  due,
  me,
  onDone,
  onCancel,
}: {
  home: PastVisitHome;
  /** The visits already raised on this home. */
  open: Inspection[];
  /** What the board says is owed here. */
  due: DueVisit[];
  me: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<PastKind>("interim");
  const [day, setDay] = useState("");
  const [who, setWho] = useState(me);
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [asInventory, setAsInventory] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);

  const field = "mt-1 w-full rounded-xl border border-line/80 bg-white px-3 py-2 text-[13px] outline-none focus:border-ink";
  const ready = Boolean(day) && day <= today() && !busy;

  async function save() {
    if (!ready) return;
    setErr(null);
    try {
      /* The report first: a file that will not upload stops it before any
         visit is written. */
      const stored: { key: string; name: string; type: string }[] = [];
      for (const [n, f] of files.entries()) {
        setBusy(files.length > 1 ? `Uploading ${n + 1} of ${files.length}…` : "Uploading the report…");
        const fd = new FormData();
        fd.set("scope", "document");
        fd.set("ref", `visit-${home.listingId}`);
        fd.set("file", f);
        const j = await fetch("/api/r2/upload", { method: "POST", body: fd }).then((r) => r.json()).catch(() => null);
        if (!j?.ok) throw new Error(j?.error ?? `${f.name} did not upload. Nothing has been recorded.`);
        stored.push({ key: j.key, name: f.name, type: j.type || f.type });
      }

      setBusy("Recording the visit…");
      const patch = async (id: string, body: unknown) => {
        const j = await fetch(`/api/inspections/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }).then((r) => r.json()).catch(() => null);
        if (!j?.ok) throw new Error(j?.error ?? "That didn't save.");
      };
      const at = new Date(`${day}T12:00:00`).toISOString();
      const inHand = open.find((i) => i.kind === kind && ["due", "arranging", "no_access"].includes(i.status) && !i.visitedAt);
      let id: string;
      if (inHand) {
        id = inHand.id;
        await patch(id, { action: "visited", at, inspector: who.trim() || undefined });
        await patch(id, { action: "note", text: "Recorded as already done: the visit was made and written up before it was booked here." });
      } else {
        /* The REX PM task it answers, so the copied-across task leaves Due. */
        const owed = due.find((d) => d.kind === kind || (kind === "interim" && d.kind === "hmo") || (kind === "hmo" && d.kind === "interim"));
        const j = await fetch("/api/inspections", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind,
            propertyName: home.propertyName,
            locality: home.locality,
            propertyId: home.propertyId,
            listingId: home.listingId,
            landlord: home.landlord,
            landlordEmail: home.landlordEmail,
            tenant: owed?.tenant || home.tenant,
            tenantEmail: owed?.tenantEmail || home.tenantEmail,
            tenantPhone: owed?.tenantPhone || home.tenantPhone,
            tenancyStart: home.tenancyStart,
            dueAt: owed?.dueAt ?? at,
            rexpmTaskId: owed?.taskId ?? null,
            osPropertyId: owed?.osPropertyId ?? null,
            doneOn: day,
            doneBy: who.trim(),
          }),
        }).then((r) => r.json()).catch(() => null);
        if (!j?.ok) throw new Error(j?.error ?? "The visit could not be recorded.");
        id = j.inspection.id;
      }
      for (const f of stored) await patch(id, { action: "file", file: f });
      if (note.trim()) await patch(id, { action: "note", text: note.trim() });
      if (inHand) await patch(id, { action: "close" });

      /* A check-in's report is the inventory: on the home's Documents too. */
      if (kind === "check_in" && asInventory && files.length) {
        setBusy("Putting the inventory in Documents…");
        for (const f of files) {
          const fd = new FormData();
          fd.append("file", f);
          fd.append("type", "inventory");
          fd.append("name", "");
          fd.append("address", home.address);
          fd.append("property", home.rexPropertyId ?? "");
          fd.append("from", "property");
          fd.append("fromId", home.listingId);
          const j = await fetch("/api/documents", { method: "POST", body: fd }).then((r) => r.json()).catch(() => null);
          if (!j?.ok) throw new Error(`The visit is recorded, but the inventory didn't reach Documents: ${j?.error ?? "try adding it there"}.`);
        }
      }
      setBusy(null);
      onDone();
    } catch (e) {
      setBusy(null);
      setErr(e instanceof Error ? e.message : "That didn't save.");
    }
  }

  const chip = (on: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-[12px] transition-colors ${on ? "border-accent-dark bg-accent-soft/70 font-semibold" : "border-line/80 hover:border-ink/40"}`;

  return (
    <div className="space-y-4">
      <p className="text-[12px] leading-relaxed text-muted">
        For a visit already made, such as one done in Inventory Base. It goes on the home as done, with its report.{" "}
        <b className="font-semibold text-ink">Nobody is emailed and nothing goes in a diary.</b>
      </p>

      <div>
        <p className="text-[12px] font-semibold">What was it?</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {KIND_CHOICES.map((k) => (
            <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)} className={chip(kind === k.id)}>
              {k.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-[12px] font-semibold">
          The day it was done
          <input type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value)} className={field} />
        </label>
        <label className="block text-[12px] font-semibold">
          Who went
          <input value={who} onChange={(e) => setWho(e.target.value)} maxLength={80} placeholder="Their name" className={field} />
        </label>
      </div>
      {day && day > today() && <p className="text-[11.5px] text-accent-dark">That day hasn&apos;t happened yet. To arrange a visit, use Book a property visit.</p>}

      <div>
        <p className="text-[12px] font-semibold">The report</p>
        <input
          ref={picker}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => { const picked = Array.from(e.target.files ?? []); setFiles((was) => [...was, ...picked]); e.target.value = ""; }}
        />
        {files.length > 0 && (
          <ul className="mt-1.5 divide-y divide-line/50 rounded-xl border border-line/60 bg-white">
            {files.map((f, n) => (
              <li key={`${f.name}-${n}`} className="flex items-center gap-2.5 px-3 py-2 text-[12.5px]">
                <DoodleIcon name="doc" size={14} className="shrink-0 text-accent-dark" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <button type="button" onClick={() => setFiles((was) => was.filter((_, i) => i !== n))} className="text-[11.5px] text-muted hover:text-ink">Remove</button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={() => picker.current?.click()} className="mt-1.5 inline-flex items-center gap-2 rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] font-semibold transition-colors hover:border-ink/40">
          <DoodleIcon name="upload" size={13} />
          {files.length ? "Add another file" : "Choose the report"}
        </button>
        <p className="mt-1 text-[11px] text-muted">A PDF or a photo. Optional, and it can be added later on Inspections.</p>
        {kind === "check_in" && files.length > 0 && (
          <label className="mt-2 flex items-start gap-2 text-[12px]">
            <input type="checkbox" checked={asInventory} onChange={(e) => setAsInventory(e.target.checked)} className="mt-0.5" />
            <span>Also keep it in the home&apos;s Documents as the inventory</span>
          </label>
        )}
      </div>

      <label className="block text-[12px] font-semibold">
        Anything to note <span className="font-normal text-muted">(optional)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={600} placeholder="e.g. All fine, tenant keeping it well" className={field} />
      </label>

      {err && <p className="text-[12px] text-accent-dark" aria-live="polite">{err}</p>}

      <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
        <button type="button" onClick={onCancel} disabled={Boolean(busy)} className="px-2 py-1.5 text-[12px] text-muted hover:text-ink">Cancel</button>
        <PressButton onClick={() => void save()} disabled={!ready} className="flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-page disabled:opacity-40">
          {busy && <span aria-hidden className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-page/40 border-t-page" />}
          {busy ?? "Record it as done"}
        </PressButton>
      </div>
    </div>
  );
}
