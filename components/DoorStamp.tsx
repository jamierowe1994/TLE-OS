"use client";

import { useEffect, useState } from "react";

/**
 * The date, stamped in the corner like a camera's: 09.11.26, as the website
 * writes a date on its news cards. Read in the browser, so the server never
 * guesses a day (and a tab left open overnight is not wrong for long).
 */
export default function DoorStamp() {
  const [stamp, setStamp] = useState("");
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      setStamp(`${p(d.getDate())}.${p(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`);
    };
    tick();
    const t = window.setInterval(tick, 60_000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <span className="door-cap" aria-hidden="true">
      {stamp}
    </span>
  );
}
