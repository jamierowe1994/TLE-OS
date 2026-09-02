import Link from "next/link";
import { currentLandlord } from "@/lib/landlord-account";

/**
 * Shown once, the first time a landlord comes through the door. No password
 * to choose - the link is the sign-in - so this is the welcome and the
 * plain-English notice about their details, then straight in.
 */
export default async function LandlordWelcome() {
  const me = (await currentLandlord())!;
  const first = me.name.split(/\s+/)[0] || me.name;
  return (
    <div className="mx-auto grid max-w-3xl items-center gap-10 py-14 md:grid-cols-[1fr_240px]">
      <div className="fade-up">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Welcome aboard</p>
        <h1 className="mt-2 text-[30px] leading-tight">Your property file, {first}</h1>
        <p className="mt-3 max-w-[48ch] text-[13.5px] leading-relaxed text-muted">
          This is where your property with us lives: where it is on the way to being let, the
          figure we gave you, your presentation, your terms, and who is looking after it.
        </p>
        <p className="mt-3 text-[12.5px] text-muted">
          You are signed in as <span className="font-semibold text-ink">{me.email}</span>. Next time,
          ask for a fresh link from the sign-in page and it will bring you straight back here.
        </p>

        <div className="mt-8 rounded-2xl border border-line/80 bg-panel p-5 text-[12.5px] leading-relaxed text-muted">
          <h2 className="text-[15px] text-ink">How we look after your details</h2>
          <p className="mt-2">
            We hold your contact details, your properties and your instructions so we can let and
            manage them - that&rsquo;s the whole reason.
          </p>
          <p className="mt-2">
            We share details only where the tenancy needs it: deposit protection, referencing, the
            tenant of your property. Never sold, ever.
          </p>
          <p className="mt-2">Ask for a copy, a correction or deletion any time - hello@thelettingexperts.co.uk.</p>
        </div>

        <Link
          href="/landlord"
          className="mt-8 block w-full rounded-xl bg-accent-dark py-3 text-center text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          Open my property file
        </Link>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/illustrations/people/moving-day.svg" alt="" className="hidden w-full md:block" />
    </div>
  );
}
