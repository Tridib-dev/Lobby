// app/(dashboard)/dashboard/attended/page.tsx
import { Suspense } from "react";
import { PageHeader } from "@/components/dashboard/shell";
import { getUserPaymentIssues, getUserTickets } from "@/lib/actions/dashboard.actions";
import TicketList from "@/components/dashboard/ticket-list";
import PaymentIssues from "@/components/dashboard/payment-issues";

export const metadata = { title: "My Tickets — DevEvent" };

export default async function AttendedPage() {
    const [tickets, paymentIssues] = await Promise.all([
        getUserTickets(),
        getUserPaymentIssues(),
    ]);

    const upcoming = tickets.filter((t) => t.status === "upcoming");
    const past     = tickets.filter((t) => t.status === "past");
    const expired  = tickets.filter((t) => t.status === "expired");

    return (
        <div>
            <PageHeader
                title="Your Tickets"
                description="All your event tickets — upcoming, attended, and expired."
                right={
                    <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[12px] text-slate-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                        {tickets.length} ticket{tickets.length !== 1 ? "s" : ""}
                    </div>
                }
            />

            <PaymentIssues issues={paymentIssues} />

            <Suspense fallback={<TicketSkeleton />}>
                <TicketList upcoming={upcoming} past={past} expired={expired} />
            </Suspense>
        </div>
    );
}

function TicketSkeleton() {
    return (
        <div className="space-y-3">
            {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100" />
            ))}
        </div>
    );
}
