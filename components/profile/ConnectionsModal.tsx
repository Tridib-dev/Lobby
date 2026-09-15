"use client";

import { useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { BottomModal } from "@/components/uitripled/bottom-modal";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { getProfileConnections, toggleFollow } from "@/lib/actions/profile.actions";

type ConnectionRelation = "followers" | "following";

interface ProfileConnection {
    clerkId: string;
    firstName: string;
    lastName: string;
    username: string;
    photo: string;
    isFollowing: boolean;
}

interface Props {
    open: boolean;
    onClose: () => void;
    profileClerkId: string;
    profileName: string;
    profileUsername: string;
    activeTab: ConnectionRelation;
    onTabChange: (tab: ConnectionRelation) => void;
    search: string;
    onSearchChange: (value: string) => void;
}

const TAB_META: Record<
    ConnectionRelation,
    {
        label: string;
        empty: string;
        searchPlaceholder: string;
    }
> = {
    followers: {
        label: "Followers",
        empty: "No followers yet.",
        searchPlaceholder: "Search followers",
    },
    following: {
        label: "Following",
        empty: "Not following anyone yet.",
        searchPlaceholder: "Search following",
    },
};

function getInitials(connection: Pick<ProfileConnection, "firstName" | "lastName" | "username">) {
    const fromName = [connection.firstName, connection.lastName]
        .map((part) => part?.[0])
        .filter(Boolean)
        .join("")
        .toUpperCase();

    if (fromName) return fromName;
    return connection.username.slice(0, 2).toUpperCase() || "U";
}

function ConnectionRow({
    connection,
    onToggleFollow,
    pending,
}: {
    connection: ProfileConnection;
    onToggleFollow: (clerkId: string) => void;
    pending: boolean;
}) {
    const fullName = [connection.firstName, connection.lastName].filter(Boolean).join(" ");
    const initials = getInitials(connection);

    return (
        <div
            className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3"
            style={{ borderColor: "rgba(255,255,255,0.08)" }}
        >
            <div className="flex min-w-0 items-center gap-3">
                <Avatar className="h-11 w-11 shrink-0">
                    {connection.photo ? (
                        <AvatarImage src={connection.photo} alt={fullName || connection.username} />
                    ) : null}
                    <AvatarFallback className="bg-white/10 text-[11px] font-semibold text-white/60">
                        {initials}
                    </AvatarFallback>
                </Avatar>

                <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-white/90">
                        {fullName || connection.username || "Unknown user"}
                    </p>
                    <p className="truncate text-[12px] text-white/35">@{connection.username}</p>
                </div>
            </div>

            <button
                type="button"
                onClick={() => onToggleFollow(connection.clerkId)}
                disabled={pending}
                className={cn(
                    "shrink-0 rounded-xl px-3.5 py-2 text-[12px] font-medium transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60",
                    connection.isFollowing
                        ? "border border-white/10 bg-white/5 text-white/60"
                        : "border border-cyan-500/30 bg-cyan-500/15 text-cyan-200"
                )}
            >
                {pending ? "..." : connection.isFollowing ? "Following" : "Follow"}
            </button>
        </div>
    );
}

export default function ConnectionsModal({
    open,
    onClose,
    profileClerkId,
    profileName,
    profileUsername,
    activeTab,
    onTabChange,
    search,
    onSearchChange,
}: Props) {
    const { isSignedIn } = useUser();
    const [connectionsByTab, setConnectionsByTab] = useState<
        Record<ConnectionRelation, ProfileConnection[] | null>
    >({
        followers: null,
        following: null,
    });
    const [pendingId, setPendingId] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        if (connectionsByTab[activeTab] !== null) return;

        let cancelled = false;

        const loadConnections = async () => {
            try {
                const data = await getProfileConnections(profileClerkId, activeTab);
                if (!cancelled) {
                    setConnectionsByTab((current) => ({
                        ...current,
                        [activeTab]: data,
                    }));
                }
            } catch {
                if (!cancelled) {
                    toast.error("Unable to load connections.");
                    setConnectionsByTab((current) => ({
                        ...current,
                        [activeTab]: [],
                    }));
                }
            }
        };

        void loadConnections();

        return () => {
            cancelled = true;
        };
    }, [activeTab, connectionsByTab, open, profileClerkId]);

    const filteredConnections = useMemo(() => {
        const connections = connectionsByTab[activeTab] ?? [];
        const term = search.trim().toLowerCase();

        if (!term) return connections;

        return connections.filter((connection) => {
            const searchable = [connection.firstName, connection.lastName, connection.username]
                .join(" ")
                .toLowerCase();
            return searchable.includes(term);
        });
    }, [activeTab, connectionsByTab, search]);

    const isLoading = open && connectionsByTab[activeTab] === null;
    const activeMeta = TAB_META[activeTab];
    const hasSearch = search.trim().length > 0;

    const updateConnectionFollowState = (clerkId: string, isFollowing: boolean) => {
        setConnectionsByTab((current) => ({
            followers: current.followers?.map((connection) =>
                connection.clerkId === clerkId ? { ...connection, isFollowing } : connection
            ) ?? current.followers,
            following: current.following?.map((connection) =>
                connection.clerkId === clerkId ? { ...connection, isFollowing } : connection
            ) ?? current.following,
        }));
    };

    const handleToggleFollow = async (clerkId: string) => {
        if (!isSignedIn) {
            window.location.href = `/sign-in?redirect_url=${encodeURIComponent(window.location.pathname)}`;
            return;
        }

        setPendingId(clerkId);
        try {
            const result = await toggleFollow(clerkId);
            if (result.success) {
                updateConnectionFollowState(clerkId, result.following ?? false);
            } else {
                toast.error("Unable to update follow status.");
            }
        } catch {
            toast.error("Unable to update follow status.");
        } finally {
            setPendingId(null);
        }
    };

    return (
        <BottomModal
            open={open}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) onClose();
            }}
            title="Connections"
            description={`@${profileUsername} · ${profileName}`}
            className="overflow-hidden md:max-w-2xl lg:max-w-3xl"
        >
            <div className="flex min-h-[60vh] max-h-[82vh] flex-col gap-5">
                <Tabs
                    value={activeTab}
                    onValueChange={(value) => onTabChange(value as ConnectionRelation)}
                    className="gap-0"
                >
                    <TabsList className="grid h-11 w-full grid-cols-2 rounded-2xl border border-white/10 bg-white/5 p-1">
                        {(Object.keys(TAB_META) as ConnectionRelation[]).map((tab) => (
                            <TabsTrigger
                                key={tab}
                                value={tab}
                                className="rounded-xl px-3 py-2 text-[13px] font-medium text-white/40 transition-colors data-[state=active]:bg-white/10 data-[state=active]:text-white/90 data-[state=inactive]:hover:text-white/65"
                            >
                                {TAB_META[tab].label}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    <TabsContent value="followers" className="mt-5 outline-none">
                        <div className="space-y-4">
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
                                <input
                                    value={search}
                                    onChange={(event) => onSearchChange(event.target.value)}
                                    placeholder={activeMeta.searchPlaceholder}
                                    aria-label={activeMeta.searchPlaceholder}
                                    className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-[13px] text-white/80 outline-none placeholder:text-white/25 focus:border-cyan-500/30"
                                />
                            </div>

                            <ConnectionList
                                loading={isLoading}
                                emptyText={activeMeta.empty}
                                connections={connectionsByTab.followers}
                                filteredConnections={activeTab === "followers" ? filteredConnections : []}
                                hasSearch={activeTab === "followers" ? hasSearch : false}
                                onToggleFollow={handleToggleFollow}
                                pendingId={pendingId}
                            />
                        </div>
                    </TabsContent>

                    <TabsContent value="following" className="mt-5 outline-none">
                        <div className="space-y-4">
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
                                <input
                                    value={search}
                                    onChange={(event) => onSearchChange(event.target.value)}
                                    placeholder={activeMeta.searchPlaceholder}
                                    aria-label={activeMeta.searchPlaceholder}
                                    className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-[13px] text-white/80 outline-none placeholder:text-white/25 focus:border-cyan-500/30"
                                />
                            </div>

                            <ConnectionList
                                loading={isLoading}
                                emptyText={activeMeta.empty}
                                connections={connectionsByTab.following}
                                filteredConnections={activeTab === "following" ? filteredConnections : []}
                                hasSearch={activeTab === "following" ? hasSearch : false}
                                onToggleFollow={handleToggleFollow}
                                pendingId={pendingId}
                            />
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </BottomModal>
    );
}

function ConnectionList({
    loading,
    emptyText,
    connections,
    filteredConnections,
    hasSearch,
    onToggleFollow,
    pendingId,
}: {
    loading: boolean;
    emptyText: string;
    connections: ProfileConnection[] | null;
    filteredConnections: ProfileConnection[];
    hasSearch: boolean;
    onToggleFollow: (clerkId: string) => void;
    pendingId: string | null;
}) {
    if (loading) {
        return <p className="text-[13px] text-white/35">Loading connections…</p>;
    }

    if (!connections || connections.length === 0) {
        return <p className="text-[13px] text-white/35">{emptyText}</p>;
    }

    if (filteredConnections.length === 0) {
        return (
            <p className="text-[13px] text-white/35">
                {hasSearch ? "No matches for your search." : emptyText}
            </p>
        );
    }

    return (
        <div className="max-h-[62vh] space-y-2 overflow-y-auto pr-1">
            {filteredConnections.map((connection) => (
                <ConnectionRow
                    key={connection.clerkId}
                    connection={connection}
                    onToggleFollow={onToggleFollow}
                    pending={pendingId === connection.clerkId}
                />
            ))}
        </div>
    );
}
