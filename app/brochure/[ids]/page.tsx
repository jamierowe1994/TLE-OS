import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { switchOn } from "@/lib/switches";
import { brochureFor, type Brochure, type BrochureRead } from "@/lib/viewing-brochure";
import PrintBar from "./PrintBar";
import "./brochure.css";

/**
 * THE VIEWING BROCHURE, ON PAPER (Erleta Vathej, ticket 47b2389c; James,
 * 10 Nov 2026: "a printable A4 brochure, with no landlord details").
 *
 *   /brochure/846033            one listing's brochure
 *   /brochure/846033,846101     a day's homes, one after another (the Diary)
 *
 * The page draws the sheets and opens the print dialog once the photos have
 * loaded (PrintBar); ?auto=0 leaves the dialog shut. Every fact is read live
 * from the listing (lib/viewing-brochure) and only what is chosen there is
 * drawn - never the landlord, never the house number. A listing that is not
 * live, or did not read, is named on screen and left off the paper.
 *
 * Behind the "Print a brochure for viewings" switch (listing_brochure). The
 * door (middleware) already wants a session; it is asked again here so a
 * locked account gets nothing.
 */

export const dynamic = "force-dynamic";

const MAX = 12;

function ids(raw: string): number[] {
  const out = decodeURIComponent(raw)
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0 && n < 1e9);
  return [...new Set(out)].slice(0, MAX);
}

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <main className="br-screen">
      <div className="br-notice">
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
    </main>
  );
}

function Sheet({ b }: { b: Brochure }) {
  const [hero, ...more] = b.photos;
  const facts: [string, string][] = (
    [
      ["Bedrooms", b.beds != null ? String(b.beds) : null],
      ["Bathrooms", b.baths != null ? String(b.baths) : null],
      ["Type", b.propertyType],
      ["Available", b.available],
      ["EPC", b.epc ? (b.epc.length === 1 ? `Band ${b.epc}` : b.epc) : null],
    ] as [string, string | null][]
  ).filter((f): f is [string, string] => Boolean(f[1]));
  const words = b.paragraphs.join(" ").length + b.features.join(" ").length;
  return (
    <article className={`br-sheet${words > 1700 ? " is-long" : ""}`}>
      <header className="br-top">
        <span className="br-mark">The Letting Experts</span>
        <span className="br-tag">To Let</span>
      </header>

      {hero && (
        <div className="br-hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={hero} alt="" data-br-photo />
        </div>
      )}
      {more.length > 0 && (
        <div className="br-thumbs" style={{ gridTemplateColumns: `repeat(${more.length}, minmax(0, 1fr))` }}>
          {more.map((src) => (
            <div key={src} className="br-thumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" data-br-photo />
            </div>
          ))}
        </div>
      )}

      <div className="br-title">
        <div className="br-title-text">
          <h1>{b.place || "To Let"}</h1>
          {b.town && <p className="br-town">{b.town}</p>}
        </div>
        {b.rent && <p className="br-rent">{b.rent}</p>}
      </div>

      {facts.length > 0 && (
        <dl className="br-facts" style={{ gridTemplateColumns: `repeat(${facts.length}, minmax(0, 1fr))` }}>
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className={`br-body${b.features.length ? "" : " is-solo"}`}>
        <div className="br-write">
          {b.heading && <h2>{b.heading}</h2>}
          {b.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        {b.features.length > 0 && (
          <aside className="br-features">
            <h3>Key Features</h3>
            <ul>
              {b.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </aside>
        )}
      </div>

      <footer className="br-foot">
        <div className="br-contact">
          <h3>Arrange a Viewing</h3>
          {b.agent.name && <p className="br-agent">{b.agent.name}</p>}
          <p>
            <span>Office</span> {b.agent.officePhone}
          </p>
          {b.agent.email && (
            <p>
              <span>Email</span> {b.agent.email}
            </p>
          )}
        </div>
        <p className="br-small">
          These particulars are a guide only and do not form part of any offer or contract. Photographs and descriptions are for illustration; please check anything that matters to you at the viewing.
        </p>
      </footer>
    </article>
  );
}

export default async function BrochurePage({ params, searchParams }: { params: Promise<{ ids: string }>; searchParams: Promise<{ auto?: string }> }) {
  const [{ ids: raw }, sp] = await Promise.all([params, searchParams]);
  const uid = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  const me = uid ? await findUserById(uid).catch(() => null) : null;
  if (!me || me.locked) redirect("/sign-in");

  if (!(await switchOn("listing_brochure"))) {
    return <Notice title="Print Brochure Isn't Switched On" text="It is turned on in Admin, under the switches. Nothing has been printed." />;
  }
  const list = ids(raw);
  if (!list.length) notFound();

  const reads: { id: number; read: BrochureRead }[] = await Promise.all(list.map(async (id) => ({ id, read: await brochureFor(id) })));
  const good = reads.filter((r): r is { id: number; read: { ok: true; brochure: Brochure } } => r.read.ok);
  const left = reads.filter((r) => !r.read.ok).map((r) => ({ id: r.id, why: r.read.ok ? "" : r.read.error }));

  if (!good.length) {
    return (
      <Notice
        title={list.length === 1 ? "This Brochure Can't Be Printed" : "These Brochures Can't Be Printed"}
        text={left.map((l) => l.why).filter((w, i, a) => a.indexOf(w) === i).join(" ") || "The listing did not read."}
      />
    );
  }

  return (
    <main className="br-screen">
      <PrintBar count={good.length} auto={sp.auto !== "0"} left={left} />
      {good.map((g) => (
        <Sheet key={g.id} b={g.read.brochure} />
      ))}
    </main>
  );
}
