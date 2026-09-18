import Link from "next/link";
import { redirect } from "next/navigation";
import { currentLandlord } from "@/lib/landlord-account";

export const metadata = { title: "My details · The Letting Experts" };

/**
 * The landlord's own details: who we have them down as, and nothing else.
 *
 * Rewritten 18 Sep 2026. This page was still the mock-up: every landlord who
 * opened it was shown "Raj Chauhan", his email and phone, "your rent is paid to
 * the account ending 624", and a repair approval limit that said "Saved" and
 * went no further than their own browser. It now shows what is true - the name
 * and the sign-in address on the account - and sends every change to a person.
 * Bank details are never changed on a web form.
 */
export default async function LandlordProfile() {
  const me = await currentLandlord();
  if (!me) redirect("/landlord/sign-in");

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
        <p>
          To change your name, phone number or the address you sign in with, message your agent and they will update it for you.
        </p>
        <p className="text-muted">
          For your security, bank details are never changed online. If the account your rent is paid to needs to change, your agent will
          arrange it with you by phone.
        </p>
        <Link
          href="/landlord/messages"
          className="inline-flex rounded-full px-5 py-2.5 text-[13px] font-semibold text-white"
          style={{ background: "var(--accent-dark)" }}
        >
          Message your agent
        </Link>
      </div>
    </div>
  );
}
