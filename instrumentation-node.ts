import { warmSchema } from "@/lib/db";

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
}
