import { Suspense } from "react";
import ShowroomView from "@/components/showroom/ShowroomView";
import { previewToken } from "@/lib/preview-token";

/**
 * The Showroom - see lib/showroom/content for what it is and why.
 *
 * A server page only to hand the view the demo passport's preview token, which
 * is derived from the server's secret and never reaches the browser any other
 * way. Everything else is the client view.
 */

export const dynamic = "force-dynamic";

export default function ShowroomPage() {
  return (
    <Suspense fallback={null}>
      <ShowroomView token={previewToken()} />
    </Suspense>
  );
}
