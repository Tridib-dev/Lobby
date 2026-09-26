import Image from "next/image";

export default function EventBanner({ src, alt, priority = false }: {
    src: string;
    alt: string;
    priority?: boolean;
}) {
    return (
        <div className="relative h-[240px] w-full overflow-hidden rounded-[20px] md:h-[380px] xl:h-[520px]">
            <Image
                src={src}
                alt={alt}
                fill
                priority={priority}
                sizes="(min-width: 1280px) 71vw, 100vw"
                className="object-cover"
            />
        </div>
    );
}
