"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import type { Appt } from "@/lib/diary";
import type { PhonePerson } from "@/app/api/m/people/route";
import type { PhoneEventFacts } from "@/app/api/m/event/route";
import { BackLink, ErrorLine, ReachButtons, Spinner, mapsHref } from "../../bits";
import { DIARY_KEY, KIND_ART, KIND_LABEL, endOf } from "../../diary-bits";

/**
 * ONE APPOINTMENT, AND THE BARE BASICS FOR IT (James, 18 Sep 2026).
 *
 * "If, let's say, it was Steve Jobs' appointment at 1:30, we'll be able to
 * click onto it and then see the tenant information, the viewer's
 * information, the access details, the landlord information ... the real bare
 * basics."
 *
 * In the order you need them at the door: who you are meeting, how you get
 * in, who lives there, whose home it is, and the few facts about it. Read
 * only; the one action is the ID camera on a viewing.
 */

const WITH_LABEL: Record<string, string> = {
  viewing: "The Viewer",
  appraisal: "The Landlord",
  takeon: "The Landlord",
  movein: "The Tenant",
  inspection: "With",
  other: "With",
};

export default function PhoneEvent() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(String(params?.id ?? ""));
  const [appt, setAppt] = useState<Appt | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    try {
      const held = JSON.parse(sessionStorage.getItem(DIARY_KEY) ?? "[]") as Appt[];
      const hit = held.find((a) => a.id === id);
      if (hit) return setAppt(hit);
    } catch {
      /* Asked again below. */
    }
    fetch("/api/diary", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; live?: boolean; appts?: Appt[]; mine?: Appt[]; error?: string }) => {
        if (dead) return;
        if (!j.ok) throw new Error(j.error ?? "Your calendar did not load.");
        setAppt((j.live ? j.appts : j.mine)?.find((a) => a.id === id) ?? null);
      })
      .catch((e: Error) => !dead && setError(e.message));
    return () => {
      dead = true;
    };
  }, [id]);

  return (
    <main>
      {appt ? (
        <Event appt={appt} />
      ) : (
        <>
          <div className="mb-4">
            <BackLink href="/agent/day" />
          </div>
          {error ? (
            <ErrorLine text={error} />
          ) : appt === undefined ? (
            <Spinner label="Opening the appointment" className="py-8" />
          ) : (
            <p className="py-8 text-center text-[14.5px] text-muted">That appointment is no longer in your calendar.</p>
          )}
        </>
      )}
    </main>
  );
}

function Event({ appt }: { appt: Appt }) {
  const [facts, setFacts] = useState<PhoneEventFacts | null>(null);
  const [factsError, setFactsError] = useState<string | null>(null);
  const [people, setPeople] = useState<PhonePerson[] | null>(null);

  useEffect(() => {
    if (!appt.where) return setFacts({ property: null, appraisal: null });
    fetch(`/api/m/event?where=${encodeURIComponent(appt.where)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: PhoneEventFacts & { ok?: boolean; error?: string }) => {
        if (!j.ok) throw new Error(j.error ?? "The property details did not load.");
        setFacts(j);
      })
      .catch((e: Error) => setFactsError(e.message));
  }, [appt.where]);

  /* The diary knows the person's name only, so their number is found by it:
     the OS's own records first, the full contact book if those have nobody. */
  useEffect(() => {
    const who = appt.who.trim();
    if (who.length < 2) return setPeople([]);
    if (appt.contact && (appt.contact.phone || appt.contact.email)) {
      return setPeople([{ key: "diary", name: who, role: "", context: "", phone: appt.contact.phone, email: appt.contact.email }]);
    }
    let dead = false;
    (async () => {
      const ask = async (extra: string) => {
        const r = await fetch(`/api/m/people?q=${encodeURIComponent(who)}${extra}`, { cache: "no-store" });
        const j = (await r.json().catch(() => ({}))) as { people?: PhonePerson[] };
        return (j.people ?? []).filter((p) => p.name.toLowerCase().trim() === who.toLowerCase());
      };
      const first = await ask("").catch(() => []);
      if (dead) return;
      if (first.length) return setPeople(first.slice(0, 2));
      const second = await ask("&rex=1").catch(() => []);
      if (!dead) setPeople(second.slice(0, 2));
    })();
    return () => {
      dead = true;
    };
  }, [appt.who, appt.contact]);

  const p = facts?.property ?? null;
  const ma = facts?.appraisal ?? null;
  const tenants = p?.tenants ?? [];
  const landlord = p?.landlord ?? (ma ? { name: ma.landlord, phone: ma.phone, email: ma.email } : null);
  const withIsLandlord = Boolean(landlord && appt.who && landlord.name.toLowerCase().trim() === appt.who.toLowerCase().trim());
  const sitting = tenants.length ? tenants.map((t) => t.name).join(", ") : appt.tenant ?? null;

  const access: string[] = [];
  if (appt.unaccompanied) access.push("Unaccompanied - nobody from us is going.");
  if (ma?.access) access.push(`${ma.access.label}. ${ma.access.detail}`);
  else if (sitting) access.push(`Tenanted - ${sitting} lives there, so arrange access with them first.`);
  /* Vacant only when the diary says so: a listing with no tenant on it may
     just be a record nobody has filled in. */
  else if (appt.tenant === null) access.push("Vacant - nobody is living there.");
  else if (p) access.push("No tenant on the record. Check with the landlord before you go in.");

  const idHref = `/agent/id-check?${new URLSearchParams({ name: appt.who, property: appt.where, appt: appt.id }).toString()}`;

  return (
    <>
      {/* The drawing on its own card with the back button over it - the
          reference's "Meditation" screen (2 Oct 2026). */}
      <div className="m-group relative flex h-[240px] items-center justify-center">
        <div className="absolute left-3 top-3">
          <BackLink href="/agent/day" />
        </div>
        <img src={KIND_ART[appt.kind] ?? KIND_ART.other} alt="" className="m-ill h-[210px] w-auto" />
      </div>
      <h1 className="m-title mt-5 text-[28px] leading-[1.15]">{appt.where || appt.what}</h1>
      <p className="mt-1.5 flex items-center gap-1.5 text-[14px] text-muted">
        <DoodleIcon name="clock" size={15} />
        {KIND_LABEL[appt.kind] ?? "Appointment"} · {appt.start} - {endOf(appt)}
      </p>
      {appt.where && (
        <a href={mapsHref(appt.where, appt.lat, appt.lng)} target="_blank" rel="noreferrer" className="m-btn m-press mt-5">
          <DoodleIcon name="target" size={17} /> Directions
        </a>
      )}

      {appt.who && (
        <Section title={WITH_LABEL[appt.kind] ?? "With"}>
          {people === null ? (
            <>
              <Name>{appt.who}</Name>
              <Spinner label="Finding their number" className="mt-3" />
            </>
          ) : people.length === 0 ? (
            <>
              <Name>{appt.who}</Name>
              <p className="mt-1 text-[13.5px] text-muted">No number found for this name.</p>
            </>
          ) : (
            people.map((x) => (
              <div key={x.key} className="mt-3 first:mt-0">
                <Name>{x.name}</Name>
                <Line>{[x.phone, x.email].filter(Boolean).join(" - ")}</Line>
                <ReachButtons phone={x.phone} email={x.email} />
              </div>
            ))
          )}
        </Section>
      )}

      <Section title="Access">
        {factsError ? (
          <p className="text-[13.5px] text-muted">{factsError}</p>
        ) : !facts ? (
          <Spinner label="Checking the property" />
        ) : access.length ? (
          access.map((a) => (
            <p key={a} className="text-[15px] leading-snug [&+p]:mt-2">
              {a}
            </p>
          ))
        ) : (
          <p className="text-[14px] text-muted">Nothing recorded about access.</p>
        )}
      </Section>

      {tenants.length > 0 && (
        <Section title={tenants.length > 1 ? "The Tenants" : "The Tenant"}>
          {tenants.map((t) => (
            <div key={t.name} className="mt-3 first:mt-0">
              <Name>{t.name}</Name>
              {t.phone && <Line>{t.phone}</Line>}
              <ReachButtons phone={t.phone} email="" />
            </div>
          ))}
        </Section>
      )}

      {landlord && !withIsLandlord && (
        <Section title="The Landlord">
          <Name>{landlord.name}</Name>
          <Line>{[landlord.phone, landlord.email].filter(Boolean).join(" - ")}</Line>
          <ReachButtons phone={landlord.phone} email={landlord.email} />
        </Section>
      )}

      {p && (p.rent || p.status || p.propertyType) && (
        <Section title="The Property">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {p.rent && <Fact label="Rent" value={p.rent} />}
            {p.status && <Fact label="Status" value={p.status} />}
            {p.propertyType && <Fact label="Type" value={p.propertyType} />}
            {p.availableFrom && <Fact label="Available" value={new Date(p.availableFrom).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} />}
          </dl>
        </Section>
      )}

      {appt.kind === "viewing" && appt.who && (
        <Link href={idHref} className="m-btn m-btn-primary m-press mt-6 !h-[52px]">
          <DoodleIcon name="camera" size={18} /> Scan Their ID
        </Link>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <p className="m-eyebrow mb-2 px-1">{title}</p>
      <div className="m-group p-4">{children}</div>
    </section>
  );
}

const Name = ({ children }: { children: React.ReactNode }) => <p className="text-[17px] font-semibold leading-snug">{children}</p>;
const Line = ({ children }: { children: React.ReactNode }) =>
  children ? <p className="mt-0.5 break-words text-[13.5px] text-muted">{children}</p> : null;

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="text-[15px] font-semibold">{value}</dd>
    </div>
  );
}
