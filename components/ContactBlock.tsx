"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { CopyButton, InlineField } from "@/components/Bits";
import { WhatsAppButton } from "@/components/WhatsAppQr";
import LandlordHomeAddress from "@/components/LandlordHomeAddress";
import EmailPerson from "@/components/EmailPerson";

/**
 * ONE WAY TO SHOW A PERSON (James, 12 Oct 2026).
 *
 * "We've got this beautiful WhatsApp button here that works really well, and
 * then we've got a copy button under the email, but then we don't do the
 * same thing under market appraisal ... We need to make it really easy to
 * edit details. We need to make it consistent."
 *
 * Name, phone and email, the same on a lead, an appraisal, a listing, a home
 * on Portfolio and an application:
 *   - the phone: Call and WhatsApp, and a copy button
 *   - the email: Email, and a copy button
 *   - anything missing: "+ Add number" / "+ Add email", typed in place
 *   - anything there: click it to change it
 * A change saves through PATCH /api/people/contact, which keeps the OS and
 * REX in step, and says under the block what happened.
 *
 * `personRef` is "os:<contact id>" or "rex:<REX contact id>"; without one the
 * block is read only (somebody the OS can't name in REX).
 */

export type Person = { name: string; email: string | null; phone: string | null };

const pill = "flex shrink-0 items-center gap-1.5 rounded-full border border-line/70 px-2.5 py-1 text-[11.5px] font-semibold transition-colors hover:border-ink/40";

export default function ContactBlock({
  person,
  personRef,
  role,
  showName = true,
  onSaved,
  onWhatsAppSent,
  className = "",
  nameClassName = "text-[14px] font-semibold",
  call = role !== "landlord",
  home,
  about,
  saver,
}: {
  person: Person;
  personRef: string | null;
  /** "landlord", "tenant": for the empty states and the copy labels. */
  role?: string;
  /** The name is the card's own title on some screens. */
  showName?: boolean;
  onSaved?: (p: Person) => void;
  /** Write a WhatsApp on the file, where the file keeps a log. */
  onWhatsAppSent?: (message: string) => Promise<string | null | void>;
  className?: string;
  /** The name's own look, where the card makes it the title. */
  nameClassName?: string;
  /** The Call button. Off for a landlord (James, 13 Oct 2026: "that's asking
   *  for trouble, accidentally calling a landlord") - WhatsApp and copy stay. */
  call?: boolean;
  /** A landlord's own home address under the email (Rhiannon, 15 Oct 2026):
   *  pass the let's address for "Same as the let property", or {} without one. */
  home?: { propertyAddress?: string | null };
  /** The home an email from here is about, for {{address}}, where `home` isn't passed. */
  about?: string | null;
  /** Somebody with no REX or OS contact behind them (a person only a let
   *  holds, 20 Oct 2026): the screen saves them its own way. Makes the block
   *  editable without a personRef. */
  saver?: (field: "name" | "email" | "phone", value: string) => Promise<{ ok: boolean; error?: string; detail?: string }>;
}) {
  const [p, setP] = useState<Person>(person);
  const [note, setNote] = useState<{ tone: "ok" | "bad" | "busy"; text: string } | null>(null);
  useEffect(() => setP(person), [person.name, person.email, person.phone]); // eslint-disable-line react-hooks/exhaustive-deps
  const editable = Boolean(personRef || saver);

  async function save(field: "name" | "email" | "phone", value: string) {
    const v = value.trim();
    if ((p[field] ?? "") === v) return;
    if (field === "name" && !v) return;
    const before = p;
    setP((cur) => ({ ...cur, [field]: v || null }));
    setNote({ tone: "busy", text: "Saving…" });
    if (!personRef && saver) {
      const j = await saver(field, v).catch(() => ({ ok: false, error: "That didn't go through. Try again." }) as { ok: boolean; error?: string; detail?: string });
      if (!j.ok) {
        setP(before);
        setNote({ tone: "bad", text: j.error ?? "That didn't save." });
        return;
      }
      const next = { ...before, [field]: v || null };
      setP(next);
      onSaved?.(next);
      setNote({ tone: "ok", text: j.detail ?? "Saved." });
      window.setTimeout(() => setNote((n) => (n?.tone === "ok" ? null : n)), 6000);
      return;
    }
    try {
      const r = await fetch("/api/people/contact", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ref: personRef, [field]: v }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; person?: Person; sync?: { ok: boolean; detail: string } };
      if (!j.ok) {
        setP(before);
        setNote({ tone: "bad", text: j.error ?? "That didn't save." });
        return;
      }
      const next = { ...before, ...(j.person ?? {}), [field]: v || null };
      setP(next);
      onSaved?.(next);
      setNote({ tone: j.sync?.ok === false ? "bad" : "ok", text: j.sync?.detail ?? "Saved." });
      window.setTimeout(() => setNote((n) => (n?.tone === "ok" ? null : n)), 4000);
    } catch {
      setP(before);
      setNote({ tone: "bad", text: "That didn't go through. Try again." });
    }
  }

  const row = (icon: string, label: string, value: string | null, field: "email" | "phone", type: string, actions: React.ReactNode) => (
    <div className="group/row flex min-h-[42px] flex-wrap items-center gap-x-2.5 gap-y-1 py-2">
      <DoodleIcon name={icon} size={14} className="shrink-0 text-muted" />
      {/* At least a number's width, so a narrow card puts the buttons
          underneath rather than cutting the number short. */}
      <span className="min-w-[11.5rem] flex-1 overflow-hidden text-[13px]">
        {editable ? (
          <InlineField value={value ?? ""} type={type} placeholder={field === "phone" ? "+ Add number" : "+ Add email"} onChange={(v) => void save(field, v)} className="text-[13px]" />
        ) : value ? (
          <span className="block truncate">{value}</span>
        ) : (
          <span className="text-muted">{field === "phone" ? "No number on file" : "No email on file"}</span>
        )}
      </span>
      {value ? actions : null}
      {value ? <CopyButton value={value} label={label} /> : null}
    </div>
  );

  return (
    <div className={className}>
      {showName && (
        <p className={`leading-snug ${nameClassName}`}>
          {editable ? <InlineField value={p.name} placeholder={`Name the ${role ?? "person"}`} onChange={(v) => void save("name", v)} className={nameClassName} /> : p.name}
        </p>
      )}
      <div className="mt-1 divide-y divide-line/40">
        {row("call", `${role ?? ""} phone`.trim(), p.phone, "phone", "tel", (
          <>
            {call && (
              <a href={`tel:${(p.phone ?? "").replace(/\s+/g, "")}`} className={pill}>
                <DoodleIcon name="call" size={12} className="text-accent-dark" />
                Call
              </a>
            )}
            <WhatsAppButton phone={p.phone ?? ""} name={p.name} onSent={onWhatsAppSent} className={pill}>
              <DoodleIcon name="message-2" size={12} className="text-accent-dark" />
              WhatsApp
            </WhatsAppButton>
          </>
        ))}
        {row("mail", `${role ?? ""} email`.trim(), p.email, "email", "email", (
          /* The OS's own email window, not a mailto: that does nothing on a
             computer with no mail app set up (Sean McMahon, 16 Oct 2026). */
          <EmailPerson
            email={p.email ?? ""}
            name={p.name}
            role={role}
            address={home?.propertyAddress ?? about}
            className={pill}
            onSent={(subject) => setNote({ tone: "ok", text: `Sent to ${p.email}${subject ? `: ${subject}` : ""}.` })}
          >
            <DoodleIcon name="mail" size={12} className="text-accent-dark" />
            Email
          </EmailPerson>
        ))}
        {home && (
          <LandlordHomeAddress email={p.email} personRef={personRef} name={p.name} propertyAddress={home.propertyAddress ?? null} />
        )}
      </div>
      {note && (
        <p className={`mt-1.5 text-[11.5px] leading-snug ${note.tone === "bad" ? "text-accent-dark" : "text-muted"}`}>
          {note.tone === "busy" && <span aria-hidden className="mr-1.5 inline-block h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark align-[-1px]" />}
          {note.text}
        </p>
      )}
    </div>
  );
}
