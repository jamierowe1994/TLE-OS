/**
 * The tools an agent can reach, grouped, and which of them actually work.
 *
 * ── Why "Tools" and not "Prospecting" ─────────────────────────────────────
 *
 * This started as a Prospecting screen. James, 29 Aug: "we could make it under
 * a section called Tools... we're going to be building these guys out a few
 * different tools, and they'll have access to it within there."
 *
 * That is the better shape, and the reason is that prospecting is a JOB, not a
 * category of software. A rail entry per job ends up as a rail of one-item
 * lists — and the second tool that is not about prospecting has nowhere to go
 * without another entry. One Tools section with groups inside it holds
 * everything, and the groups do the explaining.
 *
 * ── `status` and `access` are two different questions ─────────────────────
 *
 * Keeping them apart matters more than it looks.
 *
 *   status  — does opening this DO anything yet? Ours to answer.
 *   access  — is it part of the package, or bought separately? James's to
 *             answer, commercially.
 *
 * A tool can be live and paid, or included and half-built, and collapsing the
 * two into one badge produces the worst outcome available: an agent who cannot
 * tell whether they are being sold something or waiting for something.
 *
 * ── What `access` deliberately does NOT say ───────────────────────────────
 *
 * It describes the TOOL, never the person looking at it. Nothing in the OS
 * knows who has bought what — there is no entitlement check, no subscription
 * record, no link to Launch Pad's Stripe customers. So the badge reads "Paid",
 * a fact about the tool, and never "Locked" or "Upgrade", which are claims
 * about the agent that we cannot currently stand behind.
 *
 * When entitlement is wired, this is the file that learns about it, and the
 * badge can start telling an individual something true about themselves.
 *
 * No prices here, either. Pricing and commercial framing are James's calls,
 * and a number invented in a source file has a way of becoming the number.
 */

export type ToolStatus = "live" | "building";
export type ToolAccess = "included" | "paid";
export type ToolGroupKey = "prospecting";

export interface ToolGroup {
  key: ToolGroupKey;
  label: string;
  blurb: string;
}

export const TOOL_GROUPS: ToolGroup[] = [
  {
    key: "prospecting",
    label: "Prospecting",
    blurb:
      "Everything that happens before somebody puts their hand up — finding the doors nobody has knocked on yet.",
  },
];

export interface Tool {
  key: string;
  name: string;
  /** One line, in an agent's words, on what it is FOR. Not what it contains. */
  blurb: string;
  /** Filename in /public/icons/doodle. */
  icon: string;
  href: string | null;
  status: ToolStatus;
  access: ToolAccess;
  group: ToolGroupKey;
  /** Shown when it isn't live: what is missing, plainly. */
  note?: string;
}

export const TOOLS: Tool[] = [
  {
    key: "launchpad",
    name: "Launch Pad",
    blurb:
      "Run ads to the doors you want, and work everything that comes back without leaving here.",
    icon: "rocket",
    href: null,
    status: "building",
    access: "paid",
    group: "prospecting",
    note: "Being rebuilt into the OS so it stops being a second place to sign in to.",
  },
];

/** The tools in a group, in declaration order. */
export function toolsInGroup(group: ToolGroupKey): Tool[] {
  return TOOLS.filter((t) => t.group === group);
}

/** The ones an agent can actually open right now. */
export function liveTools(): Tool[] {
  return TOOLS.filter((t) => t.status === "live" && t.href);
}
