export type EventComment = {
    _id: string;
    userId: string;
    userName: string;
    userImage?: string;
    content: string;
    likes: string[];
    createdAt: string;
};

export type EventCommentsProps = {
    eventId: string;
    initialComments?: EventComment[];
    currentUserImage?: string;
};
