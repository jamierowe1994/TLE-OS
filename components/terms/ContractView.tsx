"use client";

import type { Block, LandlordDetails, TermsDoc, TermsValues } from "@/lib/terms/types";

/**
 * The contract written out as a page (James, 23 Oct 2026: "take this
 * contract and write it down on the site that they open"). The same data as
 * the HTML DocuSeal signs (lib/terms/render-html), drawn for reading: one
 * column, the clauses numbered as the contract numbers them, and each
 * person's own details where the contract carries them.
 *
 * Only the reader's own details are shown in full. Anybody else signing is
 * named, never their address or bank account.
 */

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

export type Reader = {
  key: string;
  details: Partial<LandlordDetails>;
};

export default function ContractView({
  doc,
  values,
  people,
  reader,
}: {
  doc: TermsDoc;
  values: TermsValues;
  people: Array<{ key: string; name: string; signed: boolean; you: boolean }>;
  reader: Reader;
}) {
  const label = (k: keyof LandlordDetails) => doc.details.find((d) => d.key === k)?.label ?? k;

  const block = (b: Block, i: number) => {
    switch (b.kind) {
      case "p":
        return <p key={i}><Rich text={b.text} v={values} /></p>;
      case "h":
        return <h4 key={i} className="nl-ct-h"><Rich text={b.text} v={values} /></h4>;
      case "list":
        return <ul key={i}>{b.items.map((t, j) => <li key={j}><Rich text={t} v={values} /></li>)}</ul>;
      case "facts":
        return (
          <dl key={i} className="nl-ct-facts">
            {b.rows.map((r) => (
              <div key={r.label}><dt>{r.label}</dt><dd><Rich text={r.value} v={values} /></dd></div>
            ))}
          </dl>
        );
      case "landlords":
        return (
          <div key={i} className="nl-ct-people">
            {people.map((p, n) => (
              <dl key={p.key} className={`nl-ct-facts${p.you ? " is-you" : ""}`}>
                {people.length > 1 && <div className="nl-ct-who"><dt>Landlord {n + 1}</dt><dd>{p.you ? "You" : p.name}</dd></div>}
                {p.you ? (
                  b.fields.map((k) => {
                    const v = (reader.details[k] ?? "").toString().trim();
                    return (
                      <div key={k}><dt>{label(k)}</dt><dd className={v ? "" : "is-missing"}>{v ? (k === "accountNumber" ? `•••• ${v.slice(-4)}` : v) : "You'll add this before you sign"}</dd></div>
                    );
                  })
                ) : (
                  <div><dt>{b.fields.includes("name") ? "Name" : "Their details"}</dt><dd>{b.fields.includes("name") ? p.name : "Filled in by them"}</dd></div>
                )}
              </dl>
            ))}
          </div>
        );
      case "fees":
        return (
          <dl key={i} className="nl-ct-facts">
            <div><dt>Service level</dt><dd>{values.serviceLevel}</dd></div>
            <div><dt>Set-up / tenant find fee</dt><dd>{values.setUpFee}</dd></div>
            <div><dt>Management / rent collection fee</dt><dd>{values.managementFee}</dd></div>
            <div><dt>Additional fees agreed</dt><dd>{values.additionalFees || "None"}</dd></div>
          </dl>
        );
      case "table":
        return (
          <div key={i} className="nl-ct-table">
            <table>
              <thead><tr>{b.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {b.rows.map((r, j) => (
                  <tr key={j}>{r.map((c, k) => <td key={k}>{k > 0 && c === "Yes" ? <span className="nl-ct-yes" aria-label="Yes">✓</span> : <Rich text={c} v={values} />}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case "signatures":
        return (
          <div key={i} className="nl-ct-signs">
            <div><span className="nl-meta">For The Letting Experts</span><b>{values.agentName}</b><span className="nl-ct-signed">Signed</span></div>
            {people.map((p) => (
              <div key={p.key}><span className="nl-meta">{p.you ? "You" : "Landlord"}</span><b>{p.name}</b><span className={p.signed ? "nl-ct-signed" : "nl-meta"}>{p.signed ? "Signed" : p.you ? "Signs at the end" : "Not signed yet"}</span></div>
            ))}
          </div>
        );
      case "waiver":
        return (
          <div key={i} className="nl-ct-waiver">
            <p><Rich text={b.text} v={values} /></p>
            <p className="nl-meta">You choose this when you sign. If you leave it, we start once the cancellation period is over.</p>
          </div>
        );
    }
  };

  return (
    <article className="nl-ct">
      {doc.sections.map((s) => (
        <section key={`${s.n ?? ""}${s.title}`} id={`clause-${s.n ?? s.title.toLowerCase().replace(/\W+/g, "-")}`}>
          <h3 className="nl-ct-title">{s.n && <span className="nl-mono">{s.n}</span>}{s.title}</h3>
          {s.blocks.map(block)}
        </section>
      ))}
    </article>
  );
}
