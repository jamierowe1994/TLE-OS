"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DepositsNew from "@/components/new-look/admin/DepositsNew";
import { NlLoading } from "@/components/new-look/admin/ScreenBits";
import { fetchMe } from "@/lib/me";

/**
 * The deposit register, inside Michael's rail (James, 23 Nov 2026: Michael
 * could not find it - it was only under Admin, which his role never opens).
 * The same screen Admin > Compliance > Deposits draws, reading the same live
 * register, so there is one set of figures at two addresses.
 *
 * For the people lib/deposit-access names. Anybody else on the desk is sent
 * back to its dashboard rather than left in front of a register that refuses
 * them; the routes behind it refuse them either way.
 */
export default function ComplianceDeskDeposits() {
  const router = useRouter();
  const [mine, setMine] = useState<boolean | null>(null);

  useEffect(() => {
    let gone = false;
    fetchMe()
      .then((me) => {
        if (!gone) setMine(me?.depositDesk === true);
      })
      .catch(() => {
        if (!gone) setMine(false);
      });
    return () => {
      gone = true;
    };
  }, []);

  useEffect(() => {
    if (mine === false) router.replace("/compliance-desk");
  }, [mine, router]);

  if (mine !== true) return <NlLoading what={mine === false ? "Taking you back to your dashboard" : "Loading the deposit register"} />;
  return <DepositsNew />;
}
