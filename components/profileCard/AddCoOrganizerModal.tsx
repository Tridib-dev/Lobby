"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { BottomModal } from "@/components/uitripled/bottom-modal";
import {
  CoOrganizerCandidateRow,
  ProfileRowSkeleton,
  type ProfileRowUser,
} from "./ProfileRow";
import {
  getProfileConnections,
  type ConnectionRelation,
  type ProfileConnection,
} from "@/lib/actions/profile.actions";
import {
  getCoOrganizerInviteStateAction,
  revokeCoOrganizerInviteAction,
  sendCoOrganizerInvitesAction,
} from "@/lib/actions/coOrganizerInvite.actions";
import { removeCoOrganizer } from "@/lib/actions/gate.actions";

export interface AddCoOrganizerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewerClerkId: string;
  eventId?: string;
  selectedClerkIds?: Set<string>;
  onToggle?: (user: ProfileRowUser) => void;
  busyClerkIds?: Set<string>;
  onChanged?: () => void;
}

type InviteState = "none" | "pending" | "active" | "denied";
type ConnectionTab = ConnectionRelation | "all";

function toProfileRowUser(
  connection: ProfileConnection
): ProfileRowUser {
  return {
    clerkId: connection.clerkId,
    photo: connection.photo,
    firstName: connection.firstName,
    lastName: connection.lastName,
    username: connection.username,
  };
}

function mergeUnique(
  ...lists: ProfileConnection[][]
): ProfileConnection[] {
  const map = new Map<string, ProfileConnection>();

  for (const list of lists) {
    for (const item of list) {
      if (!map.has(item.clerkId)) {
        map.set(item.clerkId, item);
      }
    }
  }

  return Array.from(map.values());
}

const LIGHT_MODAL_VARS: CSSProperties = {
  colorScheme: "light",
  "--background": "#f8fafc",
  "--foreground": "#0f172a",
  "--card": "#ffffff",
  "--card-foreground": "#0f172a",
  "--popover": "#ffffff",
  "--popover-foreground": "#0f172a",
  "--muted": "#f1f5f9",
  "--muted-foreground": "#64748b",
  "--border": "#e2e8f0",
  "--input": "#e2e8f0",
  "--ring": "#4f46e5",
} as CSSProperties;

export function AddCoOrganizerModal({
  open,
  onOpenChange,
  viewerClerkId,
  eventId,
  selectedClerkIds,
  onToggle,
  busyClerkIds: externalBusyClerkIds,
  onChanged,
}: AddCoOrganizerModalProps) {
  const [tab, setTab] = useState<ConnectionTab>("all");
  const [query, setQuery] = useState("");
  const [followers, setFollowers] = useState<ProfileConnection[]>([]);
  const [following, setFollowing] = useState<ProfileConnection[]>([]);
  const [inviteStateById, setInviteStateById] = useState<
    Record<string, InviteState>
  >({});
  const [localBusyClerkIds, setLocalBusyClerkIds] =
    useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const isSelectionMode = Boolean(onToggle && selectedClerkIds);
  const busyClerkIds =
    externalBusyClerkIds ?? localBusyClerkIds;

  useEffect(() => {
    if (!open) return;

    let active = true;

    (async () => {
      setLoading(true);

      try {
        const requests = [
          getProfileConnections(viewerClerkId, "followers"),
          getProfileConnections(viewerClerkId, "following"),
        ] as const;

        const [followersResult, followingResult] =
          await Promise.all(requests);

        if (!active) return;

        setFollowers(followersResult);
        setFollowing(followingResult);

        if (!isSelectionMode && eventId) {
          const inviteState =
            await getCoOrganizerInviteStateAction(eventId);

          if (!active) return;

          setInviteStateById(() => {
            const next: Record<string, InviteState> = {};

            inviteState.activeClerkIds.forEach((id) => {
              next[id] = "active";
            });

            inviteState.pendingClerkIds.forEach((id) => {
              next[id] = "pending";
            });

            inviteState.deniedClerkIds.forEach((id) => {
              if (!next[id]) {
                next[id] = "denied";
              }
            });

            return next;
          });
        } else {
          setInviteStateById({});
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [
    open,
    viewerClerkId,
    eventId,
    isSelectionMode,
  ]);

  const connections = useMemo(() => {
    if (tab === "followers") return followers;
    if (tab === "following") return following;

    return mergeUnique(followers, following);
  }, [tab, followers, following]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) return connections;

    return connections.filter(
      (c) =>
        c.username.toLowerCase().includes(q) ||
        `${c.firstName} ${c.lastName}`
          .toLowerCase()
          .includes(q)
    );
  }, [connections, query]);

  async function handleAction(
    connection: ProfileConnection
  ) {
    if (busyClerkIds.has(connection.clerkId)) return;

    if (isSelectionMode) {
      onToggle?.(toProfileRowUser(connection));
      return;
    }

    const currentState =
      inviteStateById[connection.clerkId] ?? "none";

    if (!eventId) return;

    setLocalBusyClerkIds((current) => {
      const next = new Set(current);
      next.add(connection.clerkId);
      return next;
    });

    try {
      if (
        currentState === "none" ||
        currentState === "denied"
      ) {
        const result =
          await sendCoOrganizerInvitesAction(
            eventId,
            [connection.clerkId]
          );

        if (result.sent.includes(connection.clerkId)) {
          setInviteStateById((current) => ({
            ...current,
            [connection.clerkId]: "pending",
          }));

          onChanged?.();
        }
      } else if (currentState === "pending") {
        const result =
          await revokeCoOrganizerInviteAction(
            eventId,
            connection.clerkId
          );

        if (result.success) {
          setInviteStateById((current) => ({
            ...current,
            [connection.clerkId]: "none",
          }));

          onChanged?.();
        }
      } else if (currentState === "active") {
        const result = await removeCoOrganizer(
          eventId,
          connection.clerkId
        );

        if (result.success) {
          setInviteStateById((current) => ({
            ...current,
            [connection.clerkId]: "none",
          }));

          onChanged?.();
        }
      }
    } finally {
      setLocalBusyClerkIds((current) => {
        const next = new Set(current);
        next.delete(connection.clerkId);
        return next;
      });
    }
  }

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);

    if (!nextOpen) {
      setQuery("");
    }
  };

  return (
    <BottomModal
      open={open}
      onOpenChange={handleOpenChange}
      title="Invite co-organizer"
      description={`${connections.length} ${tab}`}
      className="md:max-w-md h-[75dvh] max-h-[75dvh]"
    >
      <div
        style={LIGHT_MODAL_VARS}
        className="flex flex-col gap-3 bg-background text-foreground"
      >
        {/* Tabs */}
        <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-1 shadow-sm">
          <div className="grid grid-cols-3 gap-1">
            {(["all", "followers", "following"] as const).map(
              (item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTab(item)}
                  className={cn(
                    "rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200",
                    tab === item
                      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                      : "text-slate-500 hover:bg-white/70 hover:text-slate-800"
                  )}
                >
                  {item === "all"
                    ? "All"
                    : item === "followers"
                      ? "Followers"
                      : "Following"}
                </button>
              )
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
          />
        </div>

        {/* List */}
        <div className="max-h-[60dvh] space-y-2 overflow-y-auto pr-1">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <ProfileRowSkeleton key={i} />
            ))
          ) : filtered.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500 shadow-sm">
              {query
                ? "No matches."
                : `No ${tab} yet.`}
            </p>
          ) : (
            filtered.map((connection) => {
              const state = isSelectionMode
                ? selectedClerkIds?.has(
                    connection.clerkId
                  )
                  ? "active"
                  : "none"
                : inviteStateById[
                      connection.clerkId
                    ] ?? "none";

              return (
                <CoOrganizerCandidateRow
                  key={connection.clerkId}
                  user={toProfileRowUser(connection)}
                  state={state}
                  pending={busyClerkIds.has(
                    connection.clerkId
                  )}
                  onAdd={() =>
                    handleAction(connection)
                  }
                  onRemove={() =>
                    handleAction(connection)
                  }
                />
              );
            })
          )}
        </div>
      </div>
    </BottomModal>
  );
}