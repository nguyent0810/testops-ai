import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { NextResponse, type NextRequest } from "next/server";
import { handleClerkWebhook } from "@/lib/clerk-sync";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const evt = await verifyWebhook(req);
    const db = getDb();
    await handleClerkWebhook(db, evt);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[webhooks/clerk] verification or sync failed:", err);
    return NextResponse.json({ error: "invalid webhook" }, { status: 400 });
  }
}
