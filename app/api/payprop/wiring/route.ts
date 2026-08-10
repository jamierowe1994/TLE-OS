import { NextResponse } from "next/server";
import {
  PAYPROP_ACCOUNTS,
  payPropConfigured,
  payPropGet,
  payPropKeyFor,
  type PayPropAccountId,
} from "@/lib/payprop";
import { diagnosticsBlocked } from "@/lib/diagnostics";

/**
 * The PayProp half of the wiring sheet — read-only probes per agency.
 *
 * The business is TWO PayProp agencies (Scotland and the rest of the UK) that
 * cannot see each other, so every check runs per agency and the sheet shows
 * them side by side. `meta/me` is the anchor: it returns the key's exact
 * scope list, which is the honest measure of what this environment may do —
 * a 403 elsewhere is a permissions gap, not a wiring fault.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Check {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
}

function totalRows(result: unknown): number | null {
  const p = (result as { pagination?: { total_rows?: number } } | null)?.pagination;
  return typeof p?.total_rows === "number" ? p.total_rows : null;
}

async function checkAccount(id: PayPropAccountId, label: string): Promise<{
  id: PayPropAccountId;
  label: string;
  hasKey: boolean;
  checks: Check[];
}> {
  // How are we getting in? An API key of our own, or a token borrowed from
  // the portal — which owns the single OAuth connection.
  const key = payPropKeyFor(id);
  const bridged = Boolean(process.env.PORTAL_ORIGIN && process.env.OS_BRIDGE_SECRET);
  if (!key && !bridged) {
    return {
      id,
      label,
      hasKey: false,
      checks: [
        {
          key: "key",
          label: "Access",
          ok: false,
          detail:
            "No API key here and no borrowing arrangement — set PORTAL_ORIGIN and OS_BRIDGE_SECRET, or an API key.",
        },
      ],
    };
  }

  // Sequential on purpose: PayProp rate-limits concurrent calls from one key
  // ("Too many requests" on the overlapping ones), and a health check that
  // trips the limiter reports its own noise as failure.
  const pause = () => new Promise((r) => setTimeout(r, 400));
  const me = await payPropGet(id, "meta/me");
  // If the borrow failed, the portal's own words are far more use than ours.
  const { bridgeLastReason } = await import("@/lib/payprop-bridge");
  const why = bridgeLastReason();
  await pause();
  const props = await payPropGet(id, "export/properties", { rows: "1" });
  await pause();
  const tenants = await payPropGet(id, "export/tenants", { rows: "1" });
  await pause();
  const income = await payPropGet(id, "report/agency/income");

  const scopes = (me.result as { scopes?: string[] } | null)?.scopes;
  const scopeCount = Array.isArray(scopes) ? scopes.length : null;

  const checks: Check[] = [
    {
      key: "route",
      label: "How we get in",
      ok: true,
      detail: key
        ? "Our own API key"
        : "Borrowing a token from the portal — it stays the only app that refreshes",
    },
    {
      key: "auth",
      label: "Sign in",
      ok: me.ok,
      detail: me.ok
        ? `Accepted — ${scopeCount ?? "?"} permissions granted`
        : (why ?? me.error ?? "failed"),
    },
    {
      key: "properties",
      label: "Read the managed book",
      ok: props.ok,
      // THE number that settles whether one connection covers both books:
      // ~84 is the Scotland book, several hundred is E&W, everything means
      // the single OAuth connection spans the lot.
      detail: props.ok
        ? `${totalRows(props.result) ?? "?"} properties visible`
        : (props.error ?? "failed"),
    },
    {
      key: "tenants",
      label: "Read tenants",
      ok: tenants.ok,
      detail: tenants.ok
        ? `${totalRows(tenants.result) ?? "?"} tenants visible`
        : (tenants.error ?? "failed"),
    },
    {
      // 400 means "scoped but wants parameters" — that IS reachable. 403 is a
      // permissions gap to raise with PayProp, not a wiring fault.
      key: "income",
      label: "Agency income report",
      ok: income.ok || income.status === 400,
      detail: income.ok
        ? "Readable"
        : income.status === 400
          ? "In scope — just needs date parameters"
          : income.status === 403
            ? "Not in this key's permissions — ask PayProp to add it"
            : (income.error ?? "failed"),
    },
  ];

  return { id, label, hasKey: true, checks };
}

export async function GET() {
  const blocked = diagnosticsBlocked();
  if (blocked) return blocked;

  if (!payPropConfigured()) {
    return NextResponse.json({
      configured: false,
      accounts: [],
      note: "No PayProp API keys are set on this environment yet.",
    });
  }
  // A throw in any one account must not blank the whole page. This endpoint
  // exists to EXPLAIN failures, so it can't be the thing that fails silently.
  const accounts = await Promise.all(
    PAYPROP_ACCOUNTS.map(async (a) => {
      try {
        return await checkAccount(a.id, a.label);
      } catch (e) {
        return {
          id: a.id,
          label: a.label,
          hasKey: false,
          checks: [
            {
              key: "error",
              label: "Access",
              ok: false,
              detail: e instanceof Error ? e.message : "Something threw while checking this agency.",
            },
          ],
        };
      }
    })
  );
  return NextResponse.json({ configured: true, at: Date.now(), accounts });
}
