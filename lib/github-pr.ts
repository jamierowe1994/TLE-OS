import "server-only";

/**
 * Push It Live on Tickets (James, 4 Nov 2026): "Then it gives me an option to
 * push or to open it. So it almost kind of bypasses the need to go into
 * Claude if I don't need to."
 *
 * A fix Claude makes for a ticket arrives as a pull request on GitHub.
 * Pushing it is merging that pull request into main, which Railway deploys
 * like any other push; the shipped file in the same change then closes the
 * ticket and tells whoever reported it (lib/ticket-sweep).
 *
 * The key is a fine-grained GitHub token for this one repository, allowed to
 * write its contents and pull requests (GITHUB_TICKETS_TOKEN on Railway). It
 * does three things and nothing else: read the pull request a ticket points
 * at, take it out of draft, and merge it.
 */

/* A stand-in on this machine, for trying Push It Live locally without
   merging anything real; production only ever talks to GitHub. */
const API =
  process.env.NODE_ENV !== "production" && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(process.env.GITHUB_API_BASE ?? "")
    ? process.env.GITHUB_API_BASE!
    : "https://api.github.com";

export const githubRepo = (): string => (process.env.GITHUB_TICKETS_REPO ?? "jamierowe1994/TLE-OS").trim();
const token = (): string => (process.env.GITHUB_TICKETS_TOKEN ?? "").trim();
export const githubConfigured = (): boolean => Boolean(token());

export class GithubRefused extends Error {}

async function gh(path: string, init: { method?: string; body?: unknown } = {}): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      authorization: `Bearer ${token()}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "tle-os-tickets",
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!res) throw new GithubRefused("GitHub didn't answer. Try again in a minute.");
  if (res.status === 401 || res.status === 403) {
    throw new GithubRefused("GitHub turned the key down: the token on Railway may have expired or lost its access to the repository.");
  }
  return { status: res.status, json: ((await res.json().catch(() => null)) ?? {}) as Record<string, unknown> };
}

/** The pull request number in a link, and only if it is this repository's. */
export function prNumberFrom(url: string): number | null {
  const m = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)\/?$/.exec(url.trim());
  return m && m[1].toLowerCase() === githubRepo().toLowerCase() ? Number(m[2]) : null;
}

export interface PullRequest {
  number: number;
  nodeId: string;
  state: string;
  merged: boolean;
  draft: boolean;
  /** Null while GitHub is still working it out. */
  mergeable: boolean | null;
  head: string;
  base: string;
  title: string;
}

export async function getPr(n: number): Promise<PullRequest | null> {
  const { status, json: j } = await gh(`/repos/${githubRepo()}/pulls/${n}`);
  if (status === 404) return null;
  if (status !== 200) throw new GithubRefused("GitHub couldn't find that change just now. Try again in a minute.");
  const head = (j.head ?? {}) as { ref?: string };
  const base = (j.base ?? {}) as { ref?: string };
  return {
    number: n,
    nodeId: String(j.node_id ?? ""),
    state: String(j.state ?? ""),
    merged: j.merged === true,
    draft: j.draft === true,
    mergeable: typeof j.mergeable === "boolean" ? j.mergeable : null,
    head: head.ref ?? "",
    base: base.ref ?? "",
    title: String(j.title ?? ""),
  };
}

/** Out of draft: GitHub will not merge a draft, and Claude's first one (PR #5, 4 Nov 2026) was opened as one. */
export async function markReady(pr: PullRequest): Promise<void> {
  const { status, json } = await gh("/graphql", {
    method: "POST",
    body: {
      query: "mutation($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { pullRequest { isDraft } } }",
      variables: { id: pr.nodeId },
    },
  });
  if (status !== 200 || (Array.isArray(json.errors) && json.errors.length)) {
    throw new GithubRefused("GitHub wouldn't take the change out of draft. See the Change opens it there, to press Ready for review.");
  }
}

/**
 * Merged as Claude wrote it: rebased onto main, so main reads like the rest
 * of its history, one plain-English change per line. A repository set not to
 * allow rebasing falls back to a squash, then an ordinary merge.
 */
export async function mergePr(pr: PullRequest): Promise<string> {
  for (const method of ["rebase", "squash", "merge"] as const) {
    const { status, json } = await gh(`/repos/${githubRepo()}/pulls/${pr.number}/merge`, {
      method: "PUT",
      body: { merge_method: method, ...(method === "squash" ? { commit_title: pr.title } : {}) },
    });
    if (status === 200 && json.merged === true) return String(json.sha ?? "");
    if (status === 405 && /not allowed/i.test(String(json.message ?? ""))) continue;
    if (status === 405 || status === 409) {
      throw new GithubRefused("GitHub won't merge it as it stands: it probably clashes with a newer change. Open it in Claude to bring it up to date.");
    }
    throw new GithubRefused("GitHub couldn't merge it just now. Try again in a minute.");
  }
  throw new GithubRefused("This repository allows no way of merging from here.");
}
