"use client";

import { useEffect } from "react";

/**
 * Says they opened Show Me Other Homes (lib/let-notice recordAsked), from the
 * browser rather than the page load: a mail scanner fetching every link in an
 * email would otherwise tell the agent somebody is still looking.
 */
export default function AskedPing({ token }: { token: string }) {
  useEffect(() => {
    void fetch("/api/tenant/homes/asked", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ guest: token }) }).catch(() => null);
  }, [token]);
  return null;
}
