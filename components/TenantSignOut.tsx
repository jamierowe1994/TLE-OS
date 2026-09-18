"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Clears the tenant cookie and lands on the sign-in page. `drawer` is the
 *  phone menu's: the same size as the links above it, as the landlord's is. */
export default function TenantSignOut({ variant = "text" }: { variant?: "text" | "drawer" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const out = async () => {
    setBusy(true);
    await fetch("/api/tenant/session", { method: "DELETE" }).catch(() => {});
    router.push("/tenant/sign-in");
    router.refresh();
  };
  if (variant === "drawer") {
    return (
      <button type="button" disabled={busy} onClick={out} className="block w-full py-2.5 text-right text-[24px] font-bold leading-tight text-muted disabled:opacity-50">
        {busy ? "Signing out…" : "Sign out"}
      </button>
    );
  }
  return (
    <button type="button" disabled={busy} onClick={out} className="transition-colors hover:text-black disabled:opacity-50">
      Sign out
    </button>
  );
}
