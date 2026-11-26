import PropertyPhoto from "@/components/PropertyPhoto";
import { CalmHead, Row, Tick } from "@/components/landlord/calm";
import QrHandoff from "@/components/landlord/QrHandoff";
import UploadDoc from "@/components/landlord/UploadDoc";
import type { DocRow, DocsView } from "@/lib/landlord-documents-view";
import type { LandlordView } from "@/lib/landlord-view";

/**
 * THE DOCUMENTS PAGE, CALM (26 Nov 2026; the home is DashboardCalm). The same
 * view, words and working parts as the classic page (DocumentsView); drawn
 * when the "portals" switch is on.
 *
 * How many are still to send, on Dark Olive, as a count and a bar; beside it
 * the ones we need, each row with its own upload. Then the ledger: what they
 * have sent, what has come from us, and each property's certificates with
 * their dates. Every Open is a real file and every Send files to their record,
 * exactly as before.
 */
export default function DocumentsViewCalm({ view: v, docs: d, sample = false }: { view: LandlordView; docs: DocsView; sample?: boolean }) {
  const allIn = d.needed.length === 0;
  const pct = d.progress.total ? Math.round((d.progress.have / d.progress.total) * 100) : 100;
  return (
    <div className="llh">
      <CalmHead v={v} title="Your documents" intro="Everything we hold on your file, and what we still need from you." />

      {/* ── what we need ── */}
      <div className="llp-split">
        <section className="llh-next llp-count" data-search>
          <p className="llh-label">What we need from you</p>
          <h2>{d.progress.total === 0 ? "Nothing to send" : allIn ? "Everything we need is in" : `${d.needed.length} still to send`}</h2>
          <p className="llh-next-sub">
            {d.progress.total === 0
              ? "Your properties with us are let, so there is nothing to send for now."
              : allIn
                ? "Thank you. Your agent has what the let needs."
                : `${d.progress.have} of ${d.progress.total} in. A photo from your phone is fine; a PDF is better.`}
          </p>
          {d.progress.total > 0 && (
            <span className="llh-bar llp-bar" role="img" aria-label={`${d.progress.have} of ${d.progress.total} in`}>
              <span style={{ width: `${pct}%` }} />
            </span>
          )}
        </section>

        <section className="llp-side" data-search>
          <div className="llp-side-h">
            <h2>{allIn ? "Nothing waiting" : "Still to send"}</h2>
            {/* The desk has no camera: one scan hands the job to the phone in their pocket. Not on a phone, which is the camera. */}
            {d.needed.length > 0 && (
              <div className="llh-desk">
                <QrHandoff sample={sample} />
              </div>
            )}
          </div>
          {d.needed.length > 0 ? (
            <ul className="llh-list llp-docs">
              {d.needed.map((r) => (
                <li key={r.title}>
                  <span className="llh-mark" data-state="missing" aria-hidden />
                  <span className="llh-grow">
                    <b>{r.title}</b>
                    <small>{r.sub}</small>
                  </span>
                  <UploadDoc kind={r.kind ?? "other"} title={r.title} appraisalId={d.appraisalId} sample={sample} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="llh-note">{d.progress.total === 0 ? "There is nothing for you to send." : "Everything the let needs is on your file."}</p>
          )}
        </section>
      </div>

      {/* ── sent to us ── */}
      <Row title="Sent to us" meta={d.sent.length ? `${d.sent.length} on file` : undefined}>
        {d.sent.length === 0 ? (
          <p className="llh-note">Nothing yet. What you send lands here, with the day it arrived.</p>
        ) : (
          <ul className="llh-list llp-docs">
            {d.sent.map((r) => (
              <DocLine key={r.title + r.sub} r={r} />
            ))}
          </ul>
        )}
        <div className="llp-else">
          <p>Something else for the file?</p>
          <UploadDoc kind="other" title="Something else" appraisalId={d.appraisalId} sample={sample} label="Add a document" tone="light" />
        </div>
      </Row>

      {/* ── from us ── */}
      {d.fromUs.length > 0 && (
        <Row title="From us">
          <ul className="llh-list llp-docs">
            {d.fromUs.map((r) => (
              <DocLine key={r.title + r.sub} r={r} />
            ))}
          </ul>
        </Row>
      )}

      {/* ── the properties we look after, and their certificates ── */}
      {d.properties.map((p) => (
        <section key={p.name} className="llh-row" data-search>
          <div className="llh-row-h">
            <span className="llp-thumb">
              <PropertyPhoto src={p.image} className="llp-thumb-ph" />
            </span>
            <h2>{p.name}</h2>
            <p className="llh-meta">{p.locality}</p>
            <p className="llh-state llp-head-state" data-state={p.allInDate ? "done" : "due"}>{p.headline}</p>
          </div>
          <div className="llh-row-b">
            {p.unavailable ? (
              <p className="llh-note">We couldn&apos;t load this property&apos;s certificates just now. Please try again in a few minutes.</p>
            ) : p.certs.length === 0 ? (
              <p className="llh-note">Its certificates are being read from your file.</p>
            ) : (
              <ul className="llh-list llp-docs">
                {p.certs.map((r) => (
                  <DocLine key={r.title} r={r} upload={{ appraisalId: d.appraisalId, sample }} />
                ))}
              </ul>
            )}
            <p className="llh-note llp-after">
              We arrange renewals before they fall due. If your own engineer does one, send us the new certificate from its row. If a date here looks wrong, message {v.agent ? v.agent.name.split(/\s+/)[0] : "your agent"}.
            </p>
          </div>
        </section>
      ))}

      {/* What this page becomes once the property is let. Words about the future, not a button that pretends. */}
      {d.properties.length === 0 && (
        <Row title="Once your property is let">
          <p className="llh-note">Its certificates live here, with their dates, and we arrange each renewal before it falls due:</p>
          <ul className="llh-ticks">
            {["Gas safety, every year", "Electrical safety (EICR), every five years", "Energy Performance Certificate, every ten"].map((t) => (
              <li key={t}>
                <Tick />
                {t}
              </li>
            ))}
          </ul>
        </Row>
      )}

      <p className="llp-foot-note">Your documents are kept on your own file, in the UK, and only your letting agent sees them. Nothing is shared with a tenant.</p>
    </div>
  );
}

/** One document: its state, its name, and the way to open it - or, for a certificate that is due, the way to send the new one. */
function DocLine({ r, upload }: { r: DocRow; upload?: { appraisalId: string | null; sample: boolean } }) {
  const ok = r.state === "uploaded";
  const missing = r.state === "missing";
  const watch = r.state === "watch";
  return (
    <li>
      <span className="llh-mark" data-state={ok ? "uploaded" : missing || watch ? "missing" : "waiting"} title={ok ? "On file" : missing ? "Missing" : watch ? "Due soon" : "On its way"}>
        {ok ? <Tick /> : null}
      </span>
      <span className="llh-grow">
        <b>{r.title}</b>
        <small data-state={missing ? "missing" : undefined}>{r.sub}</small>
      </span>
      {upload && r.kind && r.state !== "uploaded" && <UploadDoc kind={r.kind} title={r.title} appraisalId={upload.appraisalId} sample={upload.sample} label="Send the new one" tone="light" />}
      {r.href && (
        <a href={r.href} target={r.href.startsWith("http") || r.href.startsWith("/present") ? "_blank" : undefined} rel="noreferrer" className={r.cta === "Sign" ? "llh-btn llp-sm" : "llh-link llp-sm"}>
          {r.cta ?? "Open"}
        </a>
      )}
    </li>
  );
}
