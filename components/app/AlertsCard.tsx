"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { useAlerts } from "@/components/app/alerts";

/**
 * Asked once, on Home, while alerts are off on this phone (2 Oct 2026). The
 * phone itself only lets a page ask from a tap, so this is a card with a
 * button, never a pop-up on arrival. "Not now" puts it away on this phone;
 * the switch in the "+" sheet is always there.
 */
const ALERTS_LATER = "app-alerts-later";

export default function AlertsCard() {
  const alerts = useAlerts();
  const [later, setLater] = useState(true);
  useEffect(() => {
    try {
      setLater(localStorage.getItem(ALERTS_LATER) === "1");
    } catch {
      setLater(false);
    }
  }, []);
  if (later || (alerts.state !== "off" && alerts.state !== "busy")) return null;
  return (
    <section className="m-group mb-3 flex items-start gap-3 p-4">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--m-pink-wash)" }}>
        <DoodleIcon name="bell" size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15.5px] font-medium">Turn On Alerts</span>
        <span className="mt-0.5 block text-[13.5px] leading-snug text-muted">A buzz on this phone when a lead, a viewing or a deal moves.</span>
        {alerts.error && <span className="mt-1 block text-[13px] text-muted">{alerts.error}</span>}
        <span className="mt-3 flex gap-2">
          <button type="button" onClick={alerts.turnOn} disabled={alerts.state === "busy"} className="m-btn m-btn-primary m-press !h-10 !text-[14px]">
            {alerts.state === "busy" ? "Turning On..." : "Turn On"}
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.setItem(ALERTS_LATER, "1");
              } catch {
                /* It just asks again next time. */
              }
              setLater(true);
            }}
            className="m-btn m-press !h-10 !border-transparent !bg-transparent !text-[14px] text-muted"
          >
            Not Now
          </button>
        </span>
      </span>
    </section>
  );
}

