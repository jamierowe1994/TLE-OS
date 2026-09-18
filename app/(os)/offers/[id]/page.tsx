import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { hasDb, q } from "@/lib/db";
import { OFFER_FIELDS, show, type OfferChange, type OfferFieldKey, type OfferPassport } from "@/lib/offer-passport";

/**
 * AN OFFER, AS THE AGENT SEES IT (James, 18 Sep 2026). What a tenant sent
 * from their tenant area after a viewing - the rent, the dates, who is moving
 * in, and their passport as they confirmed it.
 *
 * Anything they changed on the way carries an asterisk and the answer they
 * gave before, and an eye beside it. An eye in the warning colour marks the
 * changes worth a second look before it goes to the landlord (lib/offer-
 * passport watched) - adverse credit that vanishes just before an offer, a
 * guarantor that appears, income that jumps. The tenant sees none of this.
 *
 * Staff only: it sits behind the OS's own door like every page in (os). The
 * link is in the agent's email.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Row = {
  id: string; email: string; name: string; address: string; kind: string; sent_to: string | null; outcome: string | null; created_at: Date;
  payload: {
    amount?: number; asking?: number | null; moveIn?: string; term?: string; adults?: number; children?: number; pets?: boolean; petsNote?: string; note?: string;
    passport?: OfferPassport; changes?: OfferChange[];
    reasons?: string[]; topics?: string[]; message?: string;
  };
};

const card = "rounded-[22px] border border-line/50 bg-white p-6";
const eyebrow = "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted";
const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;
const KIND: Record<string, string> = { offer: "Offer", questions: "Questions", not_for_me: "Not for them" };

/** The eye: plain when an answer changed, in the warning colour when the
 *  change is worth a look. Drawn here - neither icon set has one. */
function Eye({ watch }: { watch: boolean }) {
  return (
    <span
      title={watch ? "Changed just before the offer - worth a look" : "Changed with this offer"}
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${watch ? "bg-[#fbeee0] text-[#a35a12]" : "bg-panel text-muted"}`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      </svg>
    </span>
  );
}

export default async function OfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasDb() || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const rows = await q<Row>(`SELECT * FROM os_tenant_viewing_responses WHERE id = $1`, [id]).catch(() => []);
  const r = rows[0];
  if (!r) notFound();
  const p = r.payload ?? {};
  const changes = p.changes ?? [];
  const changed = new Map(changes.map((c) => [c.key, c]));
  const when = new Date(r.created_at).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "Europe/London" });

  /* The passport rows, in the offer sheet's order, skipping what does not apply. */
  const keys: OfferFieldKey[] = OFFER_FIELDS.map((f) => f.key).filter((k) => {
    if (!p.passport) return false;
    /* A changed answer always shows, however it changed: a credit note that
       disappears with the credit is exactly the thing to see. */
    if (changed.has(k)) return true;
    if (k === "shareCode" && p.passport.hasBritishPassport) return false;
    if (k === "adverseCreditNote" && !p.passport.adverseCredit) return false;
    if (k === "petsNote" && !p.passport.pets) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader title={`${KIND[r.kind] ?? "Response"} from ${r.name || r.email}`} blurb={`${r.address} · ${when}`} />

      {r.kind === "offer" && (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <section className={card}>
              <p className={eyebrow}>The offer</p>
              <p className="mt-2 text-[34px] font-bold leading-none">
                {p.amount ? gbp(p.amount) : "-"} <span className="text-[14px] font-normal text-muted">a month</span>
              </p>
              {p.asking ? <p className="mt-2 text-[13px] text-muted">Advertised at {gbp(p.asking)}{p.amount && p.amount < p.asking ? ` - ${gbp(p.asking - p.amount)} under` : ""}</p> : null}
              <dl className="mt-5 divide-y divide-line/50">
                <Line k="Move in" v={p.moveIn ? new Date(p.moveIn).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "-"} />
                <Line k="For" v={p.term ?? "-"} />
                <Line k="Moving in" v={`${p.adults ?? 1} adult${p.adults === 1 ? "" : "s"}${p.children ? `, ${p.children} child${p.children === 1 ? "" : "ren"}` : ""}`} />
                <Line k="Pets" v={p.pets ? `Yes${p.petsNote ? ` - ${p.petsNote}` : ""}` : "No"} />
              </dl>
              {p.note && (
                <div className="mt-5 rounded-[16px] bg-panel p-4">
                  <p className={eyebrow}>For the landlord</p>
                  <p className="mt-1.5 whitespace-pre-line text-[14px] leading-relaxed">{p.note}</p>
                </div>
              )}
            </section>

            <section className={card}>
              <div className="flex items-start justify-between gap-4">
                <p className={eyebrow}>Their passport, as confirmed</p>
                {changes.length > 0 && (
                  <span className={`shrink-0 rounded-full px-3 py-1 text-[11.5px] font-semibold ${changes.some((c) => c.watch) ? "bg-[#fbeee0] text-[#a35a12]" : "bg-panel text-muted"}`}>
                    {changes.length} changed with the offer
                  </span>
                )}
              </div>
              <dl className="mt-3 divide-y divide-line/50">
                {keys.map((k) => {
                  const c = changed.get(k);
                  return (
                    <div key={k} className="flex items-start justify-between gap-4 py-2.5">
                      <dt className="text-[13px] text-muted">{OFFER_FIELDS.find((f) => f.key === k)?.label}</dt>
                      <dd className="text-right">
                        <span className="flex items-center justify-end gap-2">
                          <span className="text-[14px] font-semibold">
                            {show(k, p.passport![k])}
                            {c && <span className="text-[#a35a12]"> *</span>}
                          </span>
                          {c && <Eye watch={c.watch} />}
                        </span>
                        {c && <span className="mt-0.5 block text-[12px] text-muted">was: {c.from}</span>}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              {changes.length > 0 && (
                <p className="mt-4 text-[12px] leading-relaxed text-muted">
                  * Changed by the tenant when they made this offer; their passport has been updated to match. The eye in amber marks a change worth a second look before it goes to the landlord. The tenant does not see these marks.
                </p>
              )}
            </section>
          </div>
        </>
      )}

      {r.kind !== "offer" && (
        <section className={card}>
          {(p.reasons?.length || p.topics?.length) ? (
            <div className="flex flex-wrap gap-2">
              {(p.reasons ?? p.topics ?? []).map((t) => (
                <span key={t} className="rounded-full bg-panel px-3 py-1.5 text-[13px]">{t}</span>
              ))}
            </div>
          ) : null}
          {(p.message || p.note) && <p className="mt-4 whitespace-pre-line text-[14.5px] leading-relaxed">{p.message || p.note}</p>}
        </section>
      )}

      <section className={card}>
        <p className={eyebrow}>The tenant</p>
        <p className="mt-2 text-[16px] font-semibold">{r.name || "-"}</p>
        <a href={`mailto:${r.email}`} className="text-[14px] underline underline-offset-4">{r.email}</a>
        <p className="mt-3 text-[12.5px] text-muted">
          {r.outcome === "sent" ? `Emailed to ${r.sent_to}.` : r.sent_to ? `The email to ${r.sent_to} did not go.` : "No agent email was found for this home."}
        </p>
      </section>
    </div>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-[13px] text-muted">{k}</dt>
      <dd className="text-right text-[14px] font-semibold">{v}</dd>
    </div>
  );
}
