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
  if (!payPropKeyFor(id)) {
    return {
      id,
      label,
      hasKey: false,
      checks: [
        {
          key: "key",
          label: "API key",
          ok: false,
          detail:
            id === "uk"
              ? "No UK API key exists anywhere yet — the portal runs this agency on OAuth, which two apps can't share (PayProp rotates the refresh token on every use). Fix: the agency admin issues one at uk.payprop.com/c/settings/api, then set PAYPROP_API_KEY_UK here."
              : "No key on this environment yet — set PAYPROP_API_KEY_SCOTLAND.",
        },
      ],
    };
  }

  // Sequential on purpose: PayProp rate-limits concurrent calls from one key
  // ("Too many requests" on the overlapping ones), and a health check that
  // trips the limiter reports its own noise as failure.
  const pause = () => new Promise((r) => setTimeout(r, 400));
  const me = await payPropGet(id, "meta/me");
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
      key: "auth",
      label: "Sign in",
      ok: me.ok,
      detail: me.ok
        ? `Key accepted — ${scopeCount ?? "?"} permissions granted`
        : (me.error ?? "failed"),
    },
    {
      key: "properties",
      label: "Read the managed book",
      ok: props.ok,
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
  const accounts = await Promise.all(
    PAYPROP_ACCOUNTS.map((a) => checkAccount(a.id, a.label))
  );
  return NextResponse.json({ configured: true, at: Date.now(), accounts });
}
