"use client";

import { useEffect, useState } from "react";
import AddedHere from "@/components/AddedHere";
import DoodleIcon from "@/components/DoodleIcon";
import { readJson } from "@/lib/page-cache";
import { useNewLook } from "@/lib/use-new-look";

/**
 * Leads added in the OS that have not reached REX, said on Admin's home.
 *
 * James, 24 Oct 2026, of the Not backed up yet box on Leads: "They're not
 * backed up yet. Don't worry about that. You can just get rid of them... if
 * they're not being pushed, just tell me in the admin centre." So the new
 * Leads page dropped the box (components/AddedHere), and this line is where
 * the same list surfaces instead: a count, and See them opens the very same
 * list, Push to REX buttons and all.
 *
 * Only while the new Leads page is on. With the old one the box is still on
 * Leads, and saying it twice would be noise. Nothing at all when every one
 * has gone through; a read that fails says so, never a zero.
 *
 * Counted from /api/contacts, the read the box itself makes, so the two can
 * never disagree. That read is the board's scope: the whole business for an
 * owner and the office, otherwise your own.
 */

type Row = { rexState?: string };

export default function LeadsNotBackedUp({ look }: { look: "new" | "old" }) {
  const leadsLook = useNewLook("leads") === true;
  const [n, setN] = useState<number | "error" | null>(null);
  const [open, setOpen] = useState(false);

  /* Read again each time the list is shut, so one pushed from it comes off the count. */
  useEffect(() => {
    if (!leadsLook || open) return;
    let gone = false;
    readJson<{ contacts?: Row[] }>("/api/contacts", (j) => Array.isArray(j?.contacts))
      .then((j) => {
        if (gone) return;
        if (!Array.isArray(j?.contacts)) return setN("error");
        setN(j.contacts.filter((c) => c.rexState !== "sent" && c.rexState !== "linked").length);
      })
      .catch(() => !gone && setN("error"));
    return () => {
      gone = true;
    };
  }, [leadsLook, open]);

  if (!leadsLook || n === null || n === 0) return null;

  const says =
    n === "error"
      ? "Couldn't check for leads that aren't backed up just now. Try again in a minute."
      : `${n.toLocaleString("en-GB")} ${n === 1 ? "lead" : "leads"} added in the OS ${n === 1 ? "is" : "are"} not backed up yet.`;
  const blurb = "Saved and safe in the OS, and on the Leads board like everyone else. They just haven't reached REX yet.";
  const toggle = n !== "error" && (
    <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={look === "new" ? "nl-link" : "text-[11.5px] font-semibold text-accent-dark hover:underline"}>
      {open ? "Hide" : "See them"}
    </button>
  );

  if (look === "new") {
    return (
      <section className="nl-adm-block">
        <div className="nl-adm-block-head">
          <h2 className="nl-section-title">Leads Not Backed Up</h2>
          {toggle}
        </div>
        <p className="nl-meta">{says}</p>
        {open && <AddedHere blurb={blurb} />}
      </section>
    );
  }
  return (
    <section className="fade-up mt-6 rounded-[22px] border border-line/50 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2.5 text-[12.5px]">
          <DoodleIcon name="user" size={15} className="text-accent-dark" />
          {says}
        </p>
        {toggle}
      </div>
      {open && <AddedHere blurb={blurb} />}
    </section>
  );
}
