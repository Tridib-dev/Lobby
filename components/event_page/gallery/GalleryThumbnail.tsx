import Image from "next/image";
import { motion } from "framer-motion";
import type { EventGalleryImage } from "./types";

export default function GalleryThumbnail({
    image,
    index,
    active,
    onClick,
}: {
    image: EventGalleryImage;
    index: number;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <motion.button
            type="button"
            onClick={onClick}
            aria-label={`Show gallery image ${index + 1}`}
            aria-current={active ? "true" : undefined}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className={`relative h-[82px] w-[122px] shrink-0 overflow-hidden rounded-[12px] border-2 bg-white transition-[border-color,opacity] duration-300 md:h-[100px] md:w-[220px] xl:h-[100px] xl:w-[222px] ${
                active ? "border-[#3157d5] opacity-100" : "border-transparent opacity-45 hover:opacity-75"
            }`}
        >
            <Image
                src={image.src}
                alt={image.alt ?? ""}
                fill
                sizes="(min-width: 1280px) 222px, (min-width: 768px) 220px, 122px"
                className="object-cover"
            />
        </motion.button>
    );
}
