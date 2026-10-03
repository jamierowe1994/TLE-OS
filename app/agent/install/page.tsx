import { redirect } from "next/navigation";

/* Download OS moved to /download on 3 Oct 2026 (see app/download/layout.tsx);
   an old link or bookmark lands there. */
export default function OldInstall() {
  redirect("/download");
}
