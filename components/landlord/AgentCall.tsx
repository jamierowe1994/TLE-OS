import DoodleIcon from "@/components/DoodleIcon";
import type { LandlordView } from "@/lib/landlord-view";

/**
 * THE AGENT'S NUMBER, top right, on a phone.
 *
 * James, 16 Sep 2026: "put the contact number for Sam in the top-right corner."
 *
 * The full AgentCard is a photograph, a name, two links and a Message button -
 * right on a desktop where it sits in its own column, and on a phone a block
 * of screen between the landlord and the thing they came to do. What survives
 * is the half that matters when somebody is stuck halfway through sending a
 * certificate: the number, as one tap.
 *
 * It is a tel: link with the number written out beside it rather than a bare
 * icon. A phone icon alone is a guess; the digits are a promise, and on the
 * off-chance they are reading this on a tablet with no dialler they can still
 * see what to type.
 */
export default function AgentCall({ v }: { v: LandlordView }) {
  const phone = v.agent?.phone;
  if (!phone) return null;
  const first = v.agent?.name.split(/\s+/)[0] ?? "your agent";

  return (
    <a
      href={`tel:${phone.replace(/\s+/g, "")}`}
      className="flex shrink-0 items-center gap-2.5 rounded-full border border-line/60 bg-white py-2 pl-2 pr-4 lg:hidden"
      aria-label={`Call ${first} on ${phone}`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
        <DoodleIcon name="call" size={14} />
      </span>
      <span className="leading-tight">
        <span className="block text-[10.5px] text-muted">{first}</span>
        <span className="block whitespace-nowrap text-[12.5px] font-semibold">{phone}</span>
      </span>
    </a>
  );
}
