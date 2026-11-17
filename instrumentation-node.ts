import { warmSchema } from "@/lib/db";
import { startRevokedSync } from "@/lib/session-revoke";
import { startCronWatch } from "@/lib/cron-watch";
import { demoMode } from "@/lib/demo/mode";
import { installDemoNetGuard, liveKeysOnDemo } from "@/lib/demo/net-guard";

/**
 * Capped, and never thrown: a database that is slow or down at boot must not
 * stop the server starting. The first query simply tries again.
 */
export async function warmAtBoot(): Promise<void> {
  /* THE DEMO COPY (lib/demo/mode, James 17 Nov 2026). Only when DEMO_MODE=1,
     which the live service never sets. A demo holding a live key is the one
     way it could touch a real person, so it refuses to start and says which
     key; then every outside request is refused for as long as it runs. */
  if (demoMode()) {
    const live = liveKeysOnDemo();
    if (live.length) {
      console.error(`[demo] REFUSING TO START: DEMO_MODE is on but these live settings are set: ${live.join(", ")}. Remove them from the demo service.`);
      process.exit(1);
    }
    installDemoNetGuard();
  }
  if (!process.env.DATABASE_URL) return;
  const started = Date.now();
  await Promise.race([warmSchema().then(() => true), new Promise<false>((resolve) => setTimeout(() => resolve(false), 20_000))])
    .then((ready) => console.log(ready ? `[boot] schema ready in ${Date.now() - started}ms` : "[boot] schema still building after 20s, starting anyway"))
    .catch((e) => console.warn("[boot] schema warm failed, the first query will retry:", e instanceof Error ? e.message : e));
  /* The demo's sign-ins and open areas, on its own database (lib/demo/seed). */
  if (demoMode()) {
    await import("@/lib/demo/seed")
      .then(({ seedDemo }) => seedDemo())
      .then((r) => console.log(`[demo] ${r.users} demo sign-ins and ${r.homes} managed homes ready${r.signIns ? "" : " (set DEMO_PASSWORD on the service before anybody can sign in)"}`))
      .catch((e) => console.warn("[demo] set-up did not finish:", e instanceof Error ? e.message : e));
    /* Back to this morning, every morning: the first check after midnight UK
       time clears what was typed into the demo yesterday (lib/demo/seed
       resetDemo). In here rather than on a timer service, so the demo is one
       service and nothing has to be remembered. */
    const ukDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
    let day = ukDay();
    const daily = setInterval(() => {
      const today = ukDay();
      if (today === day) return;
      day = today;
      void import("@/lib/demo/seed")
        .then(({ resetDemo }) => resetDemo())
        .then((r) => console.log(`[demo] new day: ${r.cleared} tables cleared and the invented world rebuilt`))
        .catch((e) => console.warn("[demo] the daily reset did not finish:", e instanceof Error ? e.message : e));
    }, 10 * 60_000);
    daily.unref?.();
  }
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
