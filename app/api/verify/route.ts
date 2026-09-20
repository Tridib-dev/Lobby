// app/api/verify/route.ts


import { connection } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { verifyTicket } from "@/lib/actions/gate.actions";

function getQueryValue(url: URL, keys: string[]): string {
    for (const key of keys) {
        const value = url.searchParams.get(key)?.trim();
        if (value) return value;
    }
    return "";
}

export async function GET(request: NextRequest) {
    // This endpoint depends on the incoming query string and must never be
    // evaluated as part of a prerendered Cache Components shell.
    await connection();

    try {
        const ticketId = getQueryValue(request.nextUrl, ["id", "ticketId"]);
        const eventId = getQueryValue(request.nextUrl, ["eventId"]);

        if (!ticketId || !eventId) {
            return NextResponse.json(
                { valid: false, reason: "invalid_request" },
                { status: 400 }
            );
        }

        const result = await verifyTicket(ticketId, eventId);
        const status = result.valid ? 200 : result.reason === "unauthorized" ? 401 : 200;

        return NextResponse.json(result, { status });
    } catch (error) {
        console.error("[GET /api/verify]", error);
        return NextResponse.json(
            { valid: false, reason: "server_error" },
            { status: 500 }
        );
    }
}
