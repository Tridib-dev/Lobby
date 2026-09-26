"use client";

import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useMemo, useState } from "react";
import GalleryActionButton from "./GalleryActionButton";
import GalleryThumbnail from "./GalleryThumbnail";
import type { EventGalleryImage, EventGalleryProps } from "./types";

const transition = {
    duration: 0.42,
    ease: [0.22, 1, 0.36, 1] as const,
};

export default function EventGallery({ title = "Inside the event", images }: EventGalleryProps) {
    const reducedMotion = useReducedMotion();
    const galleryImages = useMemo(
        () => images.filter((image): image is EventGalleryImage => Boolean(image.src)),
        [images],
    );
    const [activeIndex, setActiveIndex] = useState(0);
    const [direction, setDirection] = useState(1);

    if (galleryImages.length === 0) return null;

    const activeImage = galleryImages[Math.min(activeIndex, galleryImages.length - 1)];
    const canNavigate = galleryImages.length > 1;

    const showImage = (nextIndex: number) => {
        if (!canNavigate) return;
        const normalizedIndex = (nextIndex + galleryImages.length) % galleryImages.length;
        setDirection(normalizedIndex > activeIndex ? 1 : -1);
        setActiveIndex(normalizedIndex);
    };

    return (
        <section className="flex w-full flex-col items-start gap-3" aria-labelledby="event-gallery-heading">
            <div className="flex w-full items-end justify-between gap-4">
                <div className="flex min-w-0 flex-col items-start gap-1">
                    <p className="text-[12px] font-bold uppercase leading-normal text-[#3157d5]">Gallery</p>
                    <h2 id="event-gallery-heading" className="truncate text-[30px] font-normal leading-normal tracking-[-0.02em] text-[#14213d] md:text-[32px]">
                        {title}
                    </h2>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    <GalleryActionButton
                        direction="previous"
                        onClick={() => showImage(activeIndex - 1)}
                        disabled={!canNavigate}
                    />
                    <GalleryActionButton
                        direction="next"
                        onClick={() => showImage(activeIndex + 1)}
                        disabled={!canNavigate}
                    />
                </div>
            </div>

            <div className="relative h-[240px] w-full overflow-hidden rounded-[20px] bg-[#e9edf4] md:h-[380px] xl:h-[466px]">
                <AnimatePresence initial={false} custom={direction} mode="sync">
                    <motion.div
                        key={activeImage.src}
                        custom={direction}
                        initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: direction * 36 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: direction * -36 }}
                        transition={reducedMotion ? { duration: 0.15 } : transition}
                        className="absolute inset-0"
                    >
                        <Image
                            src={activeImage.src}
                            alt={activeImage.alt ?? `${title} gallery image ${activeIndex + 1}`}
                            fill
                            priority={activeIndex === 0}
                            sizes="(min-width: 1280px) 813px, 100vw"
                            className="object-cover"
                        />
                    </motion.div>
                </AnimatePresence>
            </div>

            <div className="flex w-full gap-2 overflow-x-auto pb-1 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="list" aria-label="Gallery thumbnails">
                {galleryImages.map((image, index) => (
                    <div key={`${image.src}-${index}`} role="listitem">
                        <GalleryThumbnail
                            image={image}
                            index={index}
                            active={index === activeIndex}
                            onClick={() => showImage(index)}
                        />
                    </div>
                ))}
            </div>
        </section>
    );
}

export type { EventGalleryImage, EventGalleryProps } from "./types";
