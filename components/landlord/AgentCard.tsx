import DoodleIcon from "@/components/DoodleIcon";
import MessageTile from "@/components/landlord/MessageTile";
import type { LandlordView } from "@/lib/landlord-view";

/**
 * The agent, top right on every page of the portal: photo or initial, name,
 * phone and email, and "Message" opening the real thread. id="messages" is
 * where the sidebar's Messages lands.
 */
export default function AgentCard({ v }: { v: LandlordView }) {
  if (!v.agent) return null;
  const first = v.agent.name.split(/\s+/)[0] ?? "your agent";
  return (
    <div id="messages" className="flex flex-wrap items-center gap-4 rounded-[22px] border border-line/60 bg-white px-5 py-4" data-search>
      {v.agent.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={v.agent.photo} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[24px] font-semibold text-accent-dark">
          {v.agent.name[0]}
        </span>
      )}
      <div className="min-w-0">
        <p className="text-[11.5px] text-muted">Your letting agent</p>
        <p className="text-[19px] font-bold leading-tight">{v.agent.name}</p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
          {v.agent.phone && (
            <a href={`tel:${v.agent.phone.replace(/\s+/g, "")}`} className="flex items-center gap-1.5 hover:text-ink">
              <DoodleIcon name="call" size={13} />
              {v.agent.phone}
            </a>
          )}
          {v.agent.email && (
            <a href={`mailto:${v.agent.email}`} className="flex items-center gap-1.5 hover:text-ink">
              <DoodleIcon name="mail" size={13} />
              {v.agent.email}
            </a>
          )}
        </p>
      </div>
      <div className="lg:ml-4">
        <MessageTile
          variant="button"
          appraisalId={v.appraisalId ?? null}
          agentName={v.agent.name}
          messages={v.messages ?? []}
          label={`Message ${first}`}
          sub=""
          icon="message"
        />
      </div>
    </div>
  );
}
