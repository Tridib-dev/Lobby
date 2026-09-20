"use client";

// components/dashboard/shell.tsx
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import DashboardSidebar from "./sidebar";
import DashboardTopbar from "./topbar";
import DashboardActionCardRail from "@/components/dashboard/action-card-rail";
import type { AccessibleDashboardEvent } from "@/lib/event-dashboard/access";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { ReactNode } from "react";

export default function DashboardShell({
    children,
    recentEvents = [],
}: {
    children: ReactNode;
    recentEvents?: AccessibleDashboardEvent[];
}) {
    const pathname = usePathname();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const mainRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if ("scrollRestoration" in history) {
            const prev = history.scrollRestoration;
            history.scrollRestoration = "manual";
            return () => {
                history.scrollRestoration = prev;
            };
        }
    }, []);

    useLayoutEffect(() => {
        const main = mainRef.current;
        if (!main) return;

        main.scrollTop = 0;
        main.scrollLeft = 0;
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });

        const raf = requestAnimationFrame(() => {
            main.scrollTop = 0;
            main.scrollLeft = 0;
            window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        });

        return () => {
            cancelAnimationFrame(raf);
        };
    }, [pathname]);

    return (
        <div
            className="h-dvh overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.9),transparent_24%),linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] p-2.5 sm:p-3"
        >
            <div className="flex h-full min-h-0 gap-2.5 sm:gap-3">
                <div className="hidden md:block">
                    <DashboardSidebar
                        collapsed={sidebarCollapsed}
                        onCollapsedChange={setSidebarCollapsed}
                    />
                </div>

                <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                    <SheetContent
                        showCloseButton={false}
                        side="left"
                        className="!w-[90vw] !max-w-[320px] gap-0 overflow-hidden border-white/8 bg-[#f7f8fb] p-0 md:hidden"
                    >
                        <DashboardSidebar mobile onNavigate={() => setMobileOpen(false)} />
                    </SheetContent>
                </Sheet>

                <div className="flex min-w-0 flex-1 flex-col gap-2.5 sm:gap-3">
                    <DashboardTopbar onMenuClick={() => setMobileOpen(true)} recentEvents={recentEvents} />

                    <main
                        ref={mainRef}
                        data-dashboard-main
                        className="min-h-0 flex-1 overscroll-y-none overflow-y-auto overflow-x-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.10)]"
                        style={{ overflowAnchor: "none", scrollBehavior: "auto" }}
                    >
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={pathname}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                                className="w-full px-3.5 pb-20 pt-5 sm:px-5 lg:px-7 xl:px-9"
                            >
                                <div className="space-y-8">
                                    {children}
                                    <DashboardActionCardRail />
                                </div>
                            </motion.div>
                        </AnimatePresence>
                    </main>
                </div>
            </div>
        </div>
    );
}

// ─── PageHeader ────────────────────────────────────────────────────────────────
export function PageHeader({
    kicker,
    title,
    description,
    right,
}: {
    kicker?: string;
    title: string;
    description?: string;
    right?: ReactNode;
}) {
    return (
        <div className="mb-6 flex flex-col gap-4 sm:mb-7 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
                {kicker && (
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                        {kicker}
                    </p>
                )}
                <h1 className="text-[24px] font-semibold leading-tight text-slate-900 sm:text-[28px]">
                    {title}
                </h1>
                {description && (
                    <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-slate-500">
                        {description}
                    </p>
                )}
            </div>
            {right && <div className="flex flex-wrap items-center gap-2 lg:flex-shrink-0 lg:pt-1">{right}</div>}
        </div>
    );
}
