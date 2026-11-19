"use client";

import DepositsNew from "@/components/new-look/admin/DepositsNew";
import { NlLoading } from "@/components/new-look/admin/ScreenBits";
import { useNewLook } from "@/lib/use-new-look";

/**
 * Admin > Compliance > Deposits (Susan, 18 Nov 2026): every let home's
 * deposit for the Propertymark audit. New look only - there is no old
 * screen to fall back to; the page carries its own data-look root so it
 * draws the same under ?look=old.
 */
export default function DepositsPage() {
  const look = useNewLook("admin");
  if (look === null) return <NlLoading what="Loading the deposit register" />;
  return <DepositsNew />;
}
