"use client";

import { useEffect, useRef } from "react";
import { Badge } from "@/components/new-look/Parts";
import type { AlertRule, AlertTypeDef } from "@/lib/alert-types";
import { useSwitches } from "@/lib/use-switches";
import { SwitchRowNew } from "@/components/new-look/admin/SwitchesNew";
import { ErrorLine, Loading, Section, Tab, nd } from "@/components/new-look/admin/bits";

/**
 * Admin > System > Phone alerts in the new look (24 Oct 2026).
 *
 * The master switch lives HERE now, and only here: it decides whether any of
 * the kinds below reaches a phone, so it belongs beside them (James, 24 Oct
 * 2026: remove the overlapping fields). It is the same switch Switches used
 * to carry (lib/switches "phone_alerts"), armed the same way through
 * lib/use-switches, typed phrase and all. The old look still has it on both.
 */

export type AlertRow = AlertTypeDef & { rule: AlertRule; optedOut: number };
export type AlertData = { armed: boolean; people: number; phones: number; types: AlertRow[] };

export const RULES: Array<{ id: AlertRule; label: string }> = [
  { id: "off", label: "Off" },
  { id: "on", label: "On" },
  { id: "always", label: "Always" },
];

export default function AlertsNew({
  data,
  denied,
  error,
  busy,
  set,
  reload,
}: {
  data: AlertData | null;
  denied: boolean;
  error: string | null;
  busy: string | null;
  set: (type: string, rule: AlertRule) => void | Promise<void>;
  reload: () => void;
}) {
  const sw = useSwitches();
  const master = sw.rows?.find((s) => s.key === "phone_alerts") ?? null;

  /* The switch moved: ask the alert rules again, so "armed" up here and the
     switch say the same thing. */
  const seen = useRef<boolean | null>(null);
  useEffect(() => {
    if (!master) return;
    if (seen.current !== null && seen.current !== master.on) reload();
    seen.current = master.on;
  }, [master, reload]);

  if (denied) {
    return (
      <Tab>
        <p className="nl-empty">Nothing here. Phone alerts are for owners.</p>
      </Tab>
    );
  }

  return (
    <Tab>
      <p className="nl-meta nl-adm-lede">What buzzes people&apos;s phones through the TLE OS app. Leave a kind On and each person can switch it off for themselves, or set it to Always so nobody can.</p>

      <Section title="The Master Switch" aside={data && <span className="nl-meta">{data.people} {data.people === 1 ? "person" : "people"} on {data.phones} {data.phones === 1 ? "phone" : "phones"}</span>}>
        {sw.denied ? (
          <ErrorLine onRetry={sw.load}>The Phone alerts switch could not be read.</ErrorLine>
        ) : !sw.rows ? (
          <Loading what="Reading the switch…" />
        ) : !master ? (
          <ErrorLine>The Phone alerts switch is missing from the switches list.</ErrorLine>
        ) : (
          <>
            {sw.locked && (
              <div className="nl-adm-panel is-bad nl-adm-gapb">
                <p>SENDING_LOCKED is set in Railway, so this switch reads off whatever it says. Clear it there.</p>
              </div>
            )}
            {sw.flash && (
              <p className="nl-adm-flash nl-adm-gapb" role="status">
                {nd(sw.flash)}
              </p>
            )}
            <ul className="nl-adm-rows">
              <SwitchRowNew s={master} sw={sw} locked={sw.locked} />
            </ul>
            <p className="nl-meta nl-adm-after">
              {master.on ? "Sent every five minutes." : "Nothing below is sent until this is on. A test to your own phone still works."}
            </p>
          </>
        )}
      </Section>

      <Section title="Kind by Kind">
        {error && <ErrorLine onRetry={reload}>{nd(error)}</ErrorLine>}
        {!data ? (
          !error && <Loading what="Reading the alert rules…" />
        ) : (
          <ul className="nl-adm-rows">
            {data.types.map((t) => (
              <li key={t.key}>
                <div className="nl-adm-row-main">
                  <div className="nl-adm-row-line">
                    <span className="nl-strong">{t.label}</span>
                    {t.rule === "on" && t.optedOut > 0 && (
                      <Badge tone="neutral" bare>
                        {`${t.optedOut} switched off`}
                      </Badge>
                    )}
                  </div>
                  <p className="nl-meta">{nd(t.what)}</p>
                  <p className="nl-meta">
                    Goes to: <span className="nl-adm-who-to">{nd(t.who)}</span>
                  </p>
                </div>
                <div className="nl-adm-row-side">
                  <div role="radiogroup" aria-label={t.label} className="nl-toggle nl-adm-seg">
                    {RULES.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        role="radio"
                        aria-checked={t.rule === r.id}
                        disabled={busy === t.key}
                        onClick={() => t.rule !== r.id && void set(t.key, r.id)}
                        className={t.rule === r.id ? "is-on" : undefined}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="nl-meta nl-adm-after">The bell on every screen still shows everything. These settings only decide what is sent to a phone.</p>
      </Section>
    </Tab>
  );
}
