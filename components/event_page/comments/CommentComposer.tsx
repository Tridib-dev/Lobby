import CommentAvatar from "./CommentAvatar";

export default function CommentComposer({
    userName,
    userImage,
    value,
    onChange,
    onSubmit,
    submitting,
}: {
    userName: string;
    userImage?: string;
    value: string;
    onChange: (value: string) => void;
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
    submitting: boolean;
}) {
    const remaining = Math.max(0, 500 - value.length);

    return (
        <form onSubmit={onSubmit} className="rounded-[12px] border border-[#dde3ec] bg-white p-3 shadow-[0_1px_2px_rgba(20,33,61,0.04)] md:p-4">
            <div className="flex gap-3">
                <CommentAvatar name={userName} src={userImage} />
                <div className="min-w-0 flex-1">
                    <label htmlFor="event-comment" className="sr-only">Write your comment</label>
                    <textarea
                        id="event-comment"
                        value={value}
                        maxLength={500}
                        onChange={(event) => onChange(event.target.value)}
                        placeholder="Write your thoughts here..."
                        disabled={submitting}
                        className="min-h-[92px] w-full resize-none rounded-[10px] border border-[#dde3ec] bg-[#f8fafc] px-3 py-3 text-[12px] leading-relaxed text-[#14213d] outline-none transition-colors placeholder:text-[#9aa6b8] focus:border-[#3157d5] focus:ring-2 focus:ring-[#3157d5]/10 md:min-h-[110px]"
                    />
                </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 pl-0 text-[10px] text-[#657086] md:pl-12">
                <span>{remaining} / 500</span>
                <button
                    type="submit"
                    disabled={!value.trim() || submitting}
                    className="rounded-lg bg-[#3157d5] px-4 py-2.5 text-[11px] font-bold text-white transition-colors hover:bg-[#2447bb] disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {submitting ? "Posting..." : "Post your comment"}
                </button>
            </div>
        </form>
    );
}
