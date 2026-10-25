"use client";

import Link from "next/link";
import FloatSheet, { FloatCard, useFloatSheet } from "@/components/new-look/FloatSheet";
import { Ico } from "@/components/new-look/Parts";
import { CertificateUpload, LandlordSaysStep } from "@/components/WorksNow";
import { JobForm, FORM_TITLE, type FormId } from "@/components/maintenance/JobForms";
import { StagePanel, stagesOf } from "@/components/maintenance/JobStages";
import { STEPS } from "@/lib/works-steps";
import { titleCase } from "@/components/maintenance/job-page";
import { Reach } from "@/components/new-look/maintenance/JobRecord";
import type { JobView } from "@/components/new-look/maintenance/JobPageNew";

/**
 * What opens over the new-look job page, in the floating boxes
 * (components/new-look/FloatSheet): the job's forms, a stage opened from the
 * actions, the certificate, the landlord's say on the invoice, and Ring or
 * Email. The same pop-up state and the same handlers as the page as it is;
 * only the boxes are new. Today's step forms inside are repainted by
 * nl-jb-old (app/new-look/job.css), not rewritten.
 */
export function JobSheets({ v }: { v: JobView }) {
  const { o, popUp, busy, err, closePop, openPop } = v;
  if (!popUp) return null;

  if (popUp.kind === "form") {
    return (
      <FloatSheet title={FORM_TITLE[popUp.form](o)} onClose={closePop} dismissible={!busy} screenKey={popUp.form}>
        <FormInSheet v={v} form={popUp.form} />
      </FloatSheet>
    );
  }

  if (popUp.kind === "stage") {
    const meta = STEPS.find((s) => s.id === popUp.stage);
    const isHere = popUp.stage === v.here && o.status !== "cancelled";
    const done = stagesOf(o).find((s) => s.id === popUp.stage)?.done ?? false;
    const where = isHere ? "The step the job is on." : done ? "Done." : "Not the step the job is on.";
    return (
      <FloatSheet title={meta ? titleCase(meta.label) : "This Stage"} lede={`${where}${meta?.blurb ? ` ${meta.blurb}` : ""}`} onClose={closePop} dismissible={!busy} screenKey={popUp.stage}>
        <FloatCard className="nl-jb-old">
          <StagePanel
            bare
            o={o}
            stage={popUp.stage}
            move={(m) => v.popMove(m)}
            busy={busy}
            err={err}
            canCorporate={v.trades?.canCorporate ?? false}
            canPayrun={v.canPayrun}
            onInvoiceLandlord={v.invoiceLandlord}
            onCertificate={v.certificate}
            onForm={(form) => openPop({ kind: "form", form })}
          />
        </FloatCard>
      </FloatSheet>
    );
  }

  if (popUp.kind === "cert") {
    return (
      <FloatSheet title="Add a Certificate" onClose={closePop} dismissible={!busy}>
        <FloatCard className="nl-jb-old">
          <CertificateUpload o={o} busy={busy} onCertificate={async (fd) => { const problem = await v.certificate(fd); if (!problem) closePop(); return problem; }} onDone={closePop} />
        </FloatCard>
      </FloatSheet>
    );
  }

  if (popUp.kind === "landlord_says") {
    return (
      <FloatSheet title="The Landlord Authorises the Invoice" onClose={closePop} dismissible={!busy}>
        <FloatCard className="nl-jb-old">
          <LandlordSaysStep o={o} move={async (m) => { await v.popMove(m); }} busy={busy} />
        </FloatCard>
        {err && <p className="nl-fs-say is-err" role="alert">{err}</p>}
      </FloatSheet>
    );
  }

  /* Ring or Email: each person their own box. */
  const tenants = v.tenants;
  const c = v.contractor;
  return (
    <FloatSheet title={popUp.who === "tenant" ? (tenants.length > 1 ? "The Tenants" : "The Tenant") : "The Contractor"} onClose={closePop}>
      {popUp.who === "tenant" ? (
        tenants.map((t, i) => (
          <FloatCard key={`${t.name}-${i}`}>
            <p className="nl-jb-name">{t.name || "Unnamed"}{t.room ? <span className="nl-jb-quiet-inline"> · {t.room}</span> : null}</p>
            <Reach buttons phone={t.phone} email={t.email} name={t.name} role="tenant" address={o.propertyName} />
          </FloatCard>
        ))
      ) : (
        <FloatCard>
          <p className="nl-jb-name">{o.contractorName}{c?.contact ? <span className="nl-jb-quiet-inline"> · {c.contact}</span> : null}</p>
          <Reach buttons phone={c?.phone ?? ""} email={c?.email ?? ""} name={c?.contact || o.contractorName} address={o.propertyName} />
          {o.contractorId && (
            <Link href={`/contractors?open=${encodeURIComponent(o.contractorId)}`} className="nl-link nl-jb-person-more">
              Their record, jobs and what they&apos;re owed <Ico name="arrow" size={13} />
            </Link>
          )}
        </FloatCard>
      )}
    </FloatSheet>
  );
}

/** The form inside its sheet, so Back plays the sheet's exit rather than snapping shut. */
function FormInSheet({ v, form }: { v: JobView; form: FormId }) {
  const sheet = useFloatSheet();
  const { o } = v;
  return (
    <JobForm
      key={form}
      look="float"
      o={o}
      form={form}
      contractors={v.trades?.list ?? []}
      move={v.popMove}
      busy={v.busy}
      err={v.err}
      onBack={() => (sheet ? sheet.close() : v.closePop())}
      uploadFile={v.uploadFile}
      footLeft={form === "done" && !o.completedAt ? (
        <button type="button" className="nl-link" onClick={() => v.openPop({ kind: "form", form: "already_done" })}>It was done before it was on the OS - no emails</button>
      ) : undefined}
    />
  );
}
