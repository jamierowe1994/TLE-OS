import { Suspense } from "react";
import { headers } from "next/headers";
import { networkInterfaces } from "node:os";
import ShowroomView from "@/components/showroom/ShowroomView";
import { previewToken } from "@/lib/preview-token";

/**
 * The Showroom - see lib/showroom/content for what it is and why.
 *
 * A server page only to hand the view the demo passport's preview token, which
 * is derived from the server's secret and never reaches the browser any other
 * way. Everything else is the client view.
 *
 * It also works out the address a phone should scan. On the live site that is
 * simply the site. On this Mac it is not: "localhost" on a phone is the phone,
 * so the code carries the Mac's own address on the wifi instead (James, 28 Sep
 * 2026: "offer a scannable code so we can get it onto mobile ... a bit of a
 * testing facility").
 */

export const dynamic = "force-dynamic";

export default async function ShowroomPage() {
  return (
    <Suspense fallback={null}>
      <ShowroomView token={previewToken()} phoneOrigin={await phoneOrigin()} />
    </Suspense>
  );
}

/** Null means "wherever the page is", which is right everywhere but a local preview. */
async function phoneOrigin(): Promise<string | null> {
  if (process.env.NODE_ENV === "production") return null;
  const host = (await headers()).get("host") ?? "";
  const [name, port] = host.split(":");
  if (name !== "localhost" && name !== "127.0.0.1" && name !== "[::1]") return null;
  const lan = Object.values(networkInterfaces())
    .flat()
    .find((a) => a && a.family === "IPv4" && !a.internal && /^(10|172|192)\./.test(a.address));
  return lan ? `http://${lan.address}${port ? `:${port}` : ""}` : null;
}
