"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

interface BottomModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function BottomModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className = "",
}: BottomModalProps) {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="bottom-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[1000] bg-slate-950/35 backdrop-blur-md"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      {/* Modal */}
      <motion.div
        key="bottom-modal-panel"
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{
          type: "spring",
          damping: 26,
          stiffness: 300,
        }}
        className="fixed bottom-0 left-0 right-0 z-[1001] mx-auto w-full md:max-w-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bottom-modal-title"
        aria-describedby={
          description ? "bottom-modal-description" : undefined
        }
      >
        <div
          className={[
            "group relative overflow-hidden rounded-t-3xl",
            "border border-slate-200/80",
            "bg-[#f8fafc]",
            "shadow-[0_-24px_80px_rgba(15,23,42,0.20)]",
            className,
          ].join(" ")}
        >
          {/* Very subtle ambient gradient */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(99,102,241,0.08),transparent_35%),radial-gradient(circle_at_90%_5%,rgba(14,165,233,0.06),transparent_30%)]" />

          {/* Header */}
          <div className="relative flex items-start justify-between gap-4 border-b border-slate-200/80 bg-white/75 px-5 py-4 backdrop-blur-xl">
            <div>
              <h3
                id="bottom-modal-title"
                className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900"
              >
                {title}
              </h3>

              {description ? (
                <p
                  id="bottom-modal-description"
                  className="mt-1 text-[12px] leading-5 text-slate-500"
                >
                  {description}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-full border border-slate-200 bg-slate-50 p-2 text-slate-500 shadow-sm transition-all hover:bg-white hover:text-slate-800 hover:shadow-md"
              aria-label="Close modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Content */}
          <div className="relative px-5 py-5">
            {children}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}