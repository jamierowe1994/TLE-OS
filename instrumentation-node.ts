import { warmSchema } from "@/lib/db";
import { startRevokedSync } from "@/lib/session-revoke";
import { startCronWatch } from "@/lib/cron-watch";

/**
 * Capped, and never thrown: a database that is slow or down at boot must not
 * stop the server starting. The first query simply tries again.
 */
export async function warmAtBoot(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  const started = Date.now();
  await Promise.race([warmSchema().then(() => true), new Promise<false>((resolve) => setTimeout(() => resolve(false), 20_000))])
    .then((ready) => console.log(ready ? `[boot] schema ready in ${Date.now() - started}ms` : "[boot] schema still building after 20s, starting anyway"))
    .catch((e) => console.warn("[boot] schema warm failed, the first query will retry:", e instanceof Error ? e.message : e));
  /* Signed-out sessions, held in memory for lib/auth (lib/session-revoke). */
  startRevokedSync();
  /* Every Railway timer watched from in here, so none has to run for a stopped one to be seen. */
  startCronWatch();
  /* Tickets this deploy fixes are marked Fixed and their reporters told, a
     minute after boot so the new instance is already serving the fix they
     will go and try (lib/ticket-sweep). The five-minute timer repeats it. */
  const origin = (process.env.OS_ORIGIN ?? process.env.NEXT_PUBLIC_OS_ORIGIN ?? "").trim().replace(/\/+$/, "");
  if (origin) {
    const t = setTimeout(() => {
      void import("@/lib/ticket-sweep")
        .then(({ sweepTickets }) => sweepTickets(origin))
        .then((r) => {
          if (r.outagesClosed || r.shipped.length) console.log(`[boot] tickets: ${r.shipped.length} fixed by this deploy, ${r.outagesClosed} cleared outages closed`);
        })
        .catch(() => {});
    }, 60_000);
    t.unref?.();
  }
}
