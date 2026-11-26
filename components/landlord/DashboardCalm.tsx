import Link from "next/link";
import PropertyPhoto from "@/components/PropertyPhoto";
import AgentSheet from "@/components/landlord/AgentSheet";
import { AgentLine, Arrow, Row, Tick } from "@/components/landlord/calm";
import Spine from "@/components/landlord/Spine";
import SpinePhone from "@/components/landlord/SpinePhone";
import PhotoTimesTile from "@/components/landlord/PhotoTimesTile";
import { HeroAction, pickHero, signSource } from "@/components/landlord/StepAction";
import PresentTile from "@/components/landlord/PresentTile";
import PropertySheet from "@/components/landlord/PropertySheet";
import MoreActions from "@/components/landlord/MoreActions";
import SignTile from "@/components/landlord/SignTile";
import BeforeMoveIn from "@/components/landlord/BeforeMoveIn";
import { fullJourney } from "@/lib/landlord-journey";
import type { LandlordView } from "@/lib/landlord-view";

/**
 * THE LANDLORD'S HOME, CALM (James, 26 Nov 2026: "rebrand that with the
 * website in mind, with the same design language... this minimalistic style
 * that we're looking to adopt... a little bit easier to follow but also has
 * better theming").
 *
 * Drawn only when the "portals" switch is on (Dashboard.tsx chooses). The
 * same view, the same working parts and the same words as the home it
 * replaces - signing, the presentation, photo times, messages, the phone's
 * sheets are all the components they were. What changes is the order of
 * reading and how much is on the page:
 *
 *   1. Hello, and their agent (one line, not a box).
 *   2. Their home as a photograph with its name on it, beside the ONE next
 *      step on Dark Olive - the only filled panel on the page.
 *   3. The journey, as a line.
 *   4. Everything else as a ledger: the section's name on the left, what it
 *      holds on the right, a hairline between. No row of equal boxes.
 *
 * Nothing here is a figure of its own: every number is read off the view.
 * Styles: app/landlord-calm.css, classes .llh-*.
 */

export default function DashboardCalm({
  view: v,
  upload,
  managed,
}: {
  view: LandlordView;
  upload?: React.ReactNode;
  managed?: React.ReactNode;
}) {
  /* The one next step and the quiet ones under it: the same rule as the classic home. */
  const hero = pickHero(v);
  const others = v.steps.filter(
    (s) =>
      s !== hero &&
      (s.action === "photos"
        ? true
        : s.action === "presentation"
          ? Boolean(v.presentation)
          : s.action === "sign"
            ? Boolean(v.appraisalId || s.href)
            : s.href && !s.action)
  );
  const maintenanceHref = v.steps.find((s) => s.id === "maintenance")?.href ?? "/landlord/maintenance";
  const documentsHref = v.steps.find((s) => s.id === "compliance")?.href ?? "/landlord/documents";
  const stops = fullJourney(v);
  const done = stops.filter((s) => s.state === "done").length;
  const docsIn = v.documents.filter((d) => d.state === "uploaded").length;
  const docsLeft = v.documents.length - docsIn;
  const pct = v.snapshot.readinessPct == null ? null : Math.max(0, Math.min(100, Math.round(v.snapshot.readinessPct)));

  return (
    <div className="llh">
      {/* ── hello, and the expert ── */}
      <div className="llh-top">
        <div className="llh-hello">
          <h1>{v.greeting}</h1>
          <p className="llh-intro">{v.intro}</p>
        </div>
        <AgentLine v={v} />
        {/* On a phone the agent is one button beside the hello, not a chip floating over the page. */}
        <AgentSheet v={v} trigger="inline" />
      </div>

      {/* ── their home, and the one next step ── */}
      <div className="llh-hero">
        <section id="property" className="llh-home" data-photo={v.property.image ? "yes" : "no"} data-search>
          <PropertyPhoto src={v.property.image} alt="" loading="eager" className="llh-home-ph" seed={v.property.address} kind={v.property.facts[0] ?? v.property.address} />
          {!v.property.image && <span className="llh-nophoto">Photos come at take-on</span>}
          <div className="llh-home-tx">
            <p className="llh-label">Your property</p>
            <h2>{v.property.address}</h2>
            {v.property.facts.length > 0 && <p className="llh-facts">{v.property.facts.join("  ·  ")}</p>}
            <div className="llh-home-foot">
              <p className="llh-rent">
                <span>{v.property.rent.caption}</span>
                <b className="figures">{v.property.rent.figure ?? "-"}</b>
                {v.property.rent.figure && <i>{v.property.rent.unit}</i>}
              </p>
              {v.property.valuedOn && (
                <p className="llh-valued">
                  <span>Valued on</span>
                  <b>{v.property.valuedOn}</b>
                </p>
              )}
              <a href="#snapshot" className="llh-more">
                Property details <Arrow />
              </a>
            </div>
            <PropertySheet v={v} />
          </div>
        </section>

        <section className="llh-next" data-search>
          <p className="llh-label">Your next step</p>
          {hero ? (
            <>
              <h2>{hero.label}</h2>
              <p className="llh-next-sub">{hero.sub}</p>
              <div className="llh-next-go">
                <HeroAction s={hero} v={v} />
              </div>
              <MoreActions v={v} others={others} />
              {others.length > 0 && (
                <div className="llh-also">
                  <p className="llh-label">Also</p>
                  <p className="llh-also-links">
                    {others.map((s) =>
                      s.action === "photos" ? (
                        <PhotoTimesTile key={s.id} appraisalId={v.appraisalId ?? null} label={s.label} sub={s.sub} icon={s.icon} variant="link" />
                      ) : s.action === "presentation" && v.presentation ? (
                        <PresentTile key={s.id} variant="link" deck={v.presentation} readToken={v.presentationToken ?? null} sign={signSource(v)} label={s.label} sub={s.sub} icon={s.icon} />
                      ) : s.action === "sign" && (v.appraisalId || s.href) ? (
                        <SignTile key={s.id} variant="link" appraisalId={v.appraisalId ?? null} url={v.appraisalId ? null : s.href} label={s.label} sub={s.sub} icon={s.icon} />
                      ) : s.external ? (
                        <a key={s.id} href={s.href!} target="_blank" rel="noreferrer">{s.label}</a>
                      ) : (
                        <Link key={s.id} href={s.href!}>{s.label}</Link>
                      )
                    )}
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              <h2>All in hand</h2>
              <p className="llh-next-sub">Nothing needs you right now. We&rsquo;ll let you know when something does.</p>
            </>
          )}
        </section>
      </div>

      {/* ── the journey, as a line ── */}
      <Row id="journey" title="Your letting journey" meta={`${done} of ${stops.length} done`}>
        <div className="llh-phone">
          <SpinePhone stops={stops} />
        </div>
        <div className="llh-desk">
          <Spine stops={stops} />
        </div>
      </Row>

      {/* ── the listing, once marketing is live ── */}
      {v.marketing && (
        <Row
          id="listing"
          title="Your listing"
          meta={`${v.marketing.live ? `Live since ${v.marketing.liveSince ?? "today"}` : "Being prepared"}${v.marketing.note ? `  ·  ${v.marketing.note}` : ""}`}
        >
          {v.marketing.photos.length > 0 && (
            <div className="llh-shots">
              {v.marketing.photos.slice(0, 4).map((src, i) => (
                <div key={src + i}>
                  <PropertyPhoto src={src} alt="" className="llh-shot" />
                  {i === 3 && v.marketing!.photos.length > 4 && <span>+{v.marketing!.photos.length - 4} more</span>}
                </div>
              ))}
            </div>
          )}
          {v.marketing.portals.length > 0 && (
            <p className="llh-on">
              <span>Advertised on</span>
              {v.marketing.portals.map((p) =>
                p.href ? (
                  <a key={p.name} href={p.href} target="_blank" rel="noreferrer">{p.name}</a>
                ) : (
                  <b key={p.name}>{p.name}</b>
                )
              )}
            </p>
          )}
        </Row>
      )}

      {/* ── viewings: who has been and what they said ── */}
      {v.viewings && v.viewings.length > 0 && (
        <Row
          id="viewings"
          title="Viewings"
          meta={`${v.viewings.filter((x) => x.state === "booked").length} booked  ·  ${v.viewings.filter((x) => x.state === "done").length} been`}
        >
          <ul className="llh-list">
            {v.viewings.map((x) => (
              <li key={x.id}>
                <span className="llh-when">{x.when}</span>
                <span className="llh-grow">
                  <b>{x.who}</b>
                  {x.feedback && <small>&ldquo;{x.feedback}&rdquo;</small>}
                </span>
                <span className="llh-state" data-state={x.state}>{x.state === "booked" ? "Booked" : x.state === "cancelled" ? "Cancelled" : "Been"}</span>
              </li>
            ))}
          </ul>
        </Row>
      )}

      {/* ── before moving day: the works agreed with the approved offer ── */}
      {v.beforeMoveIn && v.beforeMoveIn.length > 0 && <BeforeMoveIn items={v.beforeMoveIn} sample={v.sample} className="llh-block" />}

      {/* ── the tenancy, once the tenant is in ── */}
      {v.tenancy && (
        <Row id="tenancy" title="Your tenancy" meta={v.tenancy.service ?? "Managed"}>
          <dl className="llh-facts4">
            {(
              [
                ["Tenant", v.tenancy.tenant, v.tenancy.started ? `Since ${v.tenancy.started}` : null],
                ["Rent", v.tenancy.rent, v.tenancy.rentStatus],
                ["Tenancy ends", v.tenancy.ends ?? "Rolling", v.tenancy.renewal],
                ["Deposit", v.tenancy.deposit ?? "Not recorded", v.tenancy.agreementSigned ? `Agreement signed ${v.tenancy.agreementSigned}` : null],
              ] as Array<[string, string, string | null]>
            ).map(([k, val, sub]) => (
              <div key={k}>
                <dt className="llh-label">{k}</dt>
                <dd>
                  <b>{val}</b>
                  {sub && <small>{sub}</small>}
                </dd>
              </div>
            ))}
          </dl>
          {v.tenancy.agreementHref && (
            <a href={v.tenancy.agreementHref} target="_blank" rel="noreferrer" className="llh-link">
              Open the tenancy agreement <Arrow />
            </a>
          )}
        </Row>
      )}

      {/* ── the let, step by step (once a deal exists) ── */}
      {v.progress && (
        <Row
          id="progress"
          title="Your let, step by step"
          meta={`${v.progress.tenants}${v.progress.moveIn ? `  ·  moving in ${new Date(v.progress.moveIn).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}` : ""}${v.progress.rentPcm != null ? `  ·  £${Math.round(v.progress.rentPcm).toLocaleString("en-GB")} per month` : ""}`}
        >
          <ol className="llh-steps">
            {v.progress.stages.map((s, i) => (
              <li key={s.key} data-state={s.state}>
                <span className="llh-step-n">{s.state === "done" ? <Tick /> : i + 1}</span>
                <span className="llh-step-l">{s.label}</span>
              </li>
            ))}
          </ol>
          <div className="llh-now">
            <div>
              <p className="llh-label">Now</p>
              <p>{v.progress.now}</p>
            </div>
            <div>
              <p className="llh-label">What happens next</p>
              <p>{v.progress.next}</p>
            </div>
          </div>
        </Row>
      )}

      {/* ── documents ── */}
      <Row
        id="documents"
        title="Your documents"
        meta={v.documentsUnavailable ? undefined : `${docsIn} of ${v.documents.length} on file`}
        className="llh-docs"
      >
        {v.documentsUnavailable ? (
          <p className="llh-note">{v.documentsUnavailable}</p>
        ) : (
          <div className="llh-phone llh-docs-sum">
            <div>
              <p>{docsLeft === 0 ? "Everything we need is on your file." : `${docsLeft} still to send.`}</p>
              <span className="llh-bar"><span style={{ width: `${v.documents.length ? (docsIn / v.documents.length) * 100 : 0}%` }} /></span>
            </div>
            {docsLeft > 0 && <Link href={documentsHref} className="llh-btn">Upload</Link>}
          </div>
        )}
        <div className="llh-desk llh-docs-grid">
          <ul className="llh-list">
            {v.documents.map((d) => (
              <li key={d.title}>
                <span className="llh-mark" data-state={d.state} aria-hidden>{d.state === "uploaded" ? <Tick /> : null}</span>
                <span className="llh-grow">
                  {d.href ? (
                    <a href={d.href} target="_blank" rel="noreferrer"><b>{d.title}</b></a>
                  ) : (
                    <b>{d.title}</b>
                  )}
                </span>
                <span className="llh-doc-sub" data-state={d.state}>{d.sub}</span>
              </li>
            ))}
          </ul>
          {upload && <div className="llh-upload">{upload}</div>}
        </div>
      </Row>

      {/* ── maintenance: what is open once let; before that, what this becomes ── */}
      {v.maintenance ? (
        <Row id="maintenance" title="Maintenance" meta={`${v.maintenance.open} open`}>
          <div className="llh-mnt">
            <div>
              <p className="llh-big" data-needs={v.maintenance.needsYou ? "you" : undefined}>{v.maintenance.headline}</p>
              <p className="llh-note">{v.maintenance.sub}</p>
            </div>
            <dl className="llh-pair">
              <div>
                <dt className="llh-label">Open jobs</dt>
                <dd className="figures">{v.maintenance.open}</dd>
              </div>
              <div>
                <dt className="llh-label">Next visit</dt>
                <dd>{v.maintenance.nextVisit ?? "None booked"}</dd>
              </div>
            </dl>
            <Link href={maintenanceHref} className="llh-link">
              Open maintenance <Arrow />
            </Link>
          </div>
        </Row>
      ) : (
        <Row id="maintenance" title="After your property is let">
          <p className="llh-note">This portal will also be your maintenance hub. You&rsquo;ll be able to:</p>
          <ul className="llh-ticks">
            {["Report maintenance requests", "Track ongoing works", "View certificates and compliance"].map((t) => (
              <li key={t}>
                <Tick />
                {t}
              </li>
            ))}
          </ul>
        </Row>
      )}

      {/* ── the property's details (on a phone these are in the sheet behind "View property details") ── */}
      <Row id="snapshot" title="Property details" meta={pct == null ? undefined : `${pct}% ready`} className="llh-desk-row">
        <dl className="llh-details">
          {v.snapshot.lines.map(([k, val]) => (
            <div key={k}>
              <dt className="llh-label">{k}</dt>
              <dd>{val}</dd>
            </div>
          ))}
        </dl>
        {pct != null && pct < 100 && <span className="llh-bar llh-bar-wide"><span style={{ width: `${pct}%` }} /></span>}
        <p className="llh-note">{v.snapshot.note}</p>
      </Row>

      {managed && <div className="llh-managed">{managed}</div>}
    </div>
  );
}
