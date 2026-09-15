"use client";

// components/profile/ProfileHeader.tsx
import { useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { toggleFollow, updateBio } from "@/lib/actions/profile.actions";
import ShareSheet from "./ShareSheet";
import ConnectionsModal from "./ConnectionsModal";
import { useUser } from "@clerk/nextjs";

type ConnectionRelation = "followers" | "following";

interface Props {
    clerkId: string;
    firstName: string;
    lastName: string;
    username: string;
    photo: string;
    bio: string;
    followersCount: number;
    followingCount: number;
    attendedCount: number;
    organizedCount: number;
    isFollowing: boolean;
    isOwner: boolean;
}

export default function ProfileHeader({
    clerkId,
    firstName,
    lastName,
    username,
    photo,
    bio: initialBio,
    followersCount: initialFollowers,
    followingCount,
    attendedCount,
    organizedCount,
    isFollowing: initialFollowing,
    isOwner,
}: Props) {
    const [following, setFollowing] = useState(initialFollowing);
    const [followers, setFollowers] = useState(initialFollowers);
    const [bio, setBio] = useState(initialBio);
    const [editingBio, setEditingBio] = useState(false);
    const [bioInput, setBioInput] = useState(initialBio);
    const [savingBio, setSavingBio] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
    const [connectionsOpen, setConnectionsOpen] = useState(false);
    const [connectionsTab, setConnectionsTab] = useState<ConnectionRelation>("followers");
    const [connectionsSearch, setConnectionsSearch] = useState("");

    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    const initials = [firstName, lastName].map((n) => n?.[0]).filter(Boolean).join("").toUpperCase();
    const { isSignedIn } = useUser();

    const handleFollow = async () => {
        if (!isSignedIn) {  
            window.location.href = `/sign-in?redirect_url=${encodeURIComponent(window.location.pathname)}`;
            return;
        }
        setFollowing((p) => !p);
        setFollowers((p) => (following ? p - 1 : p + 1));
        const result = await toggleFollow(clerkId);
        if (!result.success) {
            setFollowing((p) => !p);
            setFollowers((p) => (following ? p + 1 : p - 1));
            toast.error("Please sign in to follow.");
        }
    };

    const handleSaveBio = async () => {
        setSavingBio(true);
        const result = await updateBio(bioInput);
        if (result.success) {
            setBio(bioInput);
            setEditingBio(false);
            toast.success("Bio updated.");
        } else {
            toast.error("Failed to save bio.");
        }
        setSavingBio(false);
    };

    const openConnections = (tab: ConnectionRelation) => {
        setConnectionsSearch("");
        setConnectionsTab(tab);
        setConnectionsOpen(true);
    };

    return (
        <div>
            {/* Banner */}
            <div className="relative mb-12">
                <div
                    className="h-[140px] rounded-2xl overflow-hidden"
                    style={{
                        background:
                            "radial-gradient(ellipse at 20% 60%, rgba(6,182,212,0.35) 0%, transparent 55%), " +
                            "radial-gradient(ellipse at 80% 30%, rgba(139,92,246,0.3) 0%, transparent 55%), " +
                            "radial-gradient(ellipse at 60% 80%, rgba(236,72,153,0.2) 0%, transparent 50%), " +
                            "#0d1117",
                        border: "1px solid rgba(255,255,255,0.07)",
                    }}
                />

                {/* Avatar — overlaps the banner without being clipped */}
                <div
                    className="absolute -bottom-10 left-6 z-10 w-20 h-20 rounded-full overflow-hidden border-4 flex-shrink-0 flex items-center justify-center"
                    style={{ borderColor: "#080c10", background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}
                >
                    {photo ? (
                        <Image src={photo} alt={fullName} width={80} height={80} className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-2xl font-bold text-white">{initials}</span>
                    )}
                </div>
            </div>

            {/* Name row + actions */}
            <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
                <div>
                    <h1 className="text-[22px] font-bold text-white tracking-tight">{fullName}</h1>
                    <p className="text-[13px] text-white/40 mt-0.5">@{username}</p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {!isOwner && (
                        <button
                            onClick={handleFollow}
                            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all active:scale-95"
                            style={{
                                background: following ? "rgba(255,255,255,0.06)" : "rgba(6,182,212,0.15)",
                                border: following ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(6,182,212,0.3)",
                                color: following ? "rgba(255,255,255,0.6)" : "#67e8f9",
                            }}
                        >
                            {following ? "Following" : "Follow"}
                        </button>
                    )}

                    <button
                        onClick={() => setShareOpen(true)}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all active:scale-95"
                        style={{
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.09)",
                            color: "rgba(255,255,255,0.6)",
                        }}
                    >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                            <line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>
                        </svg>
                        Share
                    </button>
                </div>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-6 mb-4 text-[13px]">
                {[
                    { label: "followers", value: followers },
                    { label: "following", value: followingCount },
                    { label: "attended", value: attendedCount },
                    { label: "organized", value: organizedCount },
                ].map((stat) => (
                    stat.label === "followers" || stat.label === "following" ? (
                        <button
                            key={stat.label}
                            type="button"
                            onClick={() => openConnections(stat.label === "followers" ? "followers" : "following")}
                            className="text-white/40 transition-colors hover:text-white/70"
                        >
                            <span className="text-white/90 font-semibold mr-1">{stat.value}</span>
                            {stat.label}
                        </button>
                    ) : (
                        <span key={stat.label} className="text-white/40">
                            <span className="text-white/90 font-semibold mr-1">{stat.value}</span>
                            {stat.label}
                        </span>
                    )
                ))}
            </div>

            {/* Bio */}
            <div className="mb-6">
                {editingBio ? (
                    <div className="space-y-2">
                        <textarea
                            value={bioInput}
                            onChange={(e) => setBioInput(e.target.value)}
                            maxLength={200}
                            rows={3}
                            placeholder="Write something about yourself..."
                            className="w-full px-3 py-2 rounded-lg text-[13px] text-white/80 outline-none resize-none max-w-lg"
                            style={{
                                background: "rgba(255,255,255,0.04)",
                                border: "1px solid rgba(6,182,212,0.3)",
                            }}
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={handleSaveBio}
                                disabled={savingBio}
                                className="px-3 py-1.5 rounded-lg text-[12px] font-medium disabled:opacity-60"
                                style={{ background: "rgba(6,182,212,0.15)", border: "1px solid rgba(6,182,212,0.25)", color: "#67e8f9" }}
                            >
                                {savingBio ? "Saving…" : "Save"}
                            </button>
                            <button
                                onClick={() => { setEditingBio(false); setBioInput(bio); }}
                                className="px-3 py-1.5 rounded-lg text-[12px] text-white/40 hover:text-white/60 transition-colors"
                                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-start gap-2 max-w-lg">
                        <p className="text-[13px] text-white/50 leading-relaxed">
                            {bio || (isOwner ? "Add a bio to tell others about yourself." : "")}
                        </p>
                        {isOwner && (
                            <button
                                onClick={() => { setEditingBio(true); setBioInput(bio); }}
                                className="flex-shrink-0 mt-0.5 p-1 rounded text-white/25 hover:text-white/50 transition-colors"
                                title="Edit bio"
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/>
                                </svg>
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Share sheet */}
            <ShareSheet
                open={shareOpen}
                onClose={() => setShareOpen(false)}
                profileUsername={username}
                profileName={fullName}
            />
            <ConnectionsModal
                open={connectionsOpen}
                onClose={() => setConnectionsOpen(false)}
                profileClerkId={clerkId}
                profileName={fullName}
                profileUsername={username}
                activeTab={connectionsTab}
                onTabChange={setConnectionsTab}
                search={connectionsSearch}
                onSearchChange={setConnectionsSearch}
            />
        </div>
    );
}
