import { NextRequest, NextResponse } from "next/server";
import { releaseExpiredPaymentHolds } from "@/lib/registration-inventory";

async function handleCron(request: NextRequest) {
    const secret = process.env.CRON_SECRET;
    const authorization = request.headers.get("authorization");

    if (!secret || authorization !== `Bearer ${secret}`) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    try {
        const result = await releaseExpiredPaymentHolds();

        return NextResponse.json({
            ok: true,
            ...result,
        });
    } catch (error) {
        console.error("[capacity hold cleanup]", error);

        return NextResponse.json(
            { error: "Failed to release expired holds" },
            { status: 500 }
        );
    }
}

export async function GET(request: NextRequest) {
    return handleCron(request);
}

// Optional: keeps manual POST testing compatible.
export async function POST(request: NextRequest) {
    return handleCron(request);
}