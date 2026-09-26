"use client";

import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useState, useTransition } from "react";
import { toggleFollow } from "@/lib/actions/profile.actions";

export default function OrganizerFollowButton({
    clerkId,
    isFollowing = false,
    isOwner = false,
    compact = false,
}: {
    clerkId: string;
    isFollowing?: boolean;
    isOwner?: boolean;
    compact?: boolean;
}) {
    const router = useRouter();
    const { isSignedIn } = useUser();
    const [following, setFollowing] = useState(isFollowing);
    const [isPending, startTransition] = useTransition();

    const handleClick = () => {
        if (isOwner || isPending) return;
        if (!isSignedIn) {
            router.push(`/sign-in?redirect_url=${encodeURIComponent(window.location.pathname)}`);
            return;
        }

        const previous = following;
        setFollowing(!previous);
        startTransition(async () => {
            const result = await toggleFollow(clerkId);
            if (!result.success) {
                setFollowing(previous);
                return;
            }
            setFollowing(result.following ?? !previous);
            router.refresh();
        });
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={isOwner || isPending}
            className={`inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-[#dde3ec] bg-white px-4 text-[14px] font-bold text-[#14213d] transition-colors hover:bg-[#f7f9fc] disabled:cursor-default disabled:opacity-100 ${compact ? "h-8 px-3 text-[12px]" : ""}`}
        >
            {isOwner ? "You" : isPending ? "..." : following ? "Following" : "Follow"}
        </button>
    );
}
