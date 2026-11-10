"use client";

import { useEffect, useState } from "react";

/**
 * A LANDLORD'S OTHER EMAILS, READ FOR THE CARD (Dan Richards, ticket 190230a3;
 * James, 10 Nov 2026: "Have the ability to add a second email, so you can
 * click +, and then you can select what type of email it is (work or
 * personal).").
 *
 * Read from GET /api/people/emails (lib/landlord-emails) by the landlord's
 * main email or contact ref, so the same person shows the same addresses on
 * every card. ContactBlock draws them under the main email, each with its
 * type and its own Email and copy buttons. They are changed behind the pencil
 * on the appraisal's landlord card (components/new-look/AppraisalLandlord),
 * which tells every open card to read again once it has saved.
 *
 * OS only: never REX, and no automatic send goes to them.
 */

export type EmailKind = "personal" | "work";
export type OtherEmail = { email: string; kind: EmailKind };
export type LandlordEmails = { mainKind: EmailKind; extras: OtherEmail[] };

export const KIND_LABEL: Record<EmailKind, string> = { personal: "Personal", work: "Work" };

const CHANGED = "os:landlord-emails";

/** Every card showing a landlord reads their emails again. */
export function landlordEmailsChanged() {
  try {
    window.dispatchEvent(new Event(CHANGED));
  } catch {
    /* nothing open to tell */
  }
}

export async function readLandlordEmails(email: string, ref: string): Promise<LandlordEmails | null> {
  if (!email && !ref) return null;
  const j = (await fetch(`/api/people/emails?${new URLSearchParams({ email, ref })}`, { cache: "no-store" }).then((r) => r.json())) as {
    ok?: boolean;
    error?: string;
    emails?: LandlordEmails | null;
  };
  if (!j?.ok) throw new Error(j?.error ?? "Their other emails couldn't be read.");
  return j.emails ?? null;
}

/** emails: null until read, or when nobody has said anything about their emails. */
export function useLandlordEmails(email: string | null | undefined, personRef: string | null | undefined, enabled = true): { emails: LandlordEmails | null; failed: boolean } {
  const e = (email ?? "").trim();
  const ref = (personRef ?? "").trim();
  const [emails, setEmails] = useState<LandlordEmails | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const bump = () => setTick((n) => n + 1);
    window.addEventListener(CHANGED, bump);
    return () => window.removeEventListener(CHANGED, bump);
  }, [enabled]);
  useEffect(() => {
    if (!enabled || (!e && !ref)) {
      setEmails(null);
      setFailed(false);
      return;
    }
    let live = true;
    readLandlordEmails(e, ref)
      .then((x) => {
        if (!live) return;
        setEmails(x);
        setFailed(false);
      })
      /* Said quietly under the email, never left looking like "none". */
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [e, ref, enabled, tick]);
  return { emails, failed };
}
