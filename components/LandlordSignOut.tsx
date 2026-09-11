"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * Clears the landlord cookie and lands on the sign-in page. "nav" is the
 * "Log out" row at the foot of the portal's sidebar (11 Sep 2026).
 */
export default function LandlordSignOut({ variant = "pill" }: { variant?: "pill" | "nav" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const out = async () => {
    setBusy(true);
    await fetch("/api/landlord/session", { method: "DELETE" }).catch(() => {});
    router.push("/landlord/sign-in");
    router.refresh();
  };
  if (variant === "nav") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={out}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] text-muted transition-colors hover:bg-accent-soft/60 hover:text-ink disabled:opacity-50"
      >
        <DoodleIcon name="logout" size={17} />
        {busy ? "Logging out…" : "Log out"}
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={busy}
      onClick={out}
      className="rounded-full border border-line/70 bg-panel px-3.5 py-2 text-[12.5px] text-muted transition-colors hover:border-ink/40 hover:text-ink disabled:opacity-50"
    >
      Sign out
    </button>
  );
}
