import { redirect } from "next/navigation";
import { demoMode } from "@/lib/demo/mode";

/**
 * The demo copy has no sign-in screen (James, 20 Nov 2026): anybody sent there,
 * by a sign-out or an old link, walks straight back in through /api/demo/enter.
 * On the live system demoMode() is false and the sign-in page draws as before.
 * (The middleware never sees /sign-in - it is outside its matcher - so this is
 * the one place that can turn it away.)
 */
export const dynamic = "force-dynamic";

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  if (demoMode()) redirect("/api/demo/enter");
  return <>{children}</>;
}
