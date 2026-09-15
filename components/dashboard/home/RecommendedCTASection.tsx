"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { PlusCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
    compact?: boolean;
};

export function RecommendedCTASection({ compact = false }: Props) {
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.12,
                delayChildren: 0.1,
            },
        },
    };

    const cardVariants = {
        hidden: { opacity: 0, y: 12 },
        visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
        },
    };

    return (
        <motion.div
            initial="hidden"
            animate="visible"
            variants={containerVariants}
            className={cn(
                "grid gap-3 sm:grid-cols-2 sm:gap-4 lg:gap-6",
                compact ? "gap-2.5 sm:gap-3" : ""
            )}
        >
            {/* Create Event Card */}
            <motion.div variants={cardVariants}>
                <Link
                    href="/create_event"
                    className="group relative flex h-24 overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-4 shadow-sm transition-all duration-300 hover:border-indigo-300 hover:shadow-md sm:h-28 lg:h-32"
                >
                    {/* Left backdrop blur effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/15 via-indigo-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                    {/* Content */}
                    <div className="relative z-10 flex flex-col items-start justify-between">
                        <div className="flex items-start gap-2.5">
                            <PlusCircle
                                size={20}
                                className="shrink-0 text-indigo-600 sm:size-5 lg:size-6"
                            />
                            <div className="min-w-0">
                                <h3 className="font-semibold text-slate-900 text-sm sm:text-base">
                                    Create Event
                                </h3>
                                <p className="hidden text-xs text-slate-500 sm:block">
                                    Launch your next event
                                </p>
                            </div>
                        </div>

                        <span className="text-xs font-medium text-indigo-600 transition-transform duration-200 group-hover:translate-x-1">
                            Get Started →
                        </span>
                    </div>
                </Link>
            </motion.div>

            {/* Explore Events Card */}
            <motion.div variants={cardVariants}>
                <Link
                    href="/events/discover"
                    className="group relative flex h-24 overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-4 shadow-sm transition-all duration-300 hover:border-cyan-300 hover:shadow-md sm:h-28 lg:h-32"
                >
                    {/* Left backdrop blur effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/15 via-cyan-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                    {/* Content */}
                    <div className="relative z-10 flex flex-col items-start justify-between">
                        <div className="flex items-start gap-2.5">
                            <Sparkles
                                size={20}
                                className="shrink-0 text-cyan-600 sm:size-5 lg:size-6"
                            />
                            <div className="min-w-0">
                                <h3 className="font-semibold text-slate-900 text-sm sm:text-base">
                                    Explore Events
                                </h3>
                                <p className="hidden text-xs text-slate-500 sm:block">
                                    Discover amazing opportunities
                                </p>
                            </div>
                        </div>

                        <span className="text-xs font-medium text-cyan-600 transition-transform duration-200 group-hover:translate-x-1">
                            Browse Now →
                        </span>
                    </div>
                </Link>
            </motion.div>
        </motion.div>
    );
}
