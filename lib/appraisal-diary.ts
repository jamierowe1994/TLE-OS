import "server-only";
import { publicError } from "@/lib/public-error";
import { putAppraisalInRexDiary, type DiaryOutcome } from "@/lib/rex-diary-write";
import { rexCopiesToOutlook } from "@/lib/rex-outlook-sync";
import { putInOutlook, removeFromOutlook, type OutlookOutcome } from "@/lib/outlook-calendar";
import type { MarketAppraisal } from "@/lib/market-appraisal";

/**
 * AN APPRAISAL INTO THE AGENT'S DIARIES - the one place it is done.
 *
 * Booking (POST /api/appraisals) and Rearrange (lib/appraisal-change, 15 Oct
 * 2026) both land here, so a moved appraisal is written exactly the way a
 * booked one is: the REX diary first as the silent mirror (behind James's lock,
 * lib/rex-diary-write - an entry already there is MOVED, never doubled), then
 * the agent's own Outlook, unless their REX already copies its diary into
 * Outlook and REX took it (lib/rex-outlook-sync).
 *
 * Never throws: the appraisal is already saved when this runs.
 */
export async function putAppraisalInDiaries(full: MarketAppraisal, userId: string): Promise<{ rexDiary: DiaryOutcome | null; outlook: OutlookOutcome | null }> {
  let rexDiary: DiaryOutcome | null = null;
  let outlook: OutlookOutcome | null = null;
  try {
    rexDiary = await putAppraisalInRexDiary({ ma: full, userId });
  } catch (e) {
    rexDiary = { ok: false, reason: "refused", detail: publicError(e, "Couldn't reach REX.") };
  }
  if (rexDiary?.ok && (await rexCopiesToOutlook(userId).catch(() => false))) {
    /* One we made before this was known is the duplicate: take it out. */
    await removeFromOutlook(userId, `appraisal|${full.id}`).catch(() => null);
    outlook = { ok: true, eventId: "", moved: false, duplicate: false, viaRex: true } as OutlookOutcome;
  } else {
    try {
      /* The street, then the postcode unless the street already has it (the
         old filter dropped the street and the entry said only the postcode). */
      const where = [full.address, full.postcode].filter((x, i) => x && (i === 0 || !full.address.toUpperCase().includes(x.toUpperCase()))).join(", ") || full.address;
      outlook = await putInOutlook({
        userId,
        key: `appraisal|${full.id}`,
        subject: `Market appraisal - ${where} with ${full.landlord}`,
        body: `Booked in TLE OS.\nLandlord: ${full.landlord}${full.landlordMobile ? `, ${full.landlordMobile}` : ""}${full.landlordEmail ? `, ${full.landlordEmail}` : ""}`,
        location: where,
        startsAt: full.appointmentAt!,
        minutes: 60,
      });
    } catch (e) {
      outlook = { ok: false, reason: "refused", detail: publicError(e, "Couldn't reach Outlook.") };
    }
  }
  return { rexDiary, outlook };
}
