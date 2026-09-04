"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Clears the tenant cookie and lands on the sign-in page. */
export default function TenantSignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/tenant/session", { method: "DELETE" }).catch(() => {});
        router.push("/tenant/sign-in");
        router.refresh();
      }}
      className="transition-colors hover:text-black disabled:opacity-50"
    >
      Sign out
    </button>
  );
}
