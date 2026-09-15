"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Menu, Search } from "lucide-react";

import NotificationsBell from "./notifications-bell";

type Props = {
    onMenuClick?: () => void;
    recentEvents?: Array<{ id: string; title: string; role: string }>;
};

const CRUMB_MAP: Record<string, string> = {
    dashboard: "Dashboard",
    attended: "My Tickets",
    saved: "Saved",
    organized: "My Events",
    events: "Events",
    analytics: "Analytics",
    profile: "Profile",
    settings: "Settings",
    overview: "Overview",
    discover: "Discover",
    create_event: "Create Event",
    applicants: "Applicants",
    organizers: "Organizers",
    operations: "Operations",
    gate: "Gate",
    room: "Room",
};

const QUICK_NAV = [
    { label: "Overview", href: "/dashboard" },
    { label: "Saved Events", href: "/dashboard/saved" },
    { label: "My Events", href: "/dashboard/organized" },
    { label: "My Tickets", href: "/dashboard/attended" },
    { label: "Analytics", href: "/dashboard/analytics" },
    { label: "Create Event", href: "/create_event" },
    { label: "Discover", href: "/events/discover" },
];

function getBreadcrumbs(pathname: string) {
    const segments = pathname.split("/").filter(Boolean);

    return segments.map((segment, index) => {
        const isEventIdSegment =
            segments[0] === "dashboard" && segments[1] === "events" && index === 2 && segments.length >= 3;
        const label = isEventIdSegment ? "Event" : CRUMB_MAP[segment] ?? segment;

        return {
            label,
            href: "/" + segments.slice(0, index + 1).join("/"),
            isLast: index === segments.length - 1,
        };
    });
}

function UniversalSearch({ recentEvents = [] }: { recentEvents?: Array<{ id: string; title: string; role: string }> }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const inputRef = useRef<HTMLInputElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const portalRoot = useMemo(() => {
        if (typeof document === "undefined") return null;

        let root = document.getElementById("dashboard-search-portal");
        if (!root) {
            root = document.createElement("div");
            root.id = "dashboard-search-portal";
            document.body.appendChild(root);
        }

        return root;
    }, []);

    function close() {
        setOpen(false);
        setQuery("");
    }

    useEffect(() => {
        if (!open) return;
        inputRef.current?.focus();
    }, [open]);

    useEffect(() => {
        if (!open) return;

        const handlePointerDown = (event: PointerEvent) => {
            const panel = panelRef.current;
            if (panel && !panel.contains(event.target as Node)) {
                close();
            }
        };

        document.addEventListener("pointerdown", handlePointerDown, true);
        return () => document.removeEventListener("pointerdown", handlePointerDown, true);
    }, [open]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                setOpen(true);
            }
            if (event.key === "Escape") {
                close();
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    useEffect(() => {
        if (!open) return;

        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const siblings = Array.from(document.body.children);
        siblings.forEach((node) => {
            if (node.id === "dashboard-search-portal") return;
            node.setAttribute("inert", "");
            node.setAttribute("aria-hidden", "true");
        });

        return () => {
            document.body.style.overflow = previous;
            siblings.forEach((node) => {
                if (node.id === "dashboard-search-portal") return;
                node.removeAttribute("inert");
                node.removeAttribute("aria-hidden");
            });
        };
    }, [open]);

    const recentEventNav = useMemo(
        () =>
            recentEvents.slice(0, 6).map((event) => ({
                label: event.title,
                href: `/dashboard/events/${event.id}/overview`,
                role: event.role === "creator" ? "Organizer" : "Co-organizer",
            })),
        [recentEvents]
    );

    const filteredRecent = useMemo(
        () => recentEventNav.filter((item) => query === "" || item.label.toLowerCase().includes(query.toLowerCase())),
        [recentEventNav, query]
    );

    const filteredQuickNav = useMemo(
        () => QUICK_NAV.filter((item) => query === "" || item.label.toLowerCase().includes(query.toLowerCase())),
        [query]
    );

    const overlay =
        open &&
        portalRoot &&
        createPortal(
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 px-4 pt-20 backdrop-blur-xl pointer-events-auto"
                        onClick={close}
                        role="presentation"
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.98 }}
                            transition={{ duration: 0.18, ease: "easeOut" }}
                            ref={panelRef}
                            className="relative w-full max-w-[640px] overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.2)]"
                            onClick={(event) => event.stopPropagation()}
                            role="dialog"
                            aria-modal="true"
                            aria-label="Universal dashboard search"
                        >
                            <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
                                <Search size={15} className="shrink-0 text-slate-400" />
                                <input
                                    ref={inputRef}
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder="Search the dashboard"
                                    className="h-8 flex-1 bg-transparent text-[14px] text-slate-900 outline-none placeholder:text-slate-400"
                                />
                                <button
                                    type="button"
                                    onClick={close}
                                    className="rounded-full border border-slate-200 px-2 py-1 text-[10px] font-mono text-slate-500 transition-colors hover:bg-slate-50"
                                >
                                    ESC
                                </button>
                            </div>

                            <div className="max-h-[70vh] overflow-y-auto p-2">
                                {filteredRecent.length > 0 && (
                                    <div className="px-2 pb-1 pt-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                            Recent event dashboards
                                        </p>
                                        <div className="mt-2 space-y-1">
                                            {filteredRecent.map((item) => (
                                                <Link
                                                    key={item.href}
                                                    href={item.href}
                                                    onClick={close}
                                                    className="flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-slate-50"
                                                >
                                                    <span className="grid size-9 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                                                        <ChevronRight size={14} />
                                                    </span>
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-[13px] font-medium text-slate-900">
                                                            {item.label}
                                                        </span>
                                                        <span className="block text-[11px] text-slate-500">
                                                            {item.role}
                                                        </span>
                                                    </span>
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="px-2 py-2">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                        Navigation
                                    </p>
                                    <div className="mt-2 space-y-1">
                                        {filteredQuickNav.map((item) => (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                onClick={close}
                                                className="flex items-center justify-between rounded-2xl px-3 py-3 transition-colors hover:bg-slate-50"
                                            >
                                                <span className="text-[13px] font-medium text-slate-900">{item.label}</span>
                                                <ChevronRight size={14} className="text-slate-300" />
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>,
            portalRoot
        );

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label="Search dashboard"
                className="grid size-[34px] place-items-center rounded-[12px] border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-700"
            >
                <Search size={15} />
            </button>
            {overlay}
        </>
    );
}

export default function DashboardTopbar({ onMenuClick, recentEvents = [] }: Props = {}) {
    const pathname = usePathname() ?? "";
    const crumbs = useMemo(() => getBreadcrumbs(pathname), [pathname]);
    const pageTitle = crumbs[crumbs.length - 1]?.label ?? "Dashboard";

    return (
        <motion.header
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="z-30"
        >
            <div className="relative flex h-[48px] items-center rounded-[15px] border border-slate-200/80 bg-white/92 px-3 shadow-[0_16px_36px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:px-4">
                <div className="relative z-10 flex min-w-0 flex-1 items-center gap-2">
                    {onMenuClick && (
                        <button
                            type="button"
                            onClick={onMenuClick}
                            aria-label="Open menu"
                            className="grid size-[34px] place-items-center rounded-[12px] border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50 md:hidden"
                        >
                            <Menu size={17} />
                        </button>
                    )}

                    <div className="min-w-0 text-[11px] text-slate-500 hidden md:block">
                        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
                            {crumbs.slice(0, 3).map((crumb, index) => (
                                <span key={crumb.href} className="flex items-center gap-1.5">
                                    {index > 0 && <ChevronRight size={11} className="text-slate-300" />}
                                    {crumb.isLast ? (
                                        <span className="truncate text-slate-700">{crumb.label}</span>
                                    ) : (
                                        <Link href={crumb.href} className="truncate transition-colors hover:text-slate-900">
                                            {crumb.label}
                                        </Link>
                                    )}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-16">
                    <h1 className="min-w-0 truncate text-center text-[14px] font-semibold tracking-[-0.02em] text-slate-950 sm:text-[15px]">
                        {pageTitle}
                    </h1>
                </div>

                <div className="relative z-10 flex items-center justify-end gap-2">
                    <UniversalSearch recentEvents={recentEvents} />
                    <NotificationsBell />
                </div>
            </div>
        </motion.header>
    );
}
