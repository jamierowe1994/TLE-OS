import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { deleteMailbox, mailboxStatus, saveMailbox } from "@/lib/business/mailbox-store";
import { verifyMailbox } from "@/lib/business/mail";

// The signed-in user's email connection (pre-tenancy Emails tab).
//   GET    → MailboxStatus (never the password)
//   POST   { email, password, imapHost, imapPort? } → verify sign-in, then save
//   DELETE → disconnect

async function currentUser(req: NextRequest) {
  /* Genuinely per-person — "my mailbox", "my tasks" — so this needs WHO,
     not merely whether they may. requireCapability returns the actor. */
  return requireCapability(req, "see:pretenancy");
}

export async function GET(req: NextRequest) {
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  return NextResponse.json(await mailboxStatus(user.id));
}

export async function POST(req: NextRequest) {
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  let body: { email?: unknown; password?: unknown; imapHost?: unknown; imapPort?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const imapHost = String(body.imapHost ?? "").trim();
  const imapPort = Number(body.imapPort ?? 993) || 993;
  if (!/^\S+@\S+\.\S+$/.test(email) || !password || !imapHost) {
    return NextResponse.json(
      { error: "Fill in the email address, app password and mail server." },
      { status: 400 }
    );
  }

  const mailbox = { userId: user.id, email, password, imapHost, imapPort };
  const check = await verifyMailbox(mailbox);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }
  await saveMailbox(mailbox);
  return NextResponse.json({ connected: true, email, imapHost });
}

export async function DELETE(req: NextRequest) {
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  await deleteMailbox(user.id);
  return NextResponse.json({ connected: false });
}
