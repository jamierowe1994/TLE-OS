"use client";

import { Fragment, useState } from "react";
import { NOTICE, type Block, type Filled, type Part, type Run } from "@/lib/rent-increase-notice-text";

/**
 * The rent-increase notice on the send screen, as the tenant will read it
 * (components/rent-review/RentReviewScreen). The same words as the PDF
 * (lib/rent-increase-notice-text), drawn as sheets of paper: Parts 1 and 2a,
 * Part 2b, Part 3, then the guidance notes, which print word for word and are
 * folded here so the agent's eye stays on what they are filling in.
 *
 * A blank the agent has filled is marked; one still to fill is hatched, so
 * what is left to do can be seen on the paper itself.
 */

type Sheet = { id: Part; label: string; blocks: Block[] };

/* Parts 1 and 2a share a sheet, as on the agents' own notices; every
   "page" block starts the next one. */
function sheets(): Sheet[] {
  const out: Sheet[] = [];
  for (const s of NOTICE) {
    const blocks = s.blocks.filter((b) => b.k !== "page");
    const fresh = s.blocks[0]?.k === "page" || !out.length;
    if (fresh) out.push({ id: s.id, label: s.label, blocks });
    else out[out.length - 1].blocks.push(...blocks);
  }
  return out;
}
const SHEETS = sheets();

function RunView({ r, filled, flash }: { r: Run; filled: Filled; flash: string | null }) {
  if (typeof r === "string") return <>{r}</>;
  if ("b" in r) return <b>{r.b}</b>;
  if ("i" in r) return <i>{r.i}</i>;
  if ("bi" in r) return <b><i>{r.bi}</i></b>;
  if ("fn" in r) return <sup>{r.fn}</sup>;
  const v = filled[r.v].join(", ");
  return v ? <span className={`rrv-fld${flash === r.v ? " is-flash" : ""}`}>{v}</span> : <span className="rrv-fld is-empty">to fill in</span>;
}

const Runs = ({ runs, filled, flash }: { runs: Run[]; filled: Filled; flash: string | null }) => (
  <>{runs.map((r, i) => <RunView key={i} r={r} filled={filled} flash={flash} />)}</>
);

function BlockView({ b, filled, flash }: { b: Block; filled: Filled; flash: string | null }) {
  switch (b.k) {
    case "title":
      return <h3 className="rrv-p-title">{b.text}</h3>;
    case "subtitle":
      return <h4 className="rrv-p-sub">{b.text}</h4>;
    case "p":
      return <p className={`${b.bold ? "rrv-b" : ""}${b.size === "big" ? " rrv-big" : ""}`}><Runs runs={b.runs} filled={filled} flash={flash} /></p>;
    case "value": {
      const lines = filled[b.v];
      return (
        <p className="rrv-val">
          {lines.length ? lines.map((l, i) => <span key={i} className={`rrv-fld${flash === b.v ? " is-flash" : ""}`}>{l}</span>) : <span className="rrv-fld is-empty">to fill in</span>}
        </p>
      );
    }
    case "bullets":
      return <ul className={b.indent ? "is-in" : ""}>{b.items.map((it, i) => <li key={i}><Runs runs={it} filled={filled} flash={flash} /></li>)}</ul>;
    case "numbered":
      return (
        <ol>
          {b.items.map((it, i) => (
            <li key={i} className={it.n.startsWith(" ") ? "is-in" : ""}>
              <span className="rrv-n">{it.n.trim()}</span>
              <span><Runs runs={it.runs} filled={filled} flash={flash} /></span>
            </li>
          ))}
        </ol>
      );
    case "check":
      return (
        <div className="rrv-chk">
          <span className="rrv-box" aria-label={b.ticked ? "Ticked" : "Not ticked"}>{b.ticked ? "X" : ""}</span>
          <div>
            <p><Runs runs={b.runs} filled={filled} flash={flash} /></p>
            {(b.sub ?? []).map((s, i) => <p key={i}><Runs runs={s} filled={filled} flash={flash} /></p>)}
          </div>
        </div>
      );
    case "sign": {
      const v = filled[b.v].join(", ");
      return (
        <p className="rrv-sign">
          <span><Runs runs={b.runs} filled={filled} flash={flash} /></span>
          <span className={`rrv-sign-line${b.v === "signature" ? " is-sig" : ""}`}>
            {v ? <span className={`rrv-fld${flash === b.v ? " is-flash" : ""}`}>{v}</span> : <span className="rrv-fld is-empty">to sign</span>}
          </span>
        </p>
      );
    }
    case "rule":
      return <hr />;
    case "footnote":
      return null;
    case "page":
      return null;
  }
}

export default function NoticePaper({ filled, flash, sheetRef }: { filled: Filled; flash: string | null; sheetRef?: (id: Part, el: HTMLElement | null) => void }) {
  const [notes, setNotes] = useState(false);
  const main = SHEETS.filter((s) => s.id !== "landlords" && s.id !== "tenants");
  const guidance = SHEETS.filter((s) => s.id === "landlords" || s.id === "tenants");
  return (
    <div className="rrv-paper">
      {main.map((s) => (
        <article key={s.id} className="rrv-sheet" ref={(el) => sheetRef?.(s.id, el)} aria-label={s.label}>
          {s.blocks.map((b, i) => <BlockView key={i} b={b} filled={filled} flash={flash} />)}
        </article>
      ))}
      <div className="rrv-notes-fold">
        <button type="button" className="rrv-linkbtn" onClick={() => setNotes((n) => !n)} aria-expanded={notes}>
          {notes ? "Hide the guidance notes" : "Show the guidance notes"}
        </button>
        <span> The official notes for landlords and for tenants print after Part 3, word for word.</span>
      </div>
      {notes &&
        guidance.map((s) => (
          <article key={s.id} className="rrv-sheet is-notes" ref={(el) => sheetRef?.(s.id, el)} aria-label={s.label}>
            {s.blocks.map((b, i) => <BlockView key={i} b={b} filled={filled} flash={flash} />)}
            <div className="rrv-feet">
              {s.blocks.filter((b): b is Extract<Block, { k: "footnote" }> => b.k === "footnote").map((f) => (
                <Fragment key={f.n}><p><sup>{f.n}</sup> {f.text}</p></Fragment>
              ))}
            </div>
          </article>
        ))}
    </div>
  );
}
