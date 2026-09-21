"use client";

import PageHeader from "@/components/PageHeader";
import TestFilesTab from "@/components/testing/TestFilesTab";

/**
 * Practice files - an agent's own test files, during phase 1 of the pilot
 * (lib/phases, 21 Sep 2026).
 *
 * The same panel an owner has on Admin, Testing, because it is the same thing:
 * an invented landlord or tenant whose emails come to YOU, put at any stage of
 * the process, worked for real and reset as often as you like. The panel hides
 * the owner's buttons by itself, and the route behind it only answers an agent
 * while the pilot is in phase 1.
 *
 * On the rail only while an area is on Practice (components/Shell).
 */
export default function PracticePage() {
  return (
    <>
      <PageHeader
        title="Practice Files"
        blurb="Your own test landlords and tenants. Real records are look only for now - these you can work in full: book, send, sign, and reset to try again. Every email they would get comes to you."
        search={false}
      />
      <TestFilesTab />
    </>
  );
}
