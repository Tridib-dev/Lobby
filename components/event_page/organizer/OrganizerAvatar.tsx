import Image from "next/image";

function initials(name: string) {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("") || "?";
}

export default function OrganizerAvatar({
    name,
    photo,
    size = "md",
    className = "",
}: {
    name: string;
    photo?: string;
    size?: "sm" | "md";
    className?: string;
}) {
    const dimensions = size === "sm" ? 34 : 56;

    return (
        <div
            className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-[#e9eeff] font-bold text-[#3157d5] ${size === "sm" ? "text-[10px]" : "text-[12px]"} ${className}`}
            style={{ width: dimensions, height: dimensions }}
        >
            {photo ? (
                <Image src={photo} alt={name} fill sizes={`${dimensions}px`} className="object-cover" />
            ) : (
                <span aria-hidden="true">{initials(name)}</span>
            )}
        </div>
    );
}

export { initials };
