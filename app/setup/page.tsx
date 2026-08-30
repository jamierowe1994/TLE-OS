"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Frame from "@/components/setup/Frame";
import Wizard from "@/components/setup/Wizard";

/**
 * Setting up an account, one question per screen.
 *
 * Reached the moment a magic link is redeemed: /api/auth/verify/complete signs
 * them in as it burns the token, and /join sends them here instead of to the
 * profile it used to. So by the time this renders there is always a session
 * and always a name.
 *
 * The screens themselves live in components/setup/Wizard.tsx, because the
 * public preview renders the same component. This file is only the door: it
 * reads the query string and decides where "finished" goes.
 *
 * ?replay=1 walks every screen and writes nothing, so the flow can be reviewed
 * without making an account or spending an invite.
 */

function Setup() {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <Wizard
      replay={params.get("replay") === "1"}
      mail={params.get("mail")}
      onFinish={() =>
        /* ?tour=choose is what makes the OS offer the walkthrough. Carried in
           the URL rather than inferred from "setup just finished", so the tour
           can also be re-run later without pretending setup happened again. */
        router.push("/dashboard?tour=choose")
      }
    />
  );
}

export default function SetupPage() {
  /* useSearchParams needs a boundary or the route opts out of static
     rendering and the build says so. Same shape as /join. */
  return (
    <Suspense
      fallback={
        <Frame current={null} done={() => false}>
          <p className="text-[12.5px] text-muted">Just a moment…</p>
        </Frame>
      }
    >
      <Setup />
    </Suspense>
  );
}
