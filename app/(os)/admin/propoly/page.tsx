"use client";

import { ExpectedPackEmail, PropolyMailView } from "@/components/MoveInPack";
import { useNewLook } from "@/lib/use-new-look";
import { usePropolyAdmin, day, at, OUTCOME, type Sender, type Plan } from "@/components/admin/use-propoly-admin";
import PropolyNew from "@/components/new-look/admin/PropolyNew";
import { Loading } from "@/components/new-look/admin/bits";

/**
 * PROPOLY, FROM THE OS'S SIDE (22 Oct 2026). Owners see everything; the
 * office (pre-tenancy, compliance) sees the log and puts on its let any email
 * the reader couldn't place.
 *
 * Needs attention       emails on no let, whose Outlook isn't connected, and
 *                       how many emails only one mailbox caught.
 * What we look for      the move-in pack email in words (lib/propoly-pack).
 * Move-in pack emails   Propoly's sender address (one setting), every
 *                       connected Outlook's read, what was kept, and anything
 *                       the reader couldn't put on a let. Find the Sender
 *                       looks across the mailboxes for who Propoly's mail
 *                       comes from; Read Again From Go-live is the backfill.
 * Missing documents     a deal from before go-live, its gas, EICR and EPC
 *                       found in the OS and REX, Check first, then Push.
 */

/* Types, formatters and the post live in components/admin/use-propoly-admin. */

function Spinner({ label }: { label: string }) {
  return <span className="inline-flex items-center gap-2 text-sm text-muted"><span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />{label}</span>;
}

export default function PropolyAdmin() {
  /* Everything it reads and does lives in one hook, shared with the new look
     (lib/new-look "admin", components/new-look/admin/PropolyNew). */
  const p = usePropolyAdmin();
  const look = useNewLook("admin");
  const { data, error, busy, said, senders, setSenders, words, setWords, watch, setWatch, found, setFound, open, setOpen, fileDeal, setFileDeal, deal, setDeal, plan, setPlan, kinds, setKinds, confirming, setConfirming, load, act } = p;

  if (look === null) return <Loading label="Opening Propoly…" page />;
  if (look) return <PropolyNew p={p} />;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl tracking-normal text-ink">Propoly</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        The move-in pack Propoly emails the tenant, read from each agent&apos;s own Outlook and kept on the let as proof it went. And a let&apos;s
        certificates pushed into its Propoly deal, for deals started before the OS went live.
      </p>
      {error && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      {said && <p className="mt-4 rounded-lg border border-line bg-box px-3 py-2 text-sm text-ink">{said}</p>}
      {!data && !error && <div className="mt-8"><Spinner label="Reading what's been kept" /></div>}

      {data && (
        <>
          {/* ── needs attention ─────────────────────────────────────────── */}
          <section className={`mt-8 rounded-xl border p-5 ${data.unfiled.length || data.gaps.length ? "border-accent-dark/30 bg-accent-dark/5" : "border-line"}`}>
            <h2 className="text-lg font-normal text-ink">Needs Attention</h2>
            {!data.unfiled.length && !data.gaps.length && <p className="mt-1 text-sm text-muted">Every email is on its let, and everybody who gets Propoly&apos;s copies has Outlook connected.</p>}

            {data.unfiled.length > 0 && (
              <div className="mt-3">
                <p className="text-sm text-ink">On no let yet · {data.unfiled.length}</p>
                <p className="mt-0.5 text-sm text-muted">
                  The reader couldn&apos;t tell which deal these are about, and tries again every few minutes. Paste the deal&apos;s Propoly link, or the address, to put one on its let now.
                </p>
                <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-page">
                  {data.unfiled.map((m) => (
                    <li key={m.id} className="flex flex-col gap-2 px-3 py-2.5 text-sm sm:flex-row sm:items-center">
                      <button type="button" onClick={() => setOpen(m)} className="min-w-0 flex-1 text-left hover:underline">
                        <span className="text-ink">{m.kind === "move-in" ? "Move-in pack" : "Propoly email"}</span>
                        <span className="block text-xs text-muted">{m.subject} · {at(m.at)} · {m.mailboxes.join(", ")}</span>
                      </button>
                      <input value={fileDeal[m.id] ?? ""} onChange={(e) => setFileDeal((f) => ({ ...f, [m.id]: e.target.value }))} placeholder="Deal link or address" className="w-full rounded-lg border border-line bg-page px-2.5 py-1.5 text-xs sm:w-56" />
                      <button type="button" disabled={busy !== null || !fileDeal[m.id]} onClick={() => act(`file-${m.id}`, { action: "file", id: m.id, deal: fileDeal[m.id] }, () => { void load(); return "Put on the let."; })} className="self-start rounded-full border border-line px-3 py-1.5 text-xs disabled:opacity-50 sm:self-auto">Match to a Deal</button>
                    </li>
                  ))}
                </ul>
                <button type="button" disabled={busy !== null} onClick={() => act("rematch", { action: "rematch" }, (j) => { void load(); return Number(j.placed) ? `${j.placed} put on ${Number(j.placed) === 1 ? "its let" : "their lets"}.` : "Still no deal for these. Match them by hand."; })} className="mt-2 text-xs text-accent-dark underline-offset-2 hover:underline disabled:opacity-50">
                  {busy === "rematch" ? "Trying…" : "Try Them Again Now"}
                </button>
              </div>
            )}

            {data.gaps.length > 0 && (
              <div className="mt-4">
                <p className="text-sm text-ink">Outlook not connected · {data.gaps.length}</p>
                <p className="mt-0.5 text-sm text-muted">Propoly&apos;s copies to these people, the move-in pack included, aren&apos;t being caught. They connect it on their Profile.</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {data.gaps.map((g) => (
                    <li key={g.email}><span className="text-ink">{g.name}</span> <span className="text-xs text-muted">· {g.why}</span></li>
                  ))}
                </ul>
              </div>
            )}

            <p className="mt-4 text-xs text-muted">
              {data.total ? `${data.onlyOneBox} of ${data.total} emails were found in one mailbox only` : "Nothing kept yet"}
              {data.total && data.onlyOneBox === data.total ? ": Propoly copies only the agent on the let, so nothing else in the office holds a second copy. Add a mailbox under Always Watch once one gets them." : "."}
            </p>
          </section>

          {/* ── what we are looking for ─────────────────────────────────── */}
          <section className="mt-6 rounded-xl border border-line p-5">
            <h2 className="text-lg font-normal text-ink">The Email We Look For</h2>
            <p className="mt-1 mb-3 text-sm text-muted">The move-in pack, as Propoly sends it. A let shows it as sent once a copy reaches any connected Outlook.</p>
            <ExpectedPackEmail />
          </section>

          {/* ── the setting ─────────────────────────────────────────────── */}
          {data.owner && (
          <section className="mt-6 rounded-xl border border-line p-5">
            <h2 className="text-lg font-normal text-ink">Move-in Pack Emails</h2>
            <p className="mt-1 text-sm text-muted">
              Only mail from these addresses is read: every Propoly email from {day(data.goLive)}, and move-in packs from {day(data.backfillFrom)}. A pack&apos;s files go on its home&apos;s Documents. A whole domain can be written as @propoly.com.
            </p>
            <label className="mt-4 block text-xs text-muted" htmlFor="senders">Propoly&apos;s sender address</label>
            <input id="senders" value={senders} onChange={(e) => setSenders(e.target.value)} placeholder="Not set yet" className="mt-1 w-full rounded-lg border border-line bg-page px-3 py-2 text-sm" />
            <label className="mt-3 block text-xs text-muted" htmlFor="words">What marks the move-in pack (subject or file names)</label>
            <input id="words" value={words} onChange={(e) => setWords(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-page px-3 py-2 font-mono text-xs" />
            <label className="mt-3 block text-xs text-muted" htmlFor="watch">Always watch these mailboxes (read every run, and named first if they disconnect)</label>
            <input id="watch" value={watch ?? ""} onChange={(e) => setWatch(e.target.value)} placeholder="e.g. kirstie.mulholland@thelettingexperts.co.uk" className="mt-1 w-full rounded-lg border border-line bg-page px-3 py-2 text-sm" />
            <label className="mt-4 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={data.settings.fileOnHomes}
                disabled={busy !== null}
                onChange={(e) => act("filing", { action: "settings", senders, moveInWords: words, alwaysWatch: watch ?? "", fileOnHomes: e.target.checked }, () => { void load(); return e.target.checked ? "Packs' files will go on their homes' Documents at the next read." : "Packs' files stay in this log only."; })}
              />
              <span>
                Put each move-in pack&apos;s files on its home&apos;s Documents
                <span className="block text-xs text-muted">They then show on the home, the let and the deal for everyone who can see the home.</span>
              </span>
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={busy !== null} onClick={() => act("save", { action: "settings", senders, moveInWords: words, alwaysWatch: watch ?? "" }, () => { void load(); return "Saved."; })} className="rounded-full bg-ink px-4 py-2 text-sm text-page disabled:opacity-50">
                {busy === "save" ? "Saving…" : "Save"}
              </button>
              <button type="button" disabled={busy !== null} onClick={() => act("discover", { action: "discover" }, (j) => { setFound((j.senders as Sender[]) ?? []); return `Looked in ${j.mailboxes} mailboxes${Number(j.problems) ? `, ${j.problems} couldn't be read` : ""}.`; })} className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-50">
                {busy === "discover" ? "Looking…" : "Find the Sender"}
              </button>
              <button type="button" disabled={busy !== null || !data.settings.senders.length} onClick={() => act("scan", { action: "scan" }, (j) => { void load(); const r = j.run as Record<string, unknown>; return r.skipped ? String(r.skipped) : `Read ${r.mailboxes} mailboxes: ${r.read} emails, ${r.logged} new kept.`; })} className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-50">
                {busy === "scan" ? "Reading…" : "Read Now"}
              </button>
              <button type="button" disabled={busy !== null || !data.settings.senders.length} onClick={() => act("backfill", { action: "scan", backfill: true }, (j) => { void load(); const r = j.run as Record<string, unknown>; return r.skipped ? String(r.skipped) : `Read again from ${day(data.backfillFrom)}: ${r.read} emails, ${r.logged} new kept, ${r.filed ?? 0} files put on their homes.`; })} className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-50">
                {busy === "backfill" ? "Reading…" : `Read Move-in Packs From ${day(data.backfillFrom)}`}
              </button>
            </div>
            {found && (
              <div className="mt-4 overflow-x-auto rounded-lg border border-line">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="bg-box text-xs text-muted"><tr><th className="px-3 py-2 font-normal">Sender</th><th className="px-3 py-2 text-right font-normal">Emails</th><th className="px-3 py-2 font-normal">Subjects</th><th className="px-3 py-2" /></tr></thead>
                  <tbody>
                    {found.length === 0 && <tr><td colSpan={4} className="px-3 py-3 text-muted">No mail mentioning Propoly since go-live in any connected mailbox.</td></tr>}
                    {found.map((s) => (
                      <tr key={s.address} className="border-t border-line align-top">
                        <td className="px-3 py-2"><span className="text-ink">{s.address}</span><span className="block text-xs text-muted">{s.name}</span></td>
                        <td className="figures px-3 py-2 text-right">{s.count}<span className="block text-xs text-muted">{s.mailboxes} {s.mailboxes === 1 ? "box" : "boxes"}</span></td>
                        <td className="px-3 py-2 text-xs text-muted">{s.subjects.join(" · ")}</td>
                        <td className="px-3 py-2 text-right"><button type="button" onClick={() => setSenders((v) => [...new Set([...v.split(/[\s,;]+/).filter(Boolean), s.address])].join(", "))} className="text-xs text-accent-dark underline-offset-2 hover:underline">Use</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          )}

          {/* ── what was kept ───────────────────────────────────────────── */}

          <section className="mt-6 rounded-xl border border-line p-5">
            <h2 className="text-lg font-normal text-ink">Kept From Outlook</h2>
            {data.recent.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{data.settings.senders.length ? "Nothing yet." : "Set Propoly's sender address first."}</p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-lg border border-line">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-box text-xs text-muted"><tr><th className="px-3 py-2 font-normal">Sent</th><th className="px-3 py-2 font-normal">Email</th><th className="px-3 py-2 font-normal">Let</th><th className="px-3 py-2 font-normal">Caught in</th><th className="px-3 py-2 text-right font-normal">Files</th></tr></thead>
                  <tbody>
                    {data.recent.map((m) => (
                      <tr key={m.id} onClick={() => setOpen(m)} className="cursor-pointer border-t border-line align-top hover:bg-box">
                        <td className="figures whitespace-nowrap px-3 py-2 text-muted">{at(m.at)}</td>
                        <td className="px-3 py-2"><span className="text-ink">{m.kind === "move-in" ? "Move-in pack" : "Propoly email"}</span><span className="block text-xs text-muted">{m.subject}</span></td>
                        <td className="px-3 py-2 text-xs">{m.address || <span className="text-accent-dark">Not on a let</span>}<span className="block text-muted">{m.matchedOn === "tenant" ? "by the tenant's email" : m.matchedOn === "address" ? "by the address" : m.matchedOn === "hand" ? `by ${m.matchedBy}` : ""}</span></td>
                        <td className="px-3 py-2 text-xs text-muted">{m.mailboxes.map((b) => b.split("@")[0].replace(/\./g, " ")).join(", ")}{m.mailboxes.length <= 1 && <span className="block text-[11px] text-accent-dark">Only copy</span>}</td>
                        <td className="figures px-3 py-2 text-right">
                          {m.attachments.filter((f) => f.key).length} of {m.attachments.length}
                          {m.kind === "move-in" && (m.missing?.length ?? 0) > 0 && <span className="block text-left text-xs font-normal text-accent-dark">Not attached: {m.missing!.join(", ")}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-muted">Mailboxes read · {data.boxes.length}, most Propoly email first</summary>
              <ul className="mt-2 space-y-1 text-xs">
                {data.boxes.map((b) => (
                  <li key={b.email} className="flex flex-wrap gap-x-3">
                    <span className="text-ink">{b.email}</span>
                    <span className="text-muted">{b.lastRunAt ? `read ${at(b.lastRunAt)}, ${b.kept} ${b.kept === 1 ? "email" : "emails"} found here` : "not read yet"}</span>
                    {data.settings.alwaysWatch.includes(b.email) && <span className="text-ink">Always watched</span>}
                    {b.note && <span className="text-accent-dark">{b.note}</span>}
                  </li>
                ))}
              </ul>
            </details>
          </section>

          {/* ── missing documents on a deal ─────────────────────────────── */}
          {data.owner && (
          <section className="mt-6 rounded-xl border border-line p-5">
            <h2 className="text-lg font-normal text-ink">Missing Documents on a Deal</h2>
            <p className="mt-1 text-sm text-muted">
              For a deal started before go-live. Check finds the home&apos;s newest gas safety, EICR and EPC in the OS, REX and any PLC pack, and writes
              nothing. Push puts them into the deal&apos;s document slots.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <input value={deal} onChange={(e) => { setDeal(e.target.value); setPlan(null); setConfirming(false); }} placeholder="Propoly deal or property link, or the address" className="min-w-[260px] flex-1 rounded-lg border border-line bg-page px-3 py-2 text-sm" />
              <button type="button" disabled={busy !== null || !deal.trim()} onClick={() => act("check", { action: "docs-check", deal }, (j) => { setPlan(j.plan as Plan); setConfirming(false); })} className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-50">
                {busy === "check" ? "Checking…" : "Check"}
              </button>
            </div>
            {plan && (
              <div className="mt-4 rounded-lg border border-line p-4">
                <p className="text-sm text-ink">{plan.address}</p>
                <p className="text-xs text-muted">{plan.status}{plan.moveIn ? ` · moves in ${day(plan.moveIn)}` : ""}</p>
                {plan.rexNote && <p className="mt-1 text-xs text-accent-dark">{plan.rexNote}</p>}
                <ul className="mt-3 space-y-2">
                  {plan.docs.map((d) => (
                    <li key={d.kind} className="flex items-start gap-3 text-sm">
                      <input type="checkbox" aria-label={d.label} disabled={!d.found} checked={Boolean(d.found) && kinds.includes(d.kind)} onChange={(e) => setKinds((k) => (e.target.checked ? [...k, d.kind] : k.filter((x) => x !== d.kind)))} className="mt-1" />
                      <span className="min-w-0 flex-1">
                        <span className="text-ink">{d.label}</span>
                        {d.found ? (
                          <span className={`block text-xs ${d.found.expired ? "text-accent-dark" : "text-muted"}`}>{d.found.name} · {d.found.where} · expires {day(d.found.expiry)}</span>
                        ) : (
                          <span className="block text-xs text-muted">{d.note}</span>
                        )}
                        {d.outcome && <span className={`block text-xs ${d.outcome === "failed" ? "text-accent-dark" : "text-ink"}`}>{OUTCOME[d.outcome] ?? d.outcome} · {d.note}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
                {plan.docs.some((d) => d.found && kinds.includes(d.kind) && !d.outcome) && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {!confirming ? (
                      <button type="button" disabled={busy !== null} onClick={() => setConfirming(true)} className="rounded-full bg-ink px-4 py-2 text-sm text-page disabled:opacity-50">Push to Propoly</button>
                    ) : (
                      <>
                        <button type="button" disabled={busy !== null} onClick={() => act("push", { action: "docs-push", deal, kinds, includeExpired: true }, (j) => { setPlan(j.plan as Plan); setConfirming(false); void load(); return "Pushed. Each document's answer from Propoly is above."; })} className="rounded-full bg-accent-dark px-4 py-2 text-sm text-white disabled:opacity-50">
                          {busy === "push" ? "Pushing…" : `Yes, push ${kinds.filter((k) => plan.docs.find((d) => d.kind === k)?.found).length} into Propoly`}
                        </button>
                        <button type="button" onClick={() => setConfirming(false)} className="text-sm text-muted">Cancel</button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
            {data.pushes.length > 0 && (
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer text-muted">Pushes made · {data.pushes.length}</summary>
                <ul className="mt-2 space-y-1.5 text-xs">
                  {data.pushes.map((p) => (
                    <li key={p.id}>
                      <span className="text-ink">{p.address}</span> <span className="text-muted">· {at(p.at)} · {p.by}</span>
                      <span className="block text-muted">{p.results.map((r) => `${r.label}: ${OUTCOME[r.outcome ?? ""] ?? "-"}`).join(" · ")}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
          )}
        </>
      )}
      {open && <PropolyMailView mail={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
