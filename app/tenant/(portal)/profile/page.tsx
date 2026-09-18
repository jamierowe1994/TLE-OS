import Link from "next/link";
import { redirect } from "next/navigation";
import { currentTenant, tenantPassport } from "@/lib/tenant-account";

export const dynamic = "force-dynamic";
export const metadata = { title: "My details · The Letting Experts" };

/**
 * The tenant's own details: who we have them down as, and their passport.
 *
 * Rewritten 18 Sep 2026. This page was still the mock-up: income, pets and a
 * photograph under "this is what a landlord sees beside your offer", a "Saved"
 * tick, and nothing ever left the browser - no agent and no landlord saw any of
 * it. What a landlord is actually shown comes from the rental passport, so this
 * page now says who they are signed in as and sends them there.
 */
export default async function TenantProfile() {
  const me = await currentTenant();
  if (!me) redirect("/tenant/sign-in");
  const passport = await tenantPassport(me.email).catch(() => null);

  const initials = me.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="mx-auto max-w-2xl py-10">
      <h1 className="text-[30px] leading-tight">My Details</h1>

      <div className="mt-6 flex items-center gap-5">
        <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-line/70 bg-box text-[22px] font-semibold text-muted">
          {initials || "?"}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold">{me.name}</p>
          <p className="truncate text-[12px] text-muted">{me.email} · the address you sign in with</p>
        </div>
      </div>

      <div className="mt-8 space-y-4 rounded-[18px] border border-line/60 bg-white p-5 text-[13.5px] leading-relaxed">
        {passport ? (
          <>
            <p>
              Your rental passport is what we share with a landlord when you make an offer: who is moving, your work and income, pets and
              anything else you have told us. Keep it up to date and your offer is ready the moment you find a home.
            </p>
            <Link
              href={`/tenant/passport/${passport.token}`}
              className="inline-flex rounded-full px-5 py-2.5 text-[13px] font-semibold text-white"
              style={{ background: "var(--accent-dark)" }}
            >
              {passport.submittedAt ? "Update your passport" : "Finish your passport"}
            </Link>
          </>
        ) : (
          <p>To change your name or the address you sign in with, reply to any email from your agent and they will update it for you.</p>
        )}
      </div>
    </div>
  );
}
