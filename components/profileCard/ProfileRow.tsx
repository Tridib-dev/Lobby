"use client";

import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SkeletonBlock,
  SkeletonCircle,
} from "./Skeleton";
import type { IUser } from "@/database/User.model";

export type ProfileRowUser = Pick<
  IUser,
  | "clerkId"
  | "photo"
  | "firstName"
  | "lastName"
  | "username"
> & {
  isVerified?: boolean;
};

export interface ProfileRowShellProps {
  user: ProfileRowUser;
  badge?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  className?: string;
}

export function ProfileRowShell({
  user,
  badge,
  trailing,
  onClick,
  className,
}: ProfileRowShellProps) {
  const fullName =
    `${user.firstName} ${user.lastName}`.trim();

  return (
    <div
      data-slot="profile-row"
      onClick={onClick}
      className={cn(
        [
          "group flex w-full items-center gap-3",
          "rounded-2xl border border-slate-200",
          "bg-white px-3 py-2.5",
          "shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
          "transition-all duration-200",
        ].join(" "),
        onClick &&
          [
            "cursor-pointer",
            "hover:-translate-y-[1px]",
            "hover:border-slate-300",
            "hover:bg-slate-50",
            "hover:shadow-md",
          ].join(" "),
        className
      )}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <img
          src={user.photo}
          alt={fullName}
          className="h-10 w-10 rounded-full object-cover ring-2 ring-white shadow-sm"
        />

        {user.isVerified && (
          <div className="absolute bottom-0 right-0 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-white">
            <Check className="h-2 w-2" />
          </div>
        )}
      </div>

      {/* Identity */}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-sm font-semibold leading-tight text-slate-900">
            {fullName}
          </p>

          {badge}
        </div>

        <p className="truncate text-xs text-slate-500">
          @{user.username}
        </p>
      </div>

      {/* Action */}
      {trailing && (
        <div className="shrink-0">
          {trailing}
        </div>
      )}
    </div>
  );
}

export function ProfileRowSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      data-slot="profile-row-skeleton"
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm",
        className
      )}
    >
      <SkeletonCircle className="h-10 w-10 shrink-0 ring-2 ring-white" />

      <div className="min-w-0 flex-1 space-y-1.5">
        <SkeletonBlock className="h-3.5 w-28 rounded-full" />
        <SkeletonBlock className="h-3 w-20 rounded-full" />
      </div>

      <SkeletonBlock className="h-8 w-20 shrink-0 rounded-xl" />
    </div>
  );
}

function RowActionButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <motion.button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      disabled={disabled}
      whileHover={
        !disabled ? { scale: 1.03 } : undefined
      }
      whileTap={
        !disabled ? { scale: 0.97 } : undefined
      }
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-xs font-semibold",
        "transition-all duration-150",
        "disabled:cursor-not-allowed disabled:opacity-60",

        active
          ? [
              "border-slate-200",
              "bg-slate-50",
              "text-slate-600",
              "shadow-sm",
              "hover:bg-slate-100",
            ].join(" ")
          : [
              "border-indigo-600",
              "bg-indigo-600",
              "text-white",
              "shadow-[0_8px_20px_rgba(79,70,229,0.24)]",
              "hover:bg-indigo-700",
              "hover:shadow-[0_10px_24px_rgba(79,70,229,0.30)]",
            ].join(" ")
      )}
    >
      {children}
    </motion.button>
  );
}

/* -------------------------------------------------------------------------- */
/* Co-organizer                                                               */
/* -------------------------------------------------------------------------- */

export interface CoOrganizerCandidateRowProps {
  user: ProfileRowUser;
  state: "none" | "pending" | "active" | "denied";
  pending?: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onClick?: () => void;
  className?: string;
}

export function CoOrganizerCandidateRow({
  user,
  state,
  pending = false,
  onAdd,
  onRemove,
  onClick,
  className,
}: CoOrganizerCandidateRowProps) {
  const isCoOrganizer =
    state === "pending" || state === "active";

  return (
    <ProfileRowShell
      user={user}
      onClick={onClick}
      badge={
        state === "pending" ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
            Pending
          </span>
        ) : state === "active" ? (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
            Active
          </span>
        ) : state === "denied" ? (
          <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">
            Denied
          </span>
        ) : null
      }
      className={className}
      trailing={
        <RowActionButton
          active={isCoOrganizer}
          disabled={pending}
          onClick={
            state === "none" ||
            state === "denied"
              ? onAdd
              : onRemove
          }
        >
          {pending
            ? "..."
            : state === "none" ||
                state === "denied"
              ? "Invite"
              : "Remove"}
        </RowActionButton>
      }
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Share to follower                                                          */
/* -------------------------------------------------------------------------- */

export interface ShareToFollowerRowProps {
  user: ProfileRowUser;
  onSend: () => Promise<void> | void;
  onClick?: () => void;
  className?: string;
}

export function ShareToFollowerRow({
  user,
  onSend,
  onClick,
  className,
}: ShareToFollowerRowProps) {
  const [status, setStatus] = useState<
    "idle" | "sending" | "sent"
  >("idle");

  async function handleSend() {
    if (status !== "idle") return;

    setStatus("sending");

    try {
      await onSend();
      setStatus("sent");
    } catch {
      setStatus("idle");
    }
  }

  return (
    <ProfileRowShell
      user={user}
      onClick={onClick}
      className={className}
      trailing={
        <RowActionButton
          active={status === "sent"}
          disabled={status !== "idle"}
          onClick={handleSend}
        >
          {status === "sending"
            ? "..."
            : status === "sent"
              ? "Sent"
              : "Send"}
        </RowActionButton>
      }
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Co-organizer list                                                          */
/* -------------------------------------------------------------------------- */

export interface CoOrganizerListRowProps {
  user: ProfileRowUser;
  role: "organizer" | "co-organizer";
  isFollowing: boolean;
  onToggleFollow: () => void;
  followPending?: boolean;
  onClick?: () => void;
  className?: string;
}

export function CoOrganizerListRow({
  user,
  role,
  isFollowing,
  onToggleFollow,
  followPending = false,
  onClick,
  className,
}: CoOrganizerListRowProps) {
  return (
    <ProfileRowShell
      user={user}
      onClick={onClick}
      className={className}
      badge={
        <span
          className={cn(
            "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
            role === "organizer"
              ? "bg-indigo-50 text-indigo-700"
              : "bg-slate-100 text-slate-600"
          )}
        >
          {role === "organizer"
            ? "Organizer"
            : "Co-organizer"}
        </span>
      }
      trailing={
        <RowActionButton
          active={isFollowing}
          disabled={followPending}
          onClick={onToggleFollow}
        >
          {followPending
            ? "..."
            : isFollowing
              ? "Following"
              : "Follow"}
        </RowActionButton>
      }
    />
  );
}