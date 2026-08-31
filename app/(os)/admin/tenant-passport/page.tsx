"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import CopyLink from "@/app/(os)/admin/onboarding/CopyLink";

/**
 * Tenant passport, for demonstrating.
 *
 * James needs to open a passport in front of people without digging a link
 * out of an email. The obvious build is "list the passports and click one",
 * and it is the wrong one.
 *
 * ── Why real passports are not listed here ────────────────────────────────
 *
 * The link IS the credential. Anyone holding it can read AND WRITE that
 * passport: legal name, date of birth, nationality, income, savings, adverse
 * credit and CCJs, guarantor, and a right-to-rent share code, which is a live
 * credential against gov.uk. A screen-share of a list of those links hands
 * every viewer a permanent key to every tenant's file, transcribable straight
 * off the screen.
 *
 * Worse for a demo specifically: the form autosaves 800ms after a keystroke.
 * Typing into a real passport to show how it works would overwrite that
 * person's answers.
 *
 * So this page makes throwaways instead. They are real passports on the real
 * public URL - so the link genuinely can be sent to Susan - but they are
 * about nobody, and deleting one costs nothing.
 */

type Demo = {
  token: string;
  name: string;
  createdAt: string;
  submittedAt: string | null;
  filled: number;
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function TenantPassportDemoPage() {
  const [rows, setRows] = useState<Demo[] | null>(null);
  const [db, setDb] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/demo-passports", { cache: "no-store" });
      const j = (await r.json()) as { passports?: Demo[]; db?: boolean };
      setRows(j.passports ?? []);
      setDb(j.db !== false);
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function make() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/demo-passports", { method: "POST" });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!j.ok) setError(j.error ?? "That did not work.");
      else await load();
    } catch {
      setError("That did not work.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(token: string) {
    await fetch(`/api/admin/demo-passports?token=${encodeURIComponent(token)}`, {
      method: "DELETE",
    }).catch(() => null);
    await load();
  }

  return (
    <>
      <PageHeader
        title="Tenant Passport"
        blurb="The form a tenant fills in once and reuses. Make a throwaway to show somebody, or to send them."
      />

      <section className="fade-up mt-8 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">Make one to demo with</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">
          Creates an empty passport for a made-up person, on the real public URL.
          You can open it, type in it, send it to somebody, and delete it after.
          It belongs to nobody, so nothing you do to it matters.
        </p>
        {error && (
          <p className="mt-3 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12.5px]">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={make}
          disabled={busy || !db}
          className="mt-3 rounded-full bg-accent-dark px-4 py-2 text-[12px] font-semibold text-white transition-opacity disabled:opacity-40"
        >
          {busy ? "Making…" : "New demo passport"}
        </button>
        {!db && (
          <p className="mt-2 text-[11px] text-muted">
            There is no database on this environment, so one cannot be made here.
          </p>
        )}
      </section>

      <section className="fade-up mt-3 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">Your demo passports</h2>
        {rows === null ? (
          <p className="mt-2 text-[12px] text-muted">Looking…</p>
        ) : rows.length === 0 ? (
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            None yet. Make one above and it will appear here with its link.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            {rows.map((p) => (
              <div key={p.token} className="border-t border-line/70 pt-3 first:border-0 first:pt-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[13px]">{p.name || "Sample Tenant"}</span>
                  <span className="text-[11px] text-muted">made {when(p.createdAt)}</span>
                  {p.submittedAt ? (
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-dark">
                      Submitted
                    </span>
                  ) : p.filled > 0 ? (
                    <span className="text-[11px] text-muted">{p.filled} fields filled in</span>
                  ) : (
                    <span className="text-[11px] text-muted">Blank</span>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(p.token)}
                    className="ml-auto text-[11.5px] text-muted underline transition-colors hover:text-ink"
                  >
                    Delete
                  </button>
                </div>
                <CopyLink path={`/tenant/passport/${p.token}`} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="fade-up mt-3 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">Why real tenants are not listed here</h2>
        <ul className="mt-2.5 flex list-disc flex-col gap-1.5 pl-4 text-[12px] leading-relaxed text-muted">
          <li>
            <span className="text-ink">The link is the login.</span> Anyone holding
            one can read and change that passport: income, savings, adverse credit,
            guarantor, and the right-to-rent share code, which works against gov.uk.
          </li>
          <li>
            On a screen-share, a link in the address bar can be copied down by
            anyone watching, and it does not expire.
          </li>
          <li>
            The form saves as you type. Typing into a real passport to show
            somebody how it works would overwrite that person&apos;s answers.
          </li>
          <li>
            So this page can only ever see throwaways. That is enforced in the
            query, not in a setting somebody can change.
          </li>
        </ul>
      </section>
    </>
  );
}
