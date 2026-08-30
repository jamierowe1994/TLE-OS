import { NextResponse } from "next/server";
import { propolyConfigured, propolyGet, propolyOptions } from "@/lib/business/propoly";
import { diagnosticsBlocked } from "@/lib/diagnostics";

/**
 * WHAT PROPOLY WILL ACTUALLY LET US DO.
 *
 * Howard tried to integrate and came away with an impression rather than a
 * list: you can push a landlord and a property and link them, but you cannot
 * start referencing. This route replaces the impression with their own
 * OpenAPI document, read live with our credential — so the answer is theirs,
 * dated, and re-checkable the day they change it.
 *
 * ── Read-only, deliberately ───────────────────────────────────────────────
 *
 * Every write operation found is LISTED and never called. Propoly is the
 * source of truth for deals and it generates the contracts; a probe that
 * "just tries" a POST to see what happens would be writing into the record a
 * tenancy is built from. Existence is proven from the spec, not by poking it.
 *
 * ── The spec is not available to us, measured ─────────────────────────────
 *
 * I first assumed /api-docs was 403 anonymously and 200 authenticated, and
 * wrote that here as if it were established. It is not: /api-docs,
 * /api-docs.json and /swagger.json all answer 403 with our agent credential
 * too (30 Aug 2026). Propoly simply does not expose its document to us.
 *
 * So capability is established two other ways, both read-only:
 *
 *   1. OPTIONS on each known path. The Allow header names the methods the
 *      server accepts without invoking any of them — which is how you learn a
 *      POST exists without creating a record in the system that generates the
 *      contracts.
 *   2. A GET census over candidate paths. 404 means it is not there; 200, 401
 *      or 403 all mean it IS there and tell us something about reachability.
 *      "Referencing" is the one Howard could not start, so it is asked about
 *      by name rather than assumed absent.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Paths this OS already calls in anger, so the sheet can say what is proven. */
const EXERCISED = new Set([
  "/api/v1/token",
  "/api/v1/deals",
  "/api/v1/deals/{id}",
  "/api/v1/properties",
  "/api/v1/properties/{id}",
  "/api/v1/tenants",
  "/api/v1/tenants/{id}",
  "/api/v1/landlords",
  "/api/v1/agents",
  "/api/v1/branches",
  "/api/v1/configuration/tenancy_agreements",
  "/api/v1/configuration/deposit_schemes",
  "/api/v1/configuration/document_types",
]);

interface Op {
  method: string;
  path: string;
  summary: string;
  writes: boolean;
  /** True when this OS has already called it against live Propoly. */
  exercised: boolean;
}

/** Normalise `/api/v1/deals/{dealId}` and `/api/v1/deals/{id}` to one key. */
const norm = (p: string) => p.replace(/\{[^}]+\}/g, "{id}");

export async function GET() {
  const blocked = diagnosticsBlocked();
  if (blocked) return blocked;

  if (!propolyConfigured()) {
    return NextResponse.json({
      configured: false,
      note: "Propoly credentials are not set on this environment.",
    });
  }

  /* Their document, through our token. propolyGet handles the token dance and
     never throws — a null here means we could not read the spec, which is a
     different answer from "the spec says we can do nothing". */
  type Spec = { paths?: Record<string, Record<string, { summary?: string; operationId?: string }>> };
  let spec: Spec | null = null;
  let specPath: string | null = null;
  const attempts: Array<{ path: string; status: number }> = [];
  for (const p of ["/api-docs", "/api-docs.json", "/swagger.json"]) {
    const res = await propolyGet(p);
    attempts.push({ path: p, status: res.status });
    if (res.status === 200 && res.body && typeof res.body === "object" && "paths" in (res.body as object)) {
      spec = res.body as Spec;
      specPath = p;
      break;
    }
  }

  if (!spec?.paths) {
    /* No document, so ask the server itself. Both sweeps are read-only. */
    const known = [...EXERCISED].filter((p) => !p.includes("{"));
    const methods = await Promise.all(
      known.map(async (p) => {
        const o = await propolyOptions(p);
        return {
          path: p,
          status: o.status,
          allow: o.allow,
          /* A 405 or a missing header is "the server did not answer the
             question", NOT "read-only". Saying otherwise would invent a
             restriction, which is the same class of error as inventing a
             permission. */
          writable:
            o.allow == null ? null : /POST|PUT|PATCH|DELETE/i.test(o.allow),
        };
      })
    );

    /* Does the thing Howard could not start even exist? Asked by name. */
    const CANDIDATES = [
      "/api/v1/references",
      "/api/v1/referencing",
      "/api/v1/reference_requests",
      "/api/v1/checks",
      "/api/v1/tenancies",
      "/api/v1/documents",
      "/api/v1/contracts",
      "/api/v1/notes",
      "/api/v1/tasks",
      "/api/v1/webhooks",
      "/api/v1/configuration",
    ];
    const census = await Promise.all(
      CANDIDATES.map(async (p) => {
        const r = await propolyGet(p);
        return {
          path: p,
          status: r.status,
          exists: r.status !== 404,
        };
      })
    );

    return NextResponse.json({
      configured: true,
      specRead: false,
      attempts,
      note:
        "Propoly does not expose its API document to our credential — /api-docs, /api-docs.json and " +
        "/swagger.json all answer 403 authenticated. So capability below is measured by asking the " +
        "server directly: OPTIONS for allowed methods, and a GET census for whether a path exists. " +
        "Nothing was created, updated or deleted.",
      methods,
      census,
      exercised: [...EXERCISED],
    });
  }

  const ops: Op[] = [];
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      const m = method.toUpperCase();
      if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(m)) continue;
      ops.push({
        method: m,
        path,
        summary: (op?.summary || op?.operationId || "").slice(0, 120),
        writes: m !== "GET",
        exercised: m === "GET" && EXERCISED.has(norm(path)),
      });
    }
  }
  ops.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

  const writes = ops.filter((o) => o.writes);
  const reads = ops.filter((o) => !o.writes);

  return NextResponse.json({
    configured: true,
    specRead: true,
    specPath,
    readAt: new Date().toISOString(),
    counts: {
      total: ops.length,
      reads: reads.length,
      writes: writes.length,
      readsProven: reads.filter((o) => o.exercised).length,
      readsUntested: reads.filter((o) => !o.exercised).length,
    },
    /* The two lists a decision actually needs: what we could push if we chose
       to, and what we have never touched. Nothing here has been called. */
    canWrite: writes.map((o) => `${o.method} ${o.path}${o.summary ? ` — ${o.summary}` : ""}`),
    readsProven: reads.filter((o) => o.exercised).map((o) => o.path),
    readsUntested: reads.filter((o) => !o.exercised).map((o) => o.path),
    note:
      "Writes are listed from Propoly's own spec and have NOT been called. Propoly generates the " +
      "contracts, so nothing is exercised against it to find out what happens.",
  });
}
