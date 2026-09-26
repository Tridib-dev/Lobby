import { ArrowLeft, ArrowRight } from "lucide-react";

export default function GalleryActionButton({
    direction,
    onClick,
    disabled = false,
}: {
    direction: "previous" | "next";
    onClick: () => void;
    disabled?: boolean;
}) {
    const isNext = direction === "next";

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={isNext ? "Next gallery image" : "Previous gallery image"}
            className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157d5]/40 disabled:cursor-not-allowed disabled:opacity-50 ${
                isNext
                    ? "border-[#3157d5] bg-[#3157d5] text-white hover:bg-[#2447bb]"
                    : "border-[#dde3ec] bg-white text-[#14213d] hover:bg-[#f7f9fc]"
            }`}
        >
            {isNext ? <ArrowRight size={18} aria-hidden="true" /> : <ArrowLeft size={18} aria-hidden="true" />}
        </button>
    );
}
