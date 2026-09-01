"use client";

import { useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { PressButton } from "@/components/Bits";

/**
 * Telling people something happened.
 *
 * One send, several messages. A viewing confirmation to the applicant and the
 * same viewing to the landlord are not the same message — one says "here's
 * where to meet me", the other says "somebody's coming round" — so they are
 * composed and shown separately, and each recipient picks their own channel.
 *
 * Email and WhatsApp carry genuinely different text rather than the same
 * paragraph in a different pipe: nobody wants a five-line letter on WhatsApp,
 * and nobody wants an email that opens with "Hi!" and no context.
 */

export type Channel = "email" | "whatsapp";

export type Outgoing = {
  key: string;
  /** Applicant / Landlord / Agent — shown as the reason they're being told. */
  role: string;
  name: string;
  email: string;
  phone: string;
  subject: string;
  /** The long version. */
  emailBody: string;
  /** The short version. */
  whatsappBody: string;
  /** Preselected channel — WhatsApp for people you text, email for records. */
  channel: Channel;
  /** Off by default for anyone optional. */
  on: boolean;
  /**
   * Why this one CANNOT be sent — shown in place of its controls, and
   * excluded from the send whatever `on` says.
   *
   * The case it exists for: we know somebody ought to be told, and we do not
   * know who they are. A viewing's landlord is the live example — REX holds no
   * landlord against a rental, so the booker used to fill the gap with an
   * invented person and offer to email them. Dropping the row instead would be
   * quieter but worse: the agent would never learn that the landlord hasn't
   * been told. So the row stays, says what's missing, and is unsendable.
   */
  blocked?: string;
};

export default function SendFlow({
  messages,
  onSend,
  sendLabel = "Send",
}: {
  messages: Outgoing[];
  onSend: (sent: Outgoing[]) => void;
  sendLabel?: string;
}) {
  const [rows, setRows] = useState<Outgoing[]>(messages);
  const [open, setOpen] = useState<string | null>(messages[0]?.key ?? null);

  const set = (key: string, patch: Partial<Outgoing>) =>
    setRows((r) => r.map((m) => (m.key === key ? { ...m, ...patch } : m)));

  /* `!m.blocked` is the belt as well as the braces: a blocked row can never be
     switched on below, but nothing downstream should depend on that. */
  const going = rows.filter((m) => m.on && !m.blocked);
  const blocked = rows.filter((m) => m.blocked);

  return (
    <div>
      <p className="mb-4 text-[12.5px] leading-relaxed text-muted">
        {going.length === 0
          ? "Nobody selected — the viewing will be saved without telling anyone."
          : `${going.length} message${going.length === 1 ? "" : "s"} will go out, one per person. Open any of them to change the wording.`}
        {blocked.length > 0 && (
          <>
            {" "}
            {blocked.length === 1 ? "One person" : `${blocked.length} people`} can&apos;t be
            told from here — see below.
          </>
        )}
      </p>

      <ul className="space-y-3">
        {rows.map((m) => {
          const expanded = open === m.key;
          const wa = m.channel === "whatsapp";
          return (
            <li
              key={m.key}
              className={`overflow-hidden rounded-2xl border transition-colors ${
                m.blocked
                  ? "border-dashed border-line/70"
                  : m.on
                    ? "border-line/80"
                    : "border-line/50 opacity-55"
              }`}
            >
              <div className="flex flex-wrap items-center gap-3 p-3.5">
                {m.blocked ? (
                  /* No tick, and nothing to tick. An empty checkbox invites a
                     click that would have to be refused. */
                  <span
                    aria-hidden
                    className="flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-line text-[10px] text-muted"
                  >
                    —
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => set(m.key, { on: !m.on })}
                    className={`flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[10px] transition-colors ${
                      m.on ? "border-accent-dark bg-accent-dark text-page" : "border-line"
                    }`}
                    title={m.on ? "Don't tell them" : "Tell them"}
                  >
                    {m.on && "✓"}
                  </button>
                )}

                <button
                  type="button"
                  disabled={Boolean(m.blocked)}
                  onClick={() => setOpen(expanded ? null : m.key)}
                  className="min-w-0 flex-1 text-left disabled:cursor-default"
                >
                  <span className="hand block truncate text-[13.5px]">{m.name}</span>
                  <span className="block truncate text-[10.5px] text-muted">
                    {m.blocked ? m.role : `${m.role} · ${wa ? m.phone : m.email}`}
                  </span>
                </button>

                {/* Channel is per person, not per send — the landlord who
                    only answers WhatsApp shouldn't force the applicant's
                    confirmation onto WhatsApp too. */}
                <div className={`flex shrink-0 rounded-full border border-line/80 p-0.5 ${m.blocked ? "hidden" : ""}`}>
                  {(["email", "whatsapp"] as Channel[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => set(m.key, { channel: c })}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                        m.channel === c ? "bg-ink text-page" : "text-muted hover:text-ink"
                      }`}
                    >
                      <DoodleIcon name={c === "email" ? "mail" : "message-2"} size={12} />
                      {c === "email" ? "Email" : "WhatsApp"}
                    </button>
                  ))}
                </div>

                {!m.blocked && (
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : m.key)}
                    className="shrink-0 text-[11px] font-semibold text-muted transition-colors hover:text-ink"
                  >
                    {expanded ? "Hide" : "Read"}
                  </button>
                )}
              </div>

              {/* Why they can't be told, and what would fix it. */}
              {m.blocked && (
                <p className="border-t border-dashed border-line/60 bg-panel/50 px-3.5 py-2.5 text-[11px] leading-relaxed text-muted">
                  {m.blocked}
                </p>
              )}

              {expanded && !m.blocked && (
                <div className="border-t border-line/60 bg-card/60 p-3.5">
                  {!wa && (
                    <label className="mb-2.5 block">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
                        Subject
                      </span>
                      <input
                        value={m.subject}
                        onChange={(e) => set(m.key, { subject: e.target.value })}
                        className="w-full rounded-lg border border-line/70 bg-transparent px-2.5 py-1.5 text-[12.5px] outline-none focus:border-ink"
                      />
                    </label>
                  )}
                  <textarea
                    value={wa ? m.whatsappBody : m.emailBody}
                    onChange={(e) =>
                      set(m.key, wa ? { whatsappBody: e.target.value } : { emailBody: e.target.value })
                    }
                    rows={wa ? 4 : 9}
                    className="w-full resize-none rounded-lg border border-line/70 bg-transparent p-2.5 text-[12.5px] leading-relaxed outline-none focus:border-ink"
                  />
                  {wa && (
                    <p className="mt-1.5 text-[10px] text-muted">
                      WhatsApp Business templates have to be approved before they can start a
                      conversation — this one is written to fit a utility template.
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-5 flex justify-end">
        <PressButton
          onClick={() => onSend(going)}
          className="flex items-center gap-2 rounded-full bg-ink px-6 py-2.5 text-[13px] font-semibold text-page"
        >
          <DoodleIcon name={going.some((m) => m.channel === "whatsapp") ? "message-2" : "mail"} size={15} />
          {going.length ? `${sendLabel} · ${going.length}` : "Save without telling anyone"}
        </PressButton>
      </div>
    </div>
  );
}
