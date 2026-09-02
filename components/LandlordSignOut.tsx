"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Clears the landlord cookie and lands on the sign-in page. */
export default function LandlordSignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/landlord/session", { method: "DELETE" }).catch(() => {});
        router.push("/landlord/sign-in");
        router.refresh();
      }}
      className="text-[12.5px] font-medium text-black/60 transition-colors hover:text-black disabled:opacity-50"
    >
      Sign out
    </button>
  );
}
