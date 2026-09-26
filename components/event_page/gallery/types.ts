export type EventGalleryImage = {
    src: string;
    alt?: string;
};

export type EventGalleryProps = {
    title?: string;
    images: EventGalleryImage[];
};
