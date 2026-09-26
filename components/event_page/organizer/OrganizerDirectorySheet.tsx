"use client";

import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import OrganizerAvatar from "./OrganizerAvatar";
import OrganizerFollowButton from "./OrganizerFollowButton";
import type { EventOrganizerProfile } from "./types";

export default function OrganizerDirectorySheet({
    open,
    onOpenChange,
    organizers,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    organizers: EventOrganizerProfile[];
}) {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full border-[#dde3ec] bg-white p-0 text-[#14213d] sm:max-w-md">
                <SheetHeader className="border-b border-[#eef1f5] px-6 py-5 text-left">
                    <SheetTitle className="text-[24px] font-normal text-[#14213d]">Organizers</SheetTitle>
                    <SheetDescription className="text-[13px] text-[#657086]">
                        Meet the organizer and co-organizers behind this event.
                    </SheetDescription>
                </SheetHeader>
                <div className="flex flex-col gap-3 overflow-y-auto p-6">
                    {organizers.map((organizer) => (
                        <div key={organizer.clerkId} className="flex items-center gap-3 rounded-xl border border-[#dde3ec] bg-white p-3">
                            <OrganizerAvatar name={organizer.name} photo={organizer.photo} size="md" />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[15px] font-semibold text-[#14213d]">{organizer.name}</p>
                                {organizer.bio && <p className="truncate text-[12px] text-[#657086]">{organizer.bio}</p>}
                            </div>
                            <OrganizerFollowButton
                                clerkId={organizer.clerkId}
                                isFollowing={organizer.isFollowing}
                                isOwner={organizer.isOwner}
                                compact
                            />
                        </div>
                    ))}
                </div>
            </SheetContent>
        </Sheet>
    );
}
