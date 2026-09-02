import Link from "next/link";
import { currentLandlord } from "@/lib/landlord-account";

const RED = "#e31f36";

/**
 * Shown once, the first time a landlord comes through the door. No password
 * to choose any more - the link is the sign-in - so this is the welcome and
 * the plain-English notice about their details, then straight in.
 */
export default async function LandlordWelcome() {
  const me = (await currentLandlord())!;
  const first = me.name.split(/\s+/)[0] || me.name;
  return (
    <div className="mx-auto max-w-md py-14">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: RED }}>
        Welcome aboard
      </p>
      <h1 className="mt-2 text-[26px] font-bold leading-tight">Your property file, {first}</h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-black/60">
        This is where your properties with us live: what is let, to whom, since when, and who is
        looking after it. Certificates, offers and your documents are on their way here too.
      </p>
      <p className="mt-3 text-[12.5px] text-black/50">
        You are signed in as <span className="font-semibold text-black/70">{me.email}</span>. Next
        time, ask for a fresh link from the sign-in page and it will bring you straight back here.
      </p>

      <div className="mt-8 rounded-xl border border-black/10 bg-[#fafafa] p-4 text-[12px] leading-relaxed text-black/60">
        <p className="text-[12.5px] font-bold text-black/80">How we look after your details</p>
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
        className="mt-8 block w-full rounded-lg py-3.5 text-center text-[14px] font-bold text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: RED }}
      >
        Open my properties
      </Link>
    </div>
  );
}
