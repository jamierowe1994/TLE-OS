"use client";

import { useEffect } from "react";
import { applyDarkPalette, applyTheme, isNight, readTheme } from "@/lib/theme";

/**
 * Light and dark for the preview, without ThemeGate's first-run chooser.
 *
 * ThemeGate would have done this, but it also opens a full-screen "How do you
 * like it?" splash for anybody who has never answered - which is everybody
 * opening a link they were sent. Susan clicking through to see the joining
 * flow should land on the joining flow, not on a question about themes that
 * belongs to a product she does not have an account for.
 *
 * The appearance step inside the preview still works: it calls applyTheme
 * directly and dispatches os-set-theme, which this listens for.
 */
export default function PreviewTheme() {
  useEffect(() => {
    applyDarkPalette();
    applyTheme(readTheme() ?? (isNight() ? "dark" : "light"));

    const onSet = (e: Event) => {
      const d = (e as CustomEvent).detail as { choice?: "light" | "dark" | "auto" };
      if (d?.choice) applyTheme(d.choice);
    };
    window.addEventListener("os-set-theme", onSet);
    return () => window.removeEventListener("os-set-theme", onSet);
  }, []);

  return null;
}
