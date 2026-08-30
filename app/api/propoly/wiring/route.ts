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
    /* THE CONTROL. Every candidate came back 403 rather than 404, which makes
       "403 means it exists" an assumption rather than a finding — if a path
       that certainly does not exist ALSO answers 403, the census proves
       nothing. So one deliberately absent path is asked alongside the rest and
       reported, and the census is only readable against it. */
    const controlRes = await propolyGet("/api/v1/definitely_not_a_real_endpoint_xyz");
    const control = {
      path: "/api/v1/definitely_not_a_real_endpoint_xyz",
      status: controlRes.status,
      meaning:
        controlRes.status === 404
          ? "404 for an absent path — so a 403 below really does mean the route exists and we are not permitted."
          : `${controlRes.status} for a path that cannot exist — so the census below proves NOTHING about existence, only that we are refused.`,
    };

    const census = await Promise.all(
      CANDIDATES.map(async (p) => {
        const r = await propolyGet(p);
        return {
          path: p,
          status: r.status,
          /* Only meaningful if the control 404s — see `control`. */
          exists: controlRes.status === 404 ? r.status !== 404 : null,
        };
      })
    );

    /* DO THE DOCUMENTS COME BACK IN THE PAYLOAD?
    
       Propoly serves compliance certificates from its own S3 bucket as
       presigned URLs — measured 30 Aug 2026 from the browser:
    
         propoly-prod.s3.eu-west-1.amazonaws.com/uploads/tle/
           property_gas_safety_attachment/attached/22375/GSC.pdf?X-Amz-…
           property_electrical_installation_attachment/attached/39702/EICR…
    
       with X-Amz-Expires=604800 — seven days. If those URLs (or the
       attachment ids behind them) appear in the API payload we already read,
       then gas certificates and EICRs are reachable properly, and the
       compliance tab stops being EPC-only.
    
       FIELD NAMES ONLY. This walks the shape of one property and one deal and
       reports which keys exist and whether any value LOOKS like an S3 link —
       never the value itself. A diagnostics route should not print a landlord's
       address or a signed URL that works for a week for anyone holding it. */
    const shapeOf = async (path: string) => {
      const r = await propolyGet(path);
      const body = r.body as Record<string, unknown> | null;
      /* FIND THE FIRST ARRAY ANYWHERE, rather than guessing its name.
      
         The first cut looked for `data` and fell back to the whole body, so
         against /api/v1/properties it reported the keys of the PAGINATION
         ENVELOPE — properties, total_entries, per_page — and concluded there
         were no document fields. That is a false negative produced by looking
         at the wrong object, which is worse than no answer at all: it reads as
         "Propoly does not return certificates". */
      /* REPORT BOTH, GUESS NEITHER.
      
         The walker went wrong twice. It recursed depth-first and returned the
         first array it found, so /deals/{uuid} reported uuid, name, email,
         phone — a PERSON out of a nested association, not the deal. And it
         never returned a plain top-level object, so /properties/{uuid} came
         back with no keys at all against a 200.
      
         Both are the same mistake: deciding which object is "the record" and
         being wrong silently. So now the top-level keys are reported as they
         are, AND the first nested collection separately. Nothing is chosen on
         the caller's behalf. */
      const topLevel =
        body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body) : [];
      const firstArray = (v: unknown, depth = 0): Record<string, unknown> | undefined => {
        if (depth > 2 || v == null || typeof v !== "object") return undefined;
        if (Array.isArray(v)) {
          const head = v[0];
          return head && typeof head === "object" ? (head as Record<string, unknown>) : undefined;
        }
        for (const val of Object.values(v as Record<string, unknown>)) {
          const hit = firstArray(val, depth + 1);
          if (hit) return hit;
        }
        return undefined;
      };
      const first = (Array.isArray(body) ? (body[0] as Record<string, unknown>) : body) ?? firstArray(body);
      if (!first || typeof first !== "object") {
        return { path, status: r.status, topLevel, keys: [], docLike: [], nested: [] };
      }
      const keys = Object.keys(first);
      /* Anything named like an attachment, or holding something that smells
         like a presigned S3 link. Presence, not content. */
      const docLike = keys.filter((k) => {
        if (/attach|document|certificate|file|upload|gas|electric|epc/i.test(k)) return true;
        const v = first[k];
        return typeof v === "string" && /s3\.|X-Amz-Signature|\.pdf/i.test(v);
      });
      /* Nested objects matter — an attachment is rarely a top-level string. */
      const nested: string[] = [];
      for (const [k, v] of Object.entries(first)) {
        if (v && typeof v === "object") {
          const inner = Array.isArray(v) ? v[0] : v;
          if (inner && typeof inner === "object") {
            for (const ik of Object.keys(inner as Record<string, unknown>)) {
              if (/attach|document|certificate|file|url|expir|gas|electric|epc/i.test(ik)) {
                nested.push(`${k}.${ik}`);
              }
            }
          }
        }
      }
      return { path, status: r.status, topLevel, keys, docLike, nested };
    };

    /* LIST vs DETAIL. The list endpoints return a summary — a property is ten
       fields and an address — and associations like
       property_gas_safety_attachment would hang off the DETAIL record if they
       are exposed at all. Concluding "no certificates" from a list response
       would be the same mistake as reading the pagination envelope. So: take a
       real uuid from the list, then ask for that one record. */
    const firstUuid = async (listPath: string, key: string) => {
      const r = await propolyGet(listPath);
      const rows = (r.body as Record<string, unknown> | null)?.[key];
      const head = Array.isArray(rows) ? (rows[0] as Record<string, unknown>) : null;
      return typeof head?.uuid === "string" ? head.uuid : null;
    };

    const propUuid = await firstUuid("/api/v1/properties", "properties");
    const dealUuid = await firstUuid("/api/v1/deals", "deals");

    const shapes = await Promise.all([
      shapeOf("/api/v1/properties"),
      shapeOf("/api/v1/deals"),
      ...(propUuid ? [shapeOf(`/api/v1/properties/${propUuid}`)] : []),
      ...(dealUuid ? [shapeOf(`/api/v1/deals/${dealUuid}`)] : []),
      /* Rails commonly gates associations behind an include. Cheap to ask. */
      ...(propUuid ? [shapeOf(`/api/v1/properties/${propUuid}?include=attachments,documents`)] : []),
    ]);

    /* THE DOCUMENT ROUTES, ASKED DIRECTLY.
    
       Propoly names 17 document types including Gas Safety Certificate and
       EICR, so the certificates are first-class. What is missing is the route
       that serves one. A 403 proves nothing here — the control established
       that — but a 200 proves everything, so these are worth asking even
       though most will refuse. */
    const docRoutes = propUuid
      ? await Promise.all(
          [
            `/api/v1/properties/${propUuid}/documents`,
            `/api/v1/properties/${propUuid}/attachments`,
            `/api/v1/properties/${propUuid}/compliance`,
            `/api/v1/properties/${propUuid}/certificates`,
            `/api/v1/documents?property_uuid=${propUuid}`,
            ...(dealUuid ? [`/api/v1/deals/${dealUuid}/documents`] : []),
          ].map(async (path) => {
            const r = await propolyGet(path);
            return {
              path: path.replace(propUuid, "{uuid}").replace(dealUuid ?? "~", "{deal}"),
              status: r.status,
              /* Only a 200 means anything. Said explicitly so nobody reads a
                 wall of 403s as "we tried everything and it is not there". */
              informative: r.status === 200,
            };
          })
        )
      : [];

    /* WHAT DOCUMENT TYPES PROPOLY EVEN HAS. This endpoint answers 200 and we
       already call it. If it names gas safety and EICR then the certificates
       are first-class in their model and the only question is which route
       serves the file — which is a very different conversation with them than
       "does this exist". Configuration only; no personal data. */
    const typesRes = await propolyGet("/api/v1/configuration/document_types");
    const typesBody = typesRes.body as Record<string, unknown> | null;
    const typeList = (() => {
      if (!typesBody) return [];
      for (const v of Object.values(typesBody)) {
        if (Array.isArray(v)) {
          return v
            .map((x) =>
              typeof x === "string"
                ? x
                : ((x as Record<string, unknown>)?.name ??
                   (x as Record<string, unknown>)?.title ??
                   (x as Record<string, unknown>)?.slug ??
                   JSON.stringify(x).slice(0, 60))
            )
            .slice(0, 60);
        }
      }
      return [];
    })();

    return NextResponse.json({
      configured: true,
      specRead: false,
      attempts,
      documents: shapes,
      documentTypes: { status: typesRes.status, count: typeList.length, types: typeList },
      docRoutes,
      note:
        "Propoly does not expose its API document to our credential — /api-docs, /api-docs.json and " +
        "/swagger.json all answer 403 authenticated. So capability below is measured by asking the " +
        "server directly: OPTIONS for allowed methods, and a GET census for whether a path exists. " +
        "Nothing was created, updated or deleted.",
      methods,
      control,
      census,
      /* Every path answered "OPTIONS, GET, POST" — including deposit schemes
         and branches, which nobody creates. An identical Allow header on every
         route is the signature of a framework default, not ten writable
         endpoints, so this is reported as unproven rather than as capability. */
      methodsCaveat:
        "Allow was identical on every path, including configuration endpoints nobody would POST to. " +
        "That pattern is a framework default rather than evidence of a writable route. Treat POST as " +
        "UNPROVEN until Propoly confirms it — and confirm it by asking them, not by sending one.",
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
