"use client";

import Link from "next/link";
import { Mast } from "@/components/new-look/Parts";
import { accessLine, useToolAccess, type Access } from "@/components/ToolsGrid";
import { TOOL_GROUPS, toolsInGroup, type Tool } from "@/lib/tools";

/**
 * Tools in the new look (lib/new-look "tools", James, 26 Oct 2026: "get the
 * tiles looking the same as the rest of the pages, give it a really clean
 * view, and then add one called Library, which will be under a Learning
 * section"). The same catalogue (lib/tools) and the same access answers as the
 * old grid (components/ToolsGrid), drawn as the new look draws a hub: a
 * type-only head, then each group as a titled row of white tiles. A tile that
 * opens lifts on hover; one that doesn't says why, quietly, at its foot.
 */

/* Line icons in the new look's hand (components/new-look/Parts' Ico), one per tool. */
const ICON: Record<string, React.ReactNode> = {
  invoicing: (
    <>
      <path d="M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v15.5l-3-2-3 2-3-2-3 2V5A1.5 1.5 0 0 1 7 3.5z" />
      <path d="M9 8.5h6M9 12h6" />
    </>
  ),
  forecast: <path d="M4 19.5h16M6 16l4-5 3.5 3 5-7M15 7h3.5v3.5" />,
  launchpad: (
    <>
      <path d="M13.5 4.5c3 0 6 3 6 6l-6.5 6.5-6-6z" />
      <path d="M7 11l-3 1 2.5 2.5M13 17l-1 3-2.5-2.5M14.5 9.5h.01" />
    </>
  ),
  bond: (
    <>
      <path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 0 0-13 0c0 5.4 6.5 11 6.5 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
  library: (
    <>
      <path d="M4.5 5.5c2.5-1 5-1 7.5.5v13c-2.5-1.5-5-1.5-7.5-.5z" />
      <path d="M19.5 5.5c-2.5-1-5-1-7.5.5v13c2.5-1.5 5-1.5 7.5-.5z" />
    </>
  ),
};
const Lock = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </svg>
);

function Tile({ tool, access, admin, i }: { tool: Tool; access: Access | null; admin: boolean; i: number }) {
  /* The same rules as the old card: a gated tool fails shut until its answer is yes;
     a locked one with an admin preview opens for an admin, and says so. */
  const barred = Boolean(tool.gate) && (!access || !access.entitled);
  const preview = tool.status === "locked" && Boolean(tool.adminPreview) && admin && Boolean(tool.href);
  const live = (tool.status === "live" || preview) && Boolean(tool.href) && !barred;
  const line = tool.gate && access ? accessLine(access) : null;
  const tag = preview ? "Admin preview" : tool.status === "locked" ? "Locked" : tool.status === "building" ? "Being built" : null;
  const foot = preview ? "Open to admins for demos. Agents still see it locked." : tool.status !== "live" ? tool.note : null;

  const body = (
    <>
      <span className="nl-tl-top">
        <span className="nl-tl-ico" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
            {ICON[tool.key] ?? <circle cx="12" cy="12" r="7" />}
          </svg>
        </span>
        <span className="nl-tl-tags">
          {tool.access === "paid" && <em className="nl-tl-tag">Paid</em>}
          {tag && (
            <em className={`nl-tl-tag${tag === "Admin preview" ? " is-ink" : ""}`}>
              {tag !== "Being built" && <Lock />}
              {tag}
            </em>
          )}
        </span>
      </span>
      <span className="nl-tl-name">{tool.name}</span>
      <span className="nl-tl-blurb">{tool.blurb}</span>
      {line && <span className={`nl-tl-line${line.strong ? " is-strong" : ""}`}>{line.text}</span>}
      {access && !access.entitled && access.triedAddresses?.length ? <span className="nl-tl-fine">Checked against {access.triedAddresses.join(", ")}</span> : null}
      {foot && <span className="nl-tl-foot">{foot}</span>}
      {live && (
        <span className="nl-tl-go" aria-hidden>
          Open
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      )}
    </>
  );
  const style = { animationDelay: `${80 + i * 60}ms` };
  return live ? (
    <Link href={tool.href!} className="nl-tl" style={style}>
      {body}
    </Link>
  ) : (
    <div className="nl-tl is-shut" style={style}>
      {body}
    </div>
  );
}

export default function ToolsNew() {
  const { access, admin } = useToolAccess();
  let n = 0;
  return (
    <div data-look="new" className="nl-page nl-rise nl-tools">
      <Mast title="Tools" blurb="The kit that sits alongside your book. Some comes with your package, some is bought separately." />
      {TOOL_GROUPS.map((group) => {
        const tools = toolsInGroup(group.key);
        if (!tools.length) return null;
        return (
          <section key={group.key} className="nl-tl-group">
            <div className="nl-tl-head">
              <h2 className="nl-section-title">{group.label}</h2>
              <p className="nl-meta">{group.blurb}</p>
            </div>
            <div className="nl-tl-grid">
              {tools.map((t) => (
                <Tile key={t.key} tool={t} access={t.gate ? access : null} admin={admin} i={n++} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
