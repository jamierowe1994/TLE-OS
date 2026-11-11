"use client";

import FloatSheet, { FloatChoice, useFloatSheet } from "@/components/new-look/FloatSheet";

/**
 * The home's Email button asks what kind of email first (James, 8 Nov 2026:
 * "Email Docs, Email the Team, Send out logins ... into the email button at
 * the top ... the buttons pre-hand, so they can just click which one it is,
 * and then it will go into that flow"). Each choice closes this and opens
 * the flow it names, the dark staying up between the two.
 */

export type EmailPick = "email" | "docs" | "team" | "logins";

const icon = (d: React.ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
);

const ICONS: Record<EmailPick, React.ReactNode> = {
  email: icon(<><rect x="3" y="5" width="18" height="14" /><path d="M3 7l9 6 9-6" /></>),
  docs: icon(<><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>),
  team: icon(<><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14.2c2.9.3 5 2.6 5 5.8" /></>),
  logins: icon(<><rect x="5" y="11" width="14" height="10" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>),
};

export default function EmailChooser({ onPick, onClose, logins }: {
  onPick: (pick: EmailPick) => void;
  onClose: () => void;
  /** Send out logins needs a let with tenants to send to. */
  logins: boolean;
}) {
  return (
    <FloatSheet title="Email" onClose={onClose} question="What are you sending?" lede="Pick one and it opens ready to go. Everything sent is kept on this home's record.">
      <Choices onPick={onPick} logins={logins} />
    </FloatSheet>
  );
}

function Choices({ onPick, logins }: { onPick: (pick: EmailPick) => void; logins: boolean }) {
  const sheet = useFloatSheet();
  const go = (pick: EmailPick) => {
    sheet?.close();
    onPick(pick);
  };
  return (
    <div className="nl-fs-choices">
      <FloatChoice icon={ICONS.email} title="Email" text="Write to the tenants, the landlord or both" onClick={() => go("email")} />
      <FloatChoice icon={ICONS.docs} title="Email Docs" text="Certificates and documents attached, to the tenants, the landlord or both" onClick={() => go("docs")} />
      <FloatChoice icon={ICONS.team} title="Email the Team" text="The agent, compliance or anyone here, the thread kept on the home" onClick={() => go("team")} />
      <FloatChoice icon={ICONS.logins} title="Send out logins" text={logins ? "Tenant accounts, so they can report repairs" : "No tenants to send a login to yet"} disabled={!logins} onClick={() => go("logins")} />
    </div>
  );
}
