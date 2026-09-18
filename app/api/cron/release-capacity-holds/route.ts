// app\api\cron\release-capacity-holds\route.ts

import { NextRequest, NextResponse } from "next/server";
import { releaseExpiredPaymentHolds } from "@/lib/registration-inventory";

/**
 * Configure your scheduler to call this endpoint once per minute with
 * `Authorization: Bearer <CAPACITY_CRON_SECRET>`.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CAPACITY_CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await releaseExpiredPaymentHolds();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[capacity hold cleanup]", error);
    return NextResponse.json({ error: "Failed to release expired holds" }, { status: 500 });
  }
}
