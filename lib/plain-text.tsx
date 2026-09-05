import type { ReactNode } from "react";

/**
 * Plain writing, drawn properly.
 *
 * The knowledge hub takes what people type or paste - no toolbar, no markup
 * to learn - and this turns it into paragraphs, headings and lists for the
 * guide reader. The rules are the ones people already use without being
 * told: a line on its own starting with "#" is a heading, lines starting
 * with "-" or "*" or "1." are a list, blank lines separate paragraphs.
 * Anything else is a paragraph. Nothing is ever hidden or mangled: a line
 * that fits no rule is shown as written.
 */
export function renderPlainText(text: string): ReactNode[] {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const out: ReactNode[] = [];
  blocks.forEach((block, i) => {
    const lines = block.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim());
    if (!lines.length) return;
    const isList = lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l));
    if (isList) {
      const numbered = /^\s*\d+[.)]\s+/.test(lines[0]);
      const items = lines.map((l, n) => <li key={n}>{l.replace(/^\s*([-*•]|\d+[.)])\s+/, "")}</li>);
      out.push(
        numbered ? (
          <ol key={i} className="my-3 list-decimal space-y-1 pl-5">
            {items}
          </ol>
        ) : (
          <ul key={i} className="my-3 list-disc space-y-1 pl-5">
            {items}
          </ul>
        )
      );
      return;
    }
    if (lines.length === 1 && /^#{1,3}\s+/.test(lines[0])) {
      const level = lines[0].match(/^(#{1,3})/)?.[1].length ?? 2;
      const textOnly = lines[0].replace(/^#{1,3}\s+/, "");
      out.push(
        level === 1 ? (
          <h2 key={i} className="hand mt-6 text-[20px] leading-tight">
            {textOnly}
          </h2>
        ) : (
          <h3 key={i} className="mt-5 text-[14px] font-semibold">
            {textOnly}
          </h3>
        )
      );
      return;
    }
    out.push(
      <p key={i} className="my-3 text-[13.5px] leading-relaxed">
        {lines.map((l, n) => (
          <span key={n}>
            {l}
            {n < lines.length - 1 ? <br /> : null}
          </span>
        ))}
      </p>
    );
  });
  return out;
}
