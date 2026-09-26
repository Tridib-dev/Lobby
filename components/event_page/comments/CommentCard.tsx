"use client";

import { Heart } from "lucide-react";
import { motion } from "framer-motion";
import CommentAvatar from "./CommentAvatar";
import { formatRelativeTime } from "./relativeTime";
import type { EventComment } from "./types";

export default function CommentCard({ comment, viewerId, onLike, pending }: {
    comment: EventComment;
    viewerId?: string;
    onLike: (commentId: string) => void;
    pending: boolean;
}) {
    const liked = Boolean(viewerId && comment.likes.includes(viewerId));

    return (
        <motion.article
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[12px] border border-[#eef1f5] bg-white px-3 py-3 shadow-[0_1px_2px_rgba(20,33,61,0.03)] md:px-4"
        >
            <div className="flex items-start gap-3">
                <CommentAvatar name={comment.userName} src={comment.userImage} />
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                        <p className="truncate text-[12px] font-bold text-[#14213d]">{comment.userName}</p>
                        <time dateTime={comment.createdAt} className="shrink-0 text-[10px] text-[#8b98ab]">
                            {formatRelativeTime(comment.createdAt)}
                        </time>
                    </div>
                    <p className="mt-2 text-[12px] leading-[1.45] text-[#40506a]">{comment.content}</p>
                    <div className="mt-2 flex justify-end">
                        <button
                            type="button"
                            onClick={() => onLike(comment._id)}
                            disabled={pending}
                            aria-label={liked ? "Unlike comment" : "Like comment"}
                            aria-pressed={liked}
                            className={`inline-flex items-center gap-1 text-[11px] transition-colors disabled:opacity-50 ${liked ? "text-[#3157d5]" : "text-[#3157d5] hover:text-[#2447bb]"}`}
                        >
                            <motion.span whileTap={{ scale: 0.8 }} className="inline-flex">
                                <Heart size={14} fill={liked ? "currentColor" : "none"} strokeWidth={1.8} aria-hidden="true" />
                            </motion.span>
                            <span>{liked ? "Liked" : "Like"}</span>
                            {comment.likes.length > 0 && <span>({comment.likes.length})</span>}
                        </button>
                    </div>
                </div>
            </div>
        </motion.article>
    );
}
