import Image from "next/image";

function getInitials(name: string) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

export default function CommentAvatar({ name, src }: { name: string; src?: string }) {
    return (
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e9eeff] text-[11px] font-bold text-[#3157d5]">
            {src ? (
                <Image src={src} alt={name} fill sizes="36px" className="object-cover" />
            ) : (
                <span aria-hidden="true">{getInitials(name)}</span>
            )}
        </div>
    );
}

export { getInitials };
