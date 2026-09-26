"use client";

import { useUser } from "@clerk/nextjs";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { createComment, getEventComments, toggleLikeComment } from "@/lib/actions/comment.actions";
import CommentCard from "./CommentCard";
import CommentComposer from "./CommentComposer";
import type { EventComment, EventCommentsProps } from "./types";

type RawComment = {
    _id: string;
    userId: string;
    userName: string;
    userImage?: string;
    content: string;
    likes?: string[];
    createdAt: string;
};

function normalizeComments(comments: RawComment[]): EventComment[] {
    return comments.map((comment) => ({
        ...comment,
        likes: comment.likes ?? [],
    }));
}

export default function CommentsSection({ eventId, initialComments = [], currentUserImage }: EventCommentsProps) {
    const { user, isSignedIn } = useUser();
    const [comments, setComments] = useState<EventComment[]>(initialComments);
    const [value, setValue] = useState("");
    const [expanded, setExpanded] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [pendingLike, startLikeTransition] = useTransition();

    const refreshComments = async () => {
        const result = await getEventComments(eventId);
        setComments(normalizeComments(result as RawComment[]));
    };

    useEffect(() => {
        if (initialComments.length === 0) {
            // The fetch hydrates the client-only comment list from the server.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            void refreshComments();
        }
        // Initial comments are a server snapshot; eventId is the fetch key.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [eventId]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!value.trim()) return;
        if (!isSignedIn) {
            window.location.href = `/sign-in?redirect_url=${encodeURIComponent(window.location.pathname)}`;
            return;
        }

        setSubmitting(true);
        const result = await createComment(eventId, value);
        if (result.success) {
            setValue("");
            toast.success("Comment posted!");
            await refreshComments();
        } else {
            toast.error(result.error || "Failed to post comment");
        }
        setSubmitting(false);
    };

    const handleLike = (commentId: string) => {
        if (!isSignedIn) {
            window.location.href = `/sign-in?redirect_url=${encodeURIComponent(window.location.pathname)}`;
            return;
        }

        startLikeTransition(async () => {
            const result = await toggleLikeComment(commentId);
            if (!result.success) {
                toast.error(result.error || "Failed to update like");
                return;
            }
            await refreshComments();
        });
    };

    const visibleComments = expanded ? comments : comments.slice(0, 3);
    const canExpand = comments.length > 3;

    return (
        <section className="flex w-full flex-col items-start gap-3" aria-labelledby="event-comments-heading">
            <p className="rounded-full bg-[#e9eeff] px-2.5 py-1 text-[10px] font-bold uppercase leading-none text-[#3157d5]">Community</p>
            <h2 id="event-comments-heading" className="text-[30px] font-normal leading-normal tracking-[-0.02em] text-[#14213d] md:text-[32px]">
                Comments
            </h2>

            <div className="w-full">
                <CommentComposer
                    userName={user?.fullName || user?.username || "Your comment"}
                    userImage={user?.imageUrl || currentUserImage}
                    value={value}
                    onChange={setValue}
                    onSubmit={handleSubmit}
                    submitting={submitting}
                />
            </div>

            <div className="flex w-full flex-col gap-1.5">
                {comments.length === 0 ? (
                    <p className="rounded-xl border border-[#eef1f5] bg-white px-4 py-10 text-center text-[12px] text-[#657086]">
                        No comments yet. Be the first to comment!
                    </p>
                ) : (
                    <AnimatePresence initial={false} mode="popLayout">
                        {visibleComments.map((comment) => (
                            <CommentCard
                                key={comment._id}
                                comment={comment}
                                viewerId={user?.id}
                                onLike={handleLike}
                                pending={pendingLike}
                            />
                        ))}
                    </AnimatePresence>
                )}
            </div>

            {canExpand && (
                <motion.button
                    type="button"
                    onClick={() => setExpanded((current) => !current)}
                    whileTap={{ scale: 0.98 }}
                    className="self-center rounded-full border border-[#dde3ec] bg-white px-4 py-2 text-[11px] font-bold text-[#14213d] shadow-[0_4px_14px_rgba(20,33,61,0.1)] transition-colors hover:bg-[#f7f9fc]"
                    aria-expanded={expanded}
                >
                    {expanded ? "Show less" : "View more"} <span aria-hidden="true">⌄</span>
                </motion.button>
            )}
        </section>
    );
}

export type { EventComment, EventCommentsProps } from "./types";
