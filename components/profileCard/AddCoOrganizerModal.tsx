"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { BottomModal } from "@/components/uitripled/bottom-modal";
import { CoOrganizerCandidateRow, ProfileRowSkeleton, type ProfileRowUser } from "./ProfileRow";
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
  /** The organizer's own clerkId — connections are fetched relative to them. */
  viewerClerkId: string;
  eventId?: string;
  selectedClerkIds?: Set<string>;
  onToggle?: (user: ProfileRowUser) => void;
  busyClerkIds?: Set<string>;
  onChanged?: () => void;
}

type InviteState = "none" | "pending" | "active" | "denied";
type ConnectionTab = ConnectionRelation | "all";

function toProfileRowUser(connection: ProfileConnection): ProfileRowUser {
  return {
    clerkId: connection.clerkId,
    photo: connection.photo,
    firstName: connection.firstName,
    lastName: connection.lastName,
    username: connection.username,
  };
}

function mergeUnique(...lists: ProfileConnection[][]): ProfileConnection[] {
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

const DARK_MODAL_VARS: CSSProperties = {
  colorScheme: "dark",
  "--background": "#0d1117",
  "--foreground": "#2f3037",
  "--card": "#121826",
  "--card-foreground": "#f8fafc",
  "--popover": "#121826",
  "--popover-foreground": "#f8fafc",
  "--muted": "#182231",
  "--muted-foreground": "#9aa7b6",
  "--border": "#273347",
  "--input": "#273347",
  "--ring": "#67e8f9",
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
  const [inviteStateById, setInviteStateById] = useState<Record<string, InviteState>>({});
  const [localBusyClerkIds, setLocalBusyClerkIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const isSelectionMode = Boolean(onToggle && selectedClerkIds);
  const busyClerkIds = externalBusyClerkIds ?? localBusyClerkIds;

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

        const [followersResult, followingResult] = await Promise.all(requests);

        if (!active) return;

        setFollowers(followersResult);
        setFollowing(followingResult);
        if (!isSelectionMode && eventId) {
          const inviteState = await getCoOrganizerInviteStateAction(eventId);
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
              if (!next[id]) next[id] = "denied";
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
  }, [open, viewerClerkId, eventId, isSelectionMode]);

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
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(q)
    );
  }, [connections, query]);

  async function handleAction(connection: ProfileConnection) {
    if (busyClerkIds.has(connection.clerkId)) return;

    if (isSelectionMode) {
      onToggle?.(toProfileRowUser(connection));
      return;
    }

    const currentState = inviteStateById[connection.clerkId] ?? "none";
    if (!eventId) return;

    setLocalBusyClerkIds((current) => {
      const next = new Set(current);
      next.add(connection.clerkId);
      return next;
    });

    try {
      if (currentState === "none" || currentState === "denied") {
        const result = await sendCoOrganizerInvitesAction(eventId, [connection.clerkId]);
        if (result.sent.includes(connection.clerkId)) {
          setInviteStateById((current) => ({ ...current, [connection.clerkId]: "pending" }));
          onChanged?.();
        }
      } else if (currentState === "pending") {
        const result = await revokeCoOrganizerInviteAction(eventId, connection.clerkId);
        if (result.success) {
          setInviteStateById((current) => ({ ...current, [connection.clerkId]: "none" }));
          onChanged?.();
        }
      } else if (currentState === "active") {
        const result = await removeCoOrganizer(eventId, connection.clerkId);
        if (result.success) {
          setInviteStateById((current) => ({ ...current, [connection.clerkId]: "none" }));
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
    if (!nextOpen) setQuery("");
  };

  return (
    <BottomModal
      open={open}
      onOpenChange={handleOpenChange}
      title="Invite co-organizer"
      description={`${connections.length} ${tab}`}
      className="md:max-w-md h-[75dvh] max-h-[75dvh]"
    >
      <div style={DARK_MODAL_VARS} className="flex flex-col gap-3 text-white">
        <div className="grid grid-cols-3 gap-1 rounded-2xl border border-border/20 bg-muted/40 p-1">
          {(["all", "followers", "following"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={cn(
                "rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                tab === item
                  ? "bg-white/10 text-white shadow-sm ring-1 ring-white/10"
                  : "text-muted-foreground hover:text-foreground/80"
              )}
            >
              {item === "all" ? "All" : item === "followers" ? "Followers" : "Following"}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="w-full rounded-xl border border-border/20 bg-muted/40 py-2.5 pl-9 pr-3 text-sm text-card-foreground outline-none placeholder:text-muted-foreground focus:border-border/40"
          />
        </div>

        <div className="max-h-[60dvh] space-y-2 overflow-y-auto pr-1">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => <ProfileRowSkeleton key={i} />)
          ) : filtered.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border/20 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
              {query ? "No matches." : `No ${tab} yet.`}
            </p>
          ) : (
            filtered.map((connection) => {
              const state = isSelectionMode
                ? selectedClerkIds?.has(connection.clerkId)
                  ? "active"
                  : "none"
                : inviteStateById[connection.clerkId] ?? "none";

              return (
                <CoOrganizerCandidateRow
                  key={connection.clerkId}
                  user={toProfileRowUser(connection)}
                  state={state}
                  pending={busyClerkIds.has(connection.clerkId)}
                  onAdd={() => handleAction(connection)}
                  onRemove={() => handleAction(connection)}
                />
              );
            })
          )}
        </div>
      </div>
    </BottomModal>
  );
}
