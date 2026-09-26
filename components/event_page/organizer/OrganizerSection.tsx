"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import OrganizerAvatar from "./OrganizerAvatar";
import OrganizerAvatarStack from "./OrganizerAvatarStack";
import OrganizerDirectorySheet from "./OrganizerDirectorySheet";
import OrganizerFollowButton from "./OrganizerFollowButton";
import type { OrganizerSectionProps } from "./types";

export default function OrganizerSection({ organizer, coOrganizers = [] }: OrganizerSectionProps) {
    const [directoryOpen, setDirectoryOpen] = useState(false);
    const allOrganizers = useMemo(() => [organizer, ...coOrganizers], [organizer, coOrganizers]);

    return (
        <section className="flex w-full flex-col items-start gap-[18px]" aria-labelledby="event-organizer-heading">
            <div className="flex w-full flex-col items-start gap-2">
                <p className="text-[12px] font-bold uppercase leading-normal text-[#3157d5]">Organizer</p>
                <h2 id="event-organizer-heading" className="text-[30px] font-normal leading-normal tracking-[-0.02em] text-[#14213d]">
                    {organizer.name}
                </h2>
            </div>

            <div className="w-full rounded-[14px] border border-[#dde3ec] bg-white p-4 shadow-[0_2px_2px_rgba(0,0,0,0.25)] md:p-5">
                <div className="flex w-full flex-col gap-4">
                    <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center">
                        <OrganizerAvatar name={organizer.name} photo={organizer.photo} />
                        <div className="min-w-0 flex-1">
                            <p className="text-[17px] leading-normal text-[#14213d]">{organizer.name}</p>
                            <p className="mt-1 line-clamp-2 text-[13px] leading-normal text-[#657086]">
                                {organizer.bio || "Independent community for event attendees and organizers"}
                            </p>
                        </div>
                        <OrganizerFollowButton
                            clerkId={organizer.clerkId}
                            isFollowing={organizer.isFollowing}
                            isOwner={organizer.isOwner}
                        />
                    </div>

                    {(organizer.eventsHostedCount !== undefined || organizer.eventsAttendedCount !== undefined) && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-[#eef1f5] pt-3 text-[12px] text-[#657086]">
                            {organizer.eventsHostedCount !== undefined && (
                                <span><strong className="text-[#14213d]">{organizer.eventsHostedCount}</strong> events hosted</span>
                            )}
                            {organizer.eventsAttendedCount !== undefined && (
                                <span><strong className="text-[#14213d]">{organizer.eventsAttendedCount}</strong> events attended</span>
                            )}
                        </div>
                    )}

                    {coOrganizers.length > 0 && (
                        <div className="flex items-center justify-between gap-4">
                            <OrganizerAvatarStack organizers={coOrganizers} />
                            <button
                                type="button"
                                onClick={() => setDirectoryOpen(true)}
                                className="group inline-flex items-center gap-1.5 text-[12px] font-medium text-[#657086] transition-colors hover:text-[#14213d]"
                            >
                                <span>view all</span>
                                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#0d47c9] text-white transition-transform group-hover:translate-x-0.5">
                                    <ArrowUpRight size={13} strokeWidth={2.5} aria-hidden="true" />
                                </span>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <OrganizerDirectorySheet
                open={directoryOpen}
                onOpenChange={setDirectoryOpen}
                organizers={allOrganizers}
            />
        </section>
    );
}

export type { EventOrganizerProfile, OrganizerSectionProps } from "./types";
