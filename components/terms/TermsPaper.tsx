"use client";

import type { Block, LandlordDetails, TermsDoc, TermsValues } from "@/lib/terms/types";

/**
 * THE TERMS OF BUSINESS AS A PAGE, in James's design (Claude Design, 24 Oct
 * 2026: "take our contract and input this into these HTMLs").
 *
 * The same contract as ever (lib/terms: the October 2026 England or Scotland
 * wording, rendered for DocuSeal by lib/terms/render-html), drawn the way the
 * design draws its paper: a letterhead, numbered clauses in clay, label and
 * value rows, the "start during the cancellation period" choice in its own grey
 * box, and the signatures side by side with each person's ink in them.
 *
 * Shared by the agent's send screen (components/terms/TermsSendScreen) and the
 * landlord's signing page (app/sign/[token]). The caller supplies what is
 * live: a detail being checked, the choice buttons, the "tap to sign" in the
 * reader's own box. Anchors for jumping to: ts-you (their details), ts-cool
 * (the choice), ts-sign (the signatures), ts-sig-agent and ts-sig-<key>.
 */

export type PaperPerson = {
  key: string;
  name: string;
  details?: Partial<LandlordDetails>;
  /** Their ink, a data URL, once they have signed. */
  signature?: string | null;
  /** "24 October 2026", once they have signed. */
  signedOn?: string | null;
  /** The reader: their box is the one lit up. */
  you?: boolean;
};

const fill = (text: string, v: TermsValues) =>
  text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => String((v as unknown as Record<string, string>)[k] ?? ""));

/** Text that may carry <strong> and <em>, and nothing else. */
function Rich({ text, v }: { text: string; v: TermsValues }) {
  const parts = fill(text, v).split(/(<\/?(?:strong|em)>)/);
  const out: React.ReactNode[] = [];
  let bold = false;
  let em = false;
  parts.forEach((p, i) => {
    if (p === "<strong>") bold = true;
    else if (p === "</strong>") bold = false;
    else if (p === "<em>") em = true;
    else if (p === "</em>") em = false;
    else if (p) {
      const node = em ? <em key={i}>{p}</em> : <span key={i}>{p}</span>;
      out.push(bold ? <strong key={`b${i}`}>{node}</strong> : node);
    }
  });
  return <>{out}</>;
}

const Row = ({ dt, children }: { dt: React.ReactNode; children: React.ReactNode }) => (
  <div>
    <dt>{dt}</dt>
    <dd>{children}</dd>
  </div>
);

export const Blank = ({ children }: { children: React.ReactNode }) => <span className="blank">{children}</span>;

export default function TermsPaper({
  doc,
  values,
  reference,
  people,
  agent,
  you,
  detail,
  coolSlot,
  coolChoice,
  signSlot,
}: {
  doc: TermsDoc;
  values: TermsValues;
  /** Printed top right, e.g. the contract's id. */
  reference?: string | null;
  people: PaperPerson[];
  agent: { signature?: string | null; signedOn?: string | null };
  /** Whose page this is: the agent sending, or a landlord signing. */
  you: "agent" | "landlord";
  /** Draws one landlord's detail (to highlight it, mark it checked, or ask for it); default is the value or a blank. */
  detail?: (person: PaperPerson, key: keyof LandlordDetails, value: string) => React.ReactNode;
  /** The reader's own answer to starting early, as buttons; otherwise their choice (or a blank) is printed. */
  coolSlot?: React.ReactNode;
  coolChoice?: boolean | null;
  /** Inside the reader's signature box, before they have signed: "Tap to sign here". */
  signSlot?: React.ReactNode;
}) {
  const label = (k: keyof LandlordDetails) => doc.details.find((d) => d.key === k)?.label ?? k;
  const [titleA, titleB] = doc.title.includes(" & ") ? doc.title.split(" & ") : [doc.title, ""];
  const showDetail = (p: PaperPerson, k: keyof LandlordDetails) => {
    const v = (p.details?.[k] ?? "").toString().trim();
    if (detail) return detail(p, k, v);
    return v ? (k === "accountNumber" ? `•••• ${v.slice(-4)}` : v) : <Blank>{you === "agent" ? "They add this when they sign" : "Add this before you sign"}</Blank>;
  };

  const block = (b: Block, i: number) => {
    switch (b.kind) {
      case "p":
        return <p key={i}><Rich text={b.text} v={values} /></p>;
      case "h":
        return <h3 key={i} className="t-sub"><Rich text={b.text} v={values} /></h3>;
      case "list":
        return <ul key={i}>{b.items.map((t, j) => <li key={j}><Rich text={t} v={values} /></li>)}</ul>;
      case "facts":
        return (
          <dl key={i} className="t-tbl">
            {b.rows.map((r) => <Row key={r.label} dt={r.label}><Rich text={r.value} v={values} /></Row>)}
          </dl>
        );
      case "landlords":
        return (
          <div key={i} id="ts-you">
            {people.map((p, n) => (
              <dl key={p.key} className="t-tbl">
                {people.length > 1 && <Row dt={`Landlord ${n + 1}`}>{p.you ? "You" : p.name}</Row>}
                {/* Only the reader's own details in full; anybody else signing is named, never their address. */}
                {p.you || you === "agent"
                  ? b.fields.map((k) => <Row key={k} dt={label(k)}>{showDetail(p, k)}</Row>)
                  : <Row dt="Name">{p.name}</Row>}
              </dl>
            ))}
          </div>
        );
      case "fees":
        return (
          <dl key={i} className="t-tbl">
            <Row dt="Service level">{values.serviceLevel}</Row>
            <Row dt="Set-up / tenant find fee">{values.setUpFee}</Row>
            <Row dt="Management / rent collection fee">{values.managementFee}</Row>
            <Row dt="Additional fees agreed">{values.additionalFees || "None"}</Row>
          </dl>
        );
      case "table":
        return (
          <div key={i} className="t-grid">
            <table>
              <thead><tr>{b.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {b.rows.map((r, j) => (
                  <tr key={j}>{r.map((c, k) => <td key={k}>{k > 0 && c === "Yes" ? <span className="t-yes" aria-label="Yes">✓</span> : <Rich text={c} v={values} />}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case "waiver":
        return (
          <section key={i} className="t-cool" id="ts-cool">
            <p><Rich text={b.text} v={values} /></p>
            {coolSlot ?? (
              <p className="t-choice">
                {coolChoice == null ? (
                  <Blank>{you === "agent" ? "The landlord chooses when they sign" : "You choose this when you sign"}</Blank>
                ) : coolChoice ? (
                  <><b>Yes, start straight away.</b> If I cancel after work has started, I pay for what has been done.</>
                ) : (
                  <b>No, wait until the cancellation period is over.</b>
                )}
              </p>
            )}
          </section>
        );
      case "signatures":
        return (
          <div key={i} className="t-sigs" id="ts-sign">
            <div className={`t-sig${agent.signature ? " done" : ""}${you === "agent" ? " you" : ""}`} id="ts-sig-agent">
              <small>Signed for and on behalf of The Letting Experts</small>
              <div className="ink">{agent.signature ? <img src={agent.signature} alt="Signature" /> : <em>Signature</em>}</div>
              <dl className="t-tbl">
                <Row dt="Name">{values.agentName}</Row>
                <Row dt="Date">{agent.signedOn || <Blank>When you sign</Blank>}</Row>
              </dl>
            </div>
            {people.map((p, n) => (
              <div key={p.key} className={`t-sig${p.signature ? " done" : ""}${p.you ? " you" : ""}`} id={`ts-sig-${p.key}`}>
                <small>{people.length > 1 ? `Signed by landlord ${n + 1}` : "Signed by the landlord"}</small>
                <div className="ink">
                  {p.signature ? <img src={p.signature} alt="Signature" /> : p.you && signSlot ? signSlot : <em>{p.signedOn ? "Signed" : p.you ? "Your signature" : `${p.name} signs ${you === "agent" ? "after you" : "here"}`}</em>}
                </div>
                <dl className="t-tbl">
                  <Row dt="Name">{p.name}</Row>
                  <Row dt="Date">{p.signedOn || <Blank>When they sign</Blank>}</Row>
                </dl>
              </div>
            ))}
          </div>
        );
    }
  };

  return (
    <div className="tsp">
      <article className="terms">
        <header className="t-head">
          <span className="t-brand">
            <img src="/brand/tle-logo-line.png" alt="The Letting Experts" className="t-logo" />
          </span>
          {reference ? <span className="t-ref">Ref {reference}</span> : null}
        </header>
        <h1 className="t-title">
          {titleA} {titleB ? <span>&amp; {titleB}</span> : null}
        </h1>
        <p className="t-lede">
          {values.propertyAddress} · {doc.subtitle} · {doc.edition} edition
        </p>
        {doc.sections.map((s, k) => (
          <section key={`${s.n ?? ""}${s.title}`} id={`ts-s${k}`}>
            <h2>
              {s.n ? <i>{s.n}</i> : null}
              {s.title}
            </h2>
            {s.blocks.map(block)}
          </section>
        ))}
        <footer className="t-foot">
          <span>The Letting Experts</span>
          <span>{doc.title}</span>
        </footer>
      </article>
    </div>
  );
}
