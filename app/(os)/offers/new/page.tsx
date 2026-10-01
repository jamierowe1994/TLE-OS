"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import AgentOfferRecorder, { type OfferHome, type OfferTenant } from "@/components/offers/AgentOfferRecorder";
import type { PassportData } from "@/lib/passport-shape";

/**
 * Put an offer forward for a tenant (1 Oct 2026). Opened from a viewing with
 * ?listing=<id>&name=&email=, so the home and the person arrive chosen; the
 * passport is read on the server and everything it knows is filled in.
 */

type Ctx = {
  ok: boolean;
  error?: string;
  home: OfferHome | null;
  tenant: { name: string; email: string; passport: PassportData | null; passportDoneOn: string | null };
};

export default function NewOffer() {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [me, setMe] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const qs = new URLSearchParams({ listing: sp.get("listing") ?? "", name: sp.get("name") ?? "", email: sp.get("email") ?? "" });
    fetch(`/api/offers/agent?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Ctx) => (j.ok ? setCtx(j) : setErr(j.error ?? "Couldn't open that.")))
      .catch(() => setErr("Couldn't open that."));
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setMe(j?.user?.name ?? j?.name ?? ""))
      .catch(() => null);
  }, []);

  const tenant: OfferTenant | null = ctx
    ? { id: ctx.tenant.email, name: ctx.tenant.name, email: ctx.tenant.email, passport: ctx.tenant.passport, passportDoneOn: ctx.tenant.passportDoneOn }
    : null;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      <PageHeader title="Put an Offer Forward" blurb="For the tenant, from what their passport already knows. Only change what has changed." />
      <div className="mt-6">
        {err ? (
          <p className="rounded-[14px] bg-[#fdefec] px-4 py-3 text-[13.5px] text-[#9d4340]">{err}</p>
        ) : !ctx ? (
          <p className="text-[13.5px] text-muted">Opening the home and their passport…</p>
        ) : !ctx.home ? (
          <p className="rounded-[14px] bg-[#fdefec] px-4 py-3 text-[13.5px] text-[#9d4340]">That home isn&apos;t on the market any more, so an offer can&apos;t go on it.</p>
        ) : !ctx.tenant.email ? (
          <p className="rounded-[14px] bg-[#fdefec] px-4 py-3 text-[13.5px] text-[#9d4340]">There&apos;s no email address for the tenant. Add one to their record first.</p>
        ) : (
          <AgentOfferRecorder tenant={tenant!} home={ctx.home} agentName={me || "you"} sample={false} />
        )}
      </div>
    </div>
  );
}
