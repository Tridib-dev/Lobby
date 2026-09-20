import DashboardShell from "@/components/dashboard/shell";
import { getAccessibleDashboardEvents } from "@/lib/event-dashboard/access";
import { connection } from "next/server";

export default async function AccountDashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // All account pages below read Clerk request headers in their data
    // loaders. Keep the entire authenticated subtree out of prerendering.
    await connection();
    const recentEvents = await getAccessibleDashboardEvents();

    return <DashboardShell recentEvents={recentEvents}>{children}</DashboardShell>;
}
