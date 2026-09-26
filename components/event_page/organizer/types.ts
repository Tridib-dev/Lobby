export type EventOrganizerProfile = {
    clerkId: string;
    name: string;
    username?: string;
    photo?: string;
    bio?: string;
    eventsHostedCount?: number;
    eventsAttendedCount?: number;
    isFollowing?: boolean;
    isOwner?: boolean;
};

export type OrganizerSectionProps = {
    organizer: EventOrganizerProfile;
    coOrganizers?: EventOrganizerProfile[];
};
