import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import DoodleIcon from "@/components/DoodleIcon";
import { TOOL_GROUPS, toolsInGroup, type Tool } from "@/lib/tools";

/**
 * Tools — the hub, and the front of the rail.
 *
 * ── Why this sits BEFORE Leads ────────────────────────────────────────────
 *
 * James, 29 Aug, on where prospecting belongs: "it can go before leads."
 *
 * That ordering is the argument for the screen existing at all. Everything
 * else in front of house starts with a lead that already arrived — Leads,
 * Market Appraisals, Listings, Viewings, Applications is one queue, read left
 * to right, and every stage of it assumes somebody put their hand up first.
 * The first group here is about the doors nobody has knocked on yet, so it
 * belongs at the head of that queue rather than beside it.
 *
 * ── Grouped, because the second tool is the one that breaks a flat list ───
 *
 * Groups come from lib/tools.ts and a tool names its own, so adding one is a
 * line of data. A group with nothing in it does not render — an empty heading
 * announces a category we have not built and reads as something broken.
 *
 * ── An unfinished tool is a box, not a link ───────────────────────────────
 *
 * Rendered, so an agent can see what is coming, but not clickable. A disabled
 * link still looks like a link and on a phone it still takes the tap; the
 * alternative of hiding it until it works means the roadmap is invisible. Same
 * rule as lib/screens.ts: never imply a screen does something it does not.
 */

export const metadata = { title: "Tools" };

function ToolCard({ tool }: { tool: Tool }) {
  const live = tool.status === "live" && tool.href;

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line/80 bg-card ${
            live ? "text-ink" : "text-muted"
          }`}
        >
          <DoodleIcon name={tool.icon} size={20} />
        </span>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {/* A fact about the tool, never a claim about the person reading it —
              nothing here knows who has bought what. See lib/tools.ts. */}
          {tool.access === "paid" && (
            <span className="rounded-full border border-line/70 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-muted">
              Paid
            </span>
          )}
          {!live && (
            <span className="rounded-full border border-line/70 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-muted">
              Building
            </span>
          )}
        </div>
      </div>
      <p className={`mt-3.5 text-[15px] ${live ? "text-ink" : "text-muted"}`}>{tool.name}</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{tool.blurb}</p>
      {!live && tool.note ? (
        <p className="mt-2.5 border-t border-line/40 pt-2.5 text-[11.5px] leading-relaxed text-muted">
          {tool.note}
        </p>
      ) : null}
    </>
  );

  return live ? (
    <Link
      href={tool.href!}
      className="fade-up rounded-2xl border border-line/80 bg-panel p-5 transition-colors hover:border-ink"
    >
      {inner}
    </Link>
  ) : (
    <div className="fade-up rounded-2xl border border-dashed border-line/70 bg-panel p-5">
      {inner}
    </div>
  );
}

export default function ToolsHub() {
  return (
    <>
      <PageHeader
        title="Tools"
        blurb="The kit that sits alongside your book. Some comes with your package, some is bought separately."
      />

      {TOOL_GROUPS.map((group) => {
        const tools = toolsInGroup(group.key);
        if (tools.length === 0) return null;
        return (
          <section key={group.key} className="mt-8">
            <h2 className="text-[15px]">{group.label}</h2>
            <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-muted">{group.blurb}</p>
            <div className="mt-3.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tools.map((t) => (
                <ToolCard key={t.key} tool={t} />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
