import { NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { rexCall, rexConfigured, rexRows, rexWritesLocked } from "@/lib/rex";
import { diagnosticsBlocked } from "@/lib/diagnostics";
import { lockTruth, rexTruth } from "@/lib/wiring-truth";

/**
 * The live half of the wiring sheet: one pass over REX proving what the OS
 * can actually reach RIGHT NOW, on this environment's credentials.
 *
 * Everything here is read-only — describes, searches, status reads. The
 * write-shaped capabilities (publish, lead update, uploads) are reported as
 * "proven to exist" from their describe method lists, never exercised.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Check {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
}

async function safe(fn: () => Promise<Check>, key: string, label: string): Promise<Check> {
  try {
    return await fn();
  } catch (e) {
    return { key, label, ok: false, detail: publicError(e, "failed") };
  }
}

export async function GET() {
  const blocked = diagnosticsBlocked();
  if (blocked) return blocked;

  if (!rexConfigured()) {
    return NextResponse.json({
      configured: false,
      checks: [],
      note: "REX credentials are not set on this environment yet.",
    });
  }

  /* REX's state first, from REX status itself (lib/rex-outage, 24 Oct 2026).
     While REX counts as down every read below would be answered from the
     copy, and a sheet of green ticks drawn from the copy would say REX is
     fine on the very afternoon REX status says it is not. So nothing is
     probed: the sheet says down, why, and when REX last answered. */
  const status = await rexTruth().catch(() => null);
  const locks = await lockTruth().catch(() => null);
  const REASON: Record<string, string> = { forced: "set to down on REX status", planned: "inside the planned window", detected: "it stopped answering" };
  const statusCheck: Check = status
    ? {
        key: "status",
        label: "REX status",
        ok: !status.down,
        detail: status.down
          ? `Down, ${REASON[status.reason ?? ""] ?? "by REX status"}. Screens show the copy; nothing is asked of REX.${status.lastOkAt ? ` Last good answer ${new Date(status.lastOkAt).toLocaleString("en-GB", { timeZone: "Europe/London" })}.` : ""}`
          : status.mode === "up"
            ? "Forced up on REX status: asked live whatever the detection says."
            : "Answering. Automatic on REX status.",
      }
    : { key: "status", label: "REX status", ok: false, detail: "REX status could not be read, so whether REX is up is not known." };

  /* The lock, as Switches and the server hold it rather than one env var:
     the methods REX_ALLOW_WRITES opens on the server, and the REX switches. */
  const open = locks?.rex.serverOpen ?? [];
  const armed = (locks?.rex.switches ?? []).filter((s) => s.on).map((s) => s.label);
  const lockCheck: Check = {
    key: "lock",
    label: "Write lock",
    ok: rexWritesLocked(),
    detail: !open.length
      ? "Locked on the server: REX_ALLOW_WRITES names nothing, so no write reaches REX whatever Switches say."
      : `${open.length} ${open.length === 1 ? "write is" : "writes are"} open on the server (REX_ALLOW_WRITES). ${
          locks?.brake
            ? "SENDING_LOCKED holds every switch off."
            : armed.length
              ? `On in Switches: ${armed.join(", ")}.`
              : "Every REX switch is off in Switches."
        }`,
  };

  if (status?.down) {
    return NextResponse.json({ configured: true, at: Date.now(), checks: [statusCheck, lockCheck], writesLocked: rexWritesLocked(), down: true });
  }

  const checks: Check[] = [statusCheck, lockCheck];
  checks.push(...await Promise.all([
    safe(async () => {
      const r = await rexCall("AccountUsers", "search", { limit: 1 });
      return {
        key: "auth",
        label: "Sign in to REX",
        ok: r.ok,
        detail: r.ok ? "Logged in on the office account" : (r.error ?? `HTTP ${r.status}`),
      };
    }, "auth", "Sign in to REX"),

    safe(async () => {
      const r = await rexCall("Listings", "search", {
        criteria: [
          { name: "system_listing_state", value: "current" },
          { name: "listing_category_id", value: "residential_rental" },
        ],
        limit: 1,
        result_format: "ids",
      });
      const total = (r.result as { total?: number } | null)?.total;
      const rows = rexRows(r.result).length;
      return {
        key: "listings",
        label: "Read the rental book",
        ok: r.ok,
        detail: r.ok
          ? `${total ?? (rows ? "1+" : 0)} current rentals visible`
          : (r.error ?? `HTTP ${r.status}`),
      };
    }, "listings", "Read the rental book"),

    safe(async () => {
      const r = await rexCall("Leads", "search", { limit: 3, order_by: { system_ctime: "desc" } });
      const rows = rexRows(r.result);
      const total = (r.result as { total?: number } | null)?.total;
      const newest = rows[0];
      const when = newest ? new Date(Number(newest.system_ctime) * 1000) : null;
      const ageMin = when ? Math.round((Date.now() - when.getTime()) / 60000) : null;
      const from = newest ? String(newest.received_from_email ?? "") : "";
      return {
        key: "leads",
        label: "Portal leads coming in",
        ok: r.ok && rows.length > 0,
        detail: r.ok
          ? `${total ?? rows.length} leads on record — newest ${
              ageMin != null ? (ageMin < 90 ? `${ageMin} min ago` : `${Math.round(ageMin / 60)}h ago`) : "?"
            }${from ? ` via ${from.replace("*@", "")}` : ""}`
          : (r.error ?? `HTTP ${r.status}`),
      };
    }, "leads", "Portal leads coming in"),

    safe(async () => {
      const r = await rexCall("AdminPortalDefinitions", "search", { limit: 20 });
      const names = rexRows(r.result)
        .filter((p) => p.portal_state === "active")
        .map((p) => String(p.portal_name));
      const majors = ["Rightmove", "Zoopla", "OnTheMarket"].filter((m) => names.includes(m));
      return {
        key: "portals",
        label: "Portal feeds configured",
        ok: r.ok && majors.length > 0,
        detail: r.ok ? `${majors.join(", ")} active (${names.length} portals defined)` : (r.error ?? `HTTP ${r.status}`),
      };
    }, "portals", "Portal feeds configured"),

    safe(async () => {
      // Is at least one current rental actively feeding a portal right now?
      const lst = await rexCall("Listings", "search", {
        criteria: [
          { name: "system_listing_state", value: "current" },
          { name: "listing_category_id", value: "residential_rental" },
          { name: "system_publication_status", value: "published" },
        ],
        limit: 1,
      });
      const id = rexRows(lst.result)[0]?.id;
      if (!id) return { key: "feeding", label: "Listings feeding portals", ok: false, detail: "No published rental found" };
      const up = await rexCall("ListingPortalUploads", "search", {
        criteria: [{ name: "listing_id", value: id }],
        limit: 10,
      });
      const feeds = rexRows(up.result).filter((u) => u.feed_status === "feeding");
      const link = feeds
        .map((f) => String(f.link_on_portal ?? ""))
        .find((l) => l.length > 0);
      return {
        key: "feeding",
        label: "Listings feeding portals",
        ok: up.ok && feeds.length > 0,
        detail: up.ok
          ? feeds.length
            ? `Live feed confirmed${link ? ` — e.g. ${link}` : ""}`
            : "Published listing found but no active feed rows"
          : (up.error ?? `HTTP ${up.status}`),
      };
    }, "feeding", "Listings feeding portals"),

    safe(async () => {
      const r = await rexCall("ListingPublication", "describe", {});
      const methods = Object.keys(
        (r.result as { methods?: Record<string, unknown> } | null)?.methods ?? {}
      );
      const has = ["publish", "setActivePublicationChannels", "getErrorsPreventingPublication"].filter((m) =>
        methods.includes(m)
      );
      return {
        key: "publish",
        label: "Publish button reachable",
        ok: r.ok && has.includes("publish"),
        detail: r.ok ? `Methods exposed: ${has.join(", ")}` : (r.error ?? `HTTP ${r.status}`),
      };
    }, "publish", "Publish button reachable"),

    safe(async () => {
      const r = await rexCall("Upload", "describe", {});
      const methods = Object.keys(
        (r.result as { methods?: Record<string, unknown> } | null)?.methods ?? {}
      );
      return {
        key: "upload",
        label: "File uploads into REX",
        ok: r.ok && methods.includes("uploadFileFromUrl"),
        detail: r.ok ? `${methods.length} upload methods exposed` : (r.error ?? `HTTP ${r.status}`),
      };
    }, "upload", "File uploads into REX"),

    safe(async () => {
      const r = await rexCall("AdminWebhooks", "getEventsAndCategories", {});
      const events = ((r.result as { events?: Array<{ id: string }> } | null)?.events ?? []).map(
        (e) => e.id
      );
      const wanted = ["leads.created", "listings.updated", "listing_portal_uploads.updated"].filter((w) =>
        events.includes(w)
      );
      return {
        key: "webhooks",
        label: "Webhooks (push to the OS)",
        ok: r.ok && wanted.includes("leads.created"),
        detail: r.ok
          ? `${events.length} events available incl. ${wanted.join(", ")}`
          : (r.error ?? `HTTP ${r.status}`),
      };
    }, "webhooks", "Webhooks (push to the OS)"),
  ]));

  return NextResponse.json({ configured: true, at: Date.now(), checks, writesLocked: rexWritesLocked() });
}
