"use client";

import DoodleIcon from "@/components/DoodleIcon";
import LineIcon from "@/components/LineIcon";
import { useAppLook } from "@/components/app/AppFrame";

/**
 * An icon on the phone: the doodle in the pastel app, the desktop's thin line
 * icon in the new look (lib/new-look "app", 27 Oct 2026), so the app's icons
 * match the sidebar the agents use on the desktop. Same props as DoodleIcon.
 */
export default function AppIcon({ name, size = 18, className = "" }: { name: string; size?: number; className?: string }) {
  return useAppLook() ? <LineIcon name={name} size={size} className={className} /> : <DoodleIcon name={name} size={size} className={className} />;
}
