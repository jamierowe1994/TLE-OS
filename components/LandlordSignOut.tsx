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
      className="rounded-full border border-line/70 bg-panel px-3.5 py-2 text-[12.5px] text-muted transition-colors hover:border-ink/40 hover:text-ink disabled:opacity-50"
    >
      Sign out
    </button>
  );
}
