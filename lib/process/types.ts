/**
 * A process map: what happens to a person, in order, with the branches off
 * it. James, 12 Sep 2026: "a process map that will show how the flow works
 * ... click into each individual, which will pop out a modal ... open up
 * the links and see what they would see ... see the emails that would go
 * out ... edit the emails ... add steps in ... attach an email ... triggers".
 *
 * Nodes are the steps; edges join them. The spine is the happy path left
 * to right; nurture and side lanes hang beneath it. A node can point at a
 * live screen (href, with {token} for the preview's share token), at an
 * email in the catalogue (emailId), or at nothing yet - a step we mean to
 * build, said plainly with status "planned".
 */

export type ProcessKind = "trigger" | "screen" | "email" | "decision" | "note";
export type ProcessLane = "spine" | "nurture" | "side";
export type ProcessStatus = "live" | "draft" | "planned";

export type ProcessNode = {
  id: string;
  kind: ProcessKind;
  title: string;
  blurb?: string;
  lane: ProcessLane;
  x: number;
  y: number;
  status: ProcessStatus;
  /** A live screen. {token} is filled with the preview share token. */
  href?: string;
  /** An id in lib/email/tle-emails.ts. */
  emailId?: string;
  /** When it fires: an event name, and optionally a delay after it. */
  trigger?: { on: string; after?: string };
};

export type ProcessEdge = {
  from: string;
  to: string;
  label?: string;
  kind: "main" | "branch" | "return";
};

export type ProcessMap = {
  audience: string;
  title: string;
  blurb: string;
  version: number;
  updatedAt?: string;
  nodes: ProcessNode[];
  edges: ProcessEdge[];
};
