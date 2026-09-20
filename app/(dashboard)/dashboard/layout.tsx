import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { connection } from "next/server";

export const metadata = {
    title: "Dashboard — DevEvent",
};

async function AuthGuard({ children }: { children: React.ReactNode }) {
    // Clerk auth reads request headers. Explicitly keep this small dynamic
    // boundary out of Cache Components prerendering.
    await connection();
    const { userId } = await auth();
    if (!userId) redirect("/sign-in");
    return children;
}

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <Suspense
            fallback={
                <div className="flex h-screen items-center justify-center bg-[#060a0d]">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#332be0] border-t-transparent" />
                </div>
            }
        >
            <AuthGuard>{children}</AuthGuard>
        </Suspense>
    );
}
