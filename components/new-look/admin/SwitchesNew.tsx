"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Tabs } from "@/components/new-look/Parts";
import { useAreaSwitches, BUTTON_SAYS } from "@/components/AreaSwitches";
import { useNewLookSwitches } from "@/components/NewLookSwitches";
import { AREA_LEVELS } from "@/lib/area-map";
import { LOOK_LEVELS } from "@/lib/new-look";
import type { useSwitches, SwitchRow } from "@/lib/use-switches";
import { ErrorLine, Loading, Tab, nd, when } from "@/components/new-look/admin/bits";

/**
 * Admin > System > Switches in the new look (24 Oct 2026).
 *
 * The same three things the old page stacks - what sends and writes, how far
 * each screen is on, and the new look itself - as three in-page tabs, with
 * every switch on a hairline row. Arming still asks for the typed phrase,
 * checked on the server; turning off is one press.
 *
 * The Phone alerts master switch is not here. It lives on the Phone alerts
 * tab, beside the kinds it decides (James, 24 Oct 2026: no field in two
 * places), and this list says where it went.
 */

type Sw = ReturnType<typeof useSwitches>;
type Pane = "sends" | "areas" | "look";

/** The one switch that moved to its own tab. */
const MOVED: Record<string, { href: string; says: string }> = {
  phone_alerts: { href: "/admin/alerts", says: "Phone alerts are on the Phone alerts tab" },
};

export function SwitchRowNew({ s, sw, locked }: { s: SwitchRow; sw: Sw; locked: boolean }) {
  const { arming, setArming, typed, setTyped, busy, setFlash, change } = sw;
  return (
    <li>
      <div className="nl-adm-row-main">
        <div className="nl-adm-row-line">
          <span className="nl-strong">{s.label}</span>
          <Badge tone={s.on ? "good" : "neutral"} bare>
            {s.on ? "On" : "Off"}
          </Badge>
        </div>
        <p className="nl-meta">{nd(s.what)}</p>
        <p className="nl-meta">
          Goes to: <span className="nl-adm-who-to">{nd(s.who)}</span>
        </p>
        <p className="nl-meta">
          {s.fromEnv
            ? `Still decided by ${s.legacyEnv} in Railway. The first time you use this switch it takes over.`
            : `Last changed by ${s.changedBy || "somebody"}${s.changedAt ? `, ${when(s.changedAt, { year: "numeric" })}` : ""}.`}
        </p>
        {arming === s.key && (
          <div className="nl-adm-panel is-warn">
            {/* Reads back what it does and who it reaches: one of these writes
                into REX and emails nobody. */}
            <p>Once armed: {nd(s.what)}</p>
            <p>
              Reaches: <span className="nl-adm-who-to">{nd(s.who)}</span>
            </p>
            <p>
              Type <span className="nl-strong">{s.confirm}</span> to arm it.
            </p>
            <div className="nl-adm-arm">
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={s.confirm}
                aria-label={`Type ${s.confirm} to arm ${s.label}`}
                className="nl-input"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !busy) void change(s.key, true, typed);
                }}
              />
              <button type="button" disabled={busy} onClick={() => void change(s.key, true, typed)} className="nl-btn nl-btn--primary nl-btn--sm">
                {busy ? "Arming…" : "Arm It"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setArming(null);
                  setTyped("");
                }}
                className="nl-btn nl-btn--quiet nl-btn--sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="nl-adm-row-side">
        <button
          type="button"
          role="switch"
          aria-checked={s.on}
          aria-label={s.on ? `Turn off ${s.label}` : `Turn on ${s.label}`}
          title={s.on ? "Turn off: one press" : locked ? "SENDING_LOCKED is set in Railway" : "Turn on: asks for the typed phrase"}
          disabled={busy || (!s.on && locked)}
          className={`nl-switch${s.on ? " is-on" : ""}`}
          onClick={() => {
            if (s.on) void change(s.key, false, "");
            else {
              setArming(arming === s.key ? null : s.key);
              setTyped("");
              setFlash(null);
            }
          }}
        >
          <i />
        </button>
      </div>
    </li>
  );
}

export default function SwitchesNew({ sw }: { sw: Sw }) {
  const [pane, setPane] = useState<Pane>("sends");
  const { rows, locked, denied, flash } = sw;

  if (denied) {
    return (
      <Tab>
        <p className="nl-empty">Nothing here. Switches are for owners.</p>
      </Tab>
    );
  }

  const on = rows?.filter((s) => s.on && !MOVED[s.key]).length ?? null;

  return (
    <Tab>
      <p className="nl-meta nl-adm-lede">Which screens agents can use, and what the system is allowed to send and write. Nothing that sends is on until you turn it on.</p>
      <Tabs<Pane>
        label="Switches"
        className="nl-ltabs"
        value={pane}
        onChange={setPane}
        items={[
          { id: "sends", label: "Sends and Writes", count: on },
          { id: "areas", label: "Areas" },
          { id: "look", label: "The New Look" },
        ]}
      />

      {pane === "sends" && (
        <div className="nl-pane">
          {!rows ? (
            <Loading what="Reading the switches…" />
          ) : (
            <>
              {locked && (
                <div className="nl-adm-panel is-bad nl-adm-gapb">
                  <p>
                    <span className="nl-strong">Everything is held by SENDING_LOCKED.</span> It is set in Railway and overrides every switch below, whatever they say. It is the brake for when something has gone wrong, and it can&apos;t be released from here: clear it in Railway.
                  </p>
                </div>
              )}
              {flash && (
                <p className="nl-adm-flash nl-adm-gapb" role="status">
                  {nd(flash)}
                </p>
              )}
              <ul className="nl-adm-rows">
                {rows.map((s) =>
                  MOVED[s.key] ? (
                    <li key={s.key}>
                      <div className="nl-adm-row-main">
                        <Link href={MOVED[s.key].href} className="nl-link">
                          {MOVED[s.key].says}
                        </Link>
                      </div>
                    </li>
                  ) : (
                    <SwitchRowNew key={s.key} s={s} sw={sw} locked={locked} />
                  )
                )}
              </ul>
              <p className="nl-meta nl-adm-after">Turning something off takes one press. Turning it on asks you to type the phrase, and that is checked on the server rather than in this page.</p>
            </>
          )}
        </div>
      )}

      {pane === "areas" && <AreasPane />}
      {pane === "look" && <LookPane />}
    </Tab>
  );
}

function AreasPane() {
  const { areas, testers, busy, flash, email, setEmail, call } = useAreaSwitches();
  if (!areas) {
    return <div className="nl-pane">{flash ? <ErrorLine>{nd(flash)}</ErrorLine> : <Loading what="Reading the areas…" />}</div>;
  }
  const label = (id: string | null) => areas.find((x) => x.id === id)?.label ?? id ?? "";
  return (
    <div className="nl-pane">
      <p className="nl-meta nl-adm-lede">How far each screen is switched on for agents. Kirstie, Michael and marketing keep their own screens whatever these say, and you always see everything. An area nobody has set is on for everyone.</p>
      {flash && (
        <p className="nl-adm-flash nl-adm-gapb" role="status">
          {nd(flash)}
        </p>
      )}
      <ul className="nl-adm-rows">
        {areas.map((a) => (
          <li key={a.id} className={a.parent ? "is-child" : undefined}>
            <div className="nl-adm-row-main">
              <div className="nl-adm-row-line">
                <span className="nl-strong">{a.label}</span>
                <span className="nl-meta">{a.parent ? `Button in ${label(a.parent)}` : a.phase === 1 ? "Core" : "Secondary"}</span>
              </div>
              <p className="nl-meta">
                {a.changedAt
                  ? `${AREA_LEVELS.find((l) => l.id === a.level)?.label} since ${when(a.changedAt)}, by ${a.changedBy || "somebody"}`
                  : "Never set, so on for everyone"}
              </p>
              {a.parent && (
                <p className="nl-meta">
                  {BUTTON_SAYS[a.level]} Never further on than {label(a.parent) || "its screen"}.
                </p>
              )}
            </div>
            <div className="nl-adm-row-side">
              <div role="radiogroup" aria-label={`${a.label} position`} className="nl-toggle nl-adm-seg">
                {AREA_LEVELS.map((l) => {
                  const disabled = busy !== null || (l.id === "hidden" && !a.canHide);
                  const isOn = a.level === l.id;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      role="radio"
                      aria-checked={isOn}
                      title={l.id === "hidden" && !a.canHide ? "The dashboard is where everybody lands, so it can't be hidden." : a.parent ? BUTTON_SAYS[l.id] : l.says}
                      disabled={disabled}
                      onClick={() => !isOn && call("PATCH", { area: a.id, level: l.id }, a.id)}
                      className={isOn ? "is-on" : undefined}
                    >
                      {l.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <h3 className="nl-adm-sub">Testers</h3>
      <p className="nl-meta">Where an area is set to Testers, these people can act in it and every other agent can only look.</p>
      <ul className="nl-adm-rows nl-adm-after">
        {testers.map((t) => (
          <li key={t.email}>
            <div className="nl-adm-row-main">
              <span className="nl-strong">{t.email}</span>
              <p className="nl-meta">Added by {t.addedBy || "somebody"}{t.addedAt ? `, ${when(t.addedAt)}` : ""}</p>
            </div>
            <div className="nl-adm-row-side">
              <button type="button" disabled={busy !== null} onClick={() => call("DELETE", { email: t.email }, t.email)} aria-label={`Stop ${t.email} being a tester`} className="nl-btn nl-btn--quiet nl-btn--sm">
                Remove
              </button>
            </div>
          </li>
        ))}
        {!testers.length && (
          <li>
            <p className="nl-meta">Nobody yet.</p>
          </li>
        )}
      </ul>
      <form
        className="nl-adm-form nl-adm-after"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) void call("POST", { email: email.trim() }, "tester").then(() => setEmail(""));
        }}
      >
        <label className="nl-field">
          <span>Add a tester by email</span>
          <input id="area-tester-email-new" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="howard@…" />
        </label>
        <button type="submit" disabled={busy !== null || !email.trim()} className="nl-btn nl-btn--secondary">
          Add Tester
        </button>
      </form>
    </div>
  );
}

function LookPane() {
  const { rows, busy, flash, move } = useNewLookSwitches();
  return (
    <div className="nl-pane">
      <p className="nl-meta nl-adm-lede">The redesign, one screen at a time. Each screen keeps its old look until you move it, and moves back with one press. It changes what people see, never what a button does.</p>
      {flash && <ErrorLine>{nd(flash)}</ErrorLine>}
      {!rows ? (
        !flash && <Loading what="Reading the new-look switches…" />
      ) : (
        <ul className="nl-adm-rows">
          {rows.map((r) => (
            <li key={r.id}>
              <div className="nl-adm-row-main">
                <span className="nl-strong">{r.label}</span>
                <p className="nl-meta">{nd(r.what)}</p>
                {r.changedBy && (
                  <p className="nl-meta">
                    Last moved by {r.changedBy}
                    {r.changedAt ? `, ${when(r.changedAt)}` : ""}
                  </p>
                )}
              </div>
              <div className="nl-adm-row-side">
                <div role="radiogroup" aria-label={r.label} className="nl-toggle nl-adm-seg">
                  {LOOK_LEVELS.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      role="radio"
                      aria-checked={r.level === l.id}
                      title={l.says}
                      disabled={busy === r.id}
                      onClick={() => r.level !== l.id && void move(r.id, l.id)}
                      className={r.level === l.id ? "is-on" : undefined}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
