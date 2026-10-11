"use client";

import { Suspense } from "react";
import DemoNet from "@/components/showroom/demo/DemoNet";
import PhoneDemo from "@/components/showroom/demo/PhoneDemo";
import PhoneFrame from "@/components/m/PhoneFrame";
import Screen from "@/app/m/page";

/** Today's Calendar (app/m/page) on Sam's sample day, for the launch tour (components/showroom/demo/PhoneDemo). */
export default function DemoPhoneToday() {
  return (
    <>
      <DemoNet label="Sample phone" />
      <PhoneDemo />
      <div className="os-type min-h-dvh bg-page text-ink">
        <PhoneFrame>
          <Suspense fallback={null}>
            <Screen />
          </Suspense>
        </PhoneFrame>
      </div>
    </>
  );
}
