"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import type { VerifyItem } from "@/lib/compliance-desk";

/**
 * THE REGISTER CHECK, ON THE ROW (Michael, 24 Sep 2026: "When a gas safety
 * comes in ... you just put [the number] in there and check it and just tick
 * it off").
 *
 * The number is read off the certificate before he gets to it. One press puts
 * it on his clipboard and opens the right register in a new tab - his own
 * browser, his own login - so all that is left is paste, look, and come back
 * to press Verified. The number box is his: if the read was wrong he corrects
 * it, and the one he checked is what is kept (with whether we read it right).
 */
export default function RegisterCheck({
  item,
  number,
  setNumber,
  onRead,
  onNotOnRegister,
  onNoNumber,
  delayMs,
}: {
  item: VerifyItem;
  number: string;
  setNumber: (n: string) => void;
  onRead: (again: boolean) => Promise<void>;
  onNotOnRegister: (note: string) => void;
  onNoNumber: (note: string) => void;
  /** Stagger, so a long list is read a few at a time rather than all at once. */
  delayMs: number;
}) {
  const reg = item.register;
  const read = reg?.read ?? null;
  const [reading, setReading] = useState(false);
  const [copied, setCopied] = useState(false);
  /* Gas is two checks on the Gas Safe Register (James, 9 Oct 2026): the
     business, by its registration number, and the engineer, by the licence
     number on their ID card. */
  const gas = read?.scheme === "gas_safe" || /gas/i.test(item.what);
  const [licence, setLicence] = useState("");
  const [copiedLicence, setCopiedLicence] = useState(false);
  useEffect(() => {
    if (read?.licence && !licence) setLicence(read.licence);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [read?.licence]);

  /* Read it the first time the row is shown. */
  useEffect(() => {
    if (!reg || read) return;
    let gone = false;
    const t = setTimeout(async () => {
      if (gone) return;
      setReading(true);
      await onRead(false);
      if (!gone) setReading(false);
    }, delayMs);
    return () => {
      gone = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, Boolean(read)]);

  /* The read number goes in the box, until he types his own. */
  useEffect(() => {
    if (read?.number && !number) setNumber(read.number);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [read?.number]);

  if (!reg) return null;
  const name = reg.registerName ?? "the register";
  const who = [read?.engineer, read?.business].filter(Boolean).join(", ");

  async function openRegister(value = number, done: (v: boolean) => void = setCopied) {
    const n = value.trim();
    if (n) {
      try {
        await navigator.clipboard.writeText(n);
        done(true);
        window.setTimeout(() => done(false), 2500);
      } catch {
        /* No clipboard (an old browser, or not allowed): the number is on screen to type. */
      }
    }
    if (reg?.registerUrl) window.open(reg.registerUrl, "_blank", "noopener");
  }

  return (
    <div className="mt-3 rounded-xl border border-line/70 bg-page/70 p-3">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Engineer on the register</p>

      {!read || reading ? (
        <p className="mt-1.5 flex items-center gap-2 text-[12.5px] text-muted">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-accent-dark" />
          Reading the engineer off the certificate…
        </p>
      ) : read.state === "failed" ? (
        <p className="mt-1.5 text-[12.5px] text-muted">
          Couldn&rsquo;t read it: {(read.note || "unknown reason").replace(/\.+$/, "")}.{" "}
          <button type="button" onClick={async () => { setReading(true); await onRead(true); setReading(false); }} className="font-semibold text-ink underline underline-offset-2">
            Try again
          </button>{" "}
          or type the number from the certificate below.
        </p>
      ) : read.scheme === "none" ? (
        <p className="mt-1.5 text-[12.5px] leading-snug">
          No registration number on the certificate{who ? ` (${who})` : ""}. Without one it can&rsquo;t be checked.{" "}
          <button
            type="button"
            onClick={() => onNoNumber(`No ${/gas/i.test(item.what) ? "Gas Safe" : "NICEIC or NAPIT"} registration number on the certificate. Please get it from the engineer, or a certificate that shows it.`)}
            className="font-semibold text-accent-dark underline underline-offset-2"
          >
            Ask the agent for it
          </button>
        </p>
      ) : (
        <p className="mt-1.5 text-[12.5px] leading-snug">
          <span className="font-semibold">{name}</span>{" "}
          {read.number ? (
            <>number <span className="font-semibold tabular-nums">{read.number}</span></>
          ) : (
            <>- number unclear, type it from the certificate</>
          )}
          {read.licence && read.licence !== read.number ? <span className="text-muted"> (engineer&rsquo;s licence {read.licence})</span> : null}
          {who ? <span className="text-muted"> · {who}</span> : null}
          {read.note ? <span className="block text-[11.5px] text-muted">{read.note}</span> : null}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[12px] text-muted">
          {gas ? "Business number" : "Number checked"}
          <input
            value={number}
            onChange={(e) => setNumber(e.target.value.replace(/[^A-Za-z0-9/-]/g, "").slice(0, 30))}
            inputMode="numeric"
            placeholder="From the certificate"
            className="w-[150px] rounded-lg border border-line/80 bg-white px-2.5 py-1.5 text-[12.5px] tabular-nums text-ink outline-none focus:border-ink/40"
          />
        </label>
        {reg.registerUrl && (
          <button
            type="button"
            onClick={() => void openRegister()}
            className="flex items-center gap-1.5 rounded-full border border-line/80 bg-white px-3 py-1.5 text-[12px] font-semibold transition hover:border-ink/40"
          >
            <DoodleIcon name="search" size={12} className="text-accent-dark" />
            {copied ? "Copied - paste it in" : gas ? "Check the business" : `Copy and open ${name}`}
          </button>
        )}
      </div>
      {gas && reg.registerUrl && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[12px] text-muted">
            Engineer&rsquo;s licence
            <input
              value={licence}
              onChange={(e) => setLicence(e.target.value.replace(/[^0-9]/g, "").slice(0, 7))}
              inputMode="numeric"
              placeholder="7 digits, ID card"
              className="w-[150px] rounded-lg border border-line/80 bg-white px-2.5 py-1.5 text-[12.5px] tabular-nums text-ink outline-none focus:border-ink/40"
            />
          </label>
          <button
            type="button"
            onClick={() => void openRegister(licence, setCopiedLicence)}
            className="flex items-center gap-1.5 rounded-full border border-line/80 bg-white px-3 py-1.5 text-[12px] font-semibold transition hover:border-ink/40"
          >
            <DoodleIcon name="search" size={12} className="text-accent-dark" />
            {copiedLicence ? "Copied - paste it in" : "Check the engineer"}
          </button>
          {!licence && read && read.state === "read" && (
            <span className="text-[11.5px] text-muted">Not printed on this one - ask for the engineer&rsquo;s Gas Safe ID card number.</span>
          )}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {read && read.scheme !== "none" && (
          <button
            type="button"
            onClick={() => onNotOnRegister(`${who || "The engineer"} (${number || read.number}) is not on the ${name}. The certificate cannot be accepted - it needs redoing by a registered engineer.`)}
            className="rounded-full px-2 py-1.5 text-[12px] text-muted underline-offset-2 hover:text-[#9d4340] hover:underline"
          >
            Not on the register
          </button>
        )}
      </div>
    </div>
  );
}
