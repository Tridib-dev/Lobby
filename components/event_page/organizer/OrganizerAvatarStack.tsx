import OrganizerAvatar from "./OrganizerAvatar";
import type { EventOrganizerProfile } from "./types";

export default function OrganizerAvatarStack({ organizers }: { organizers: EventOrganizerProfile[] }) {
    const visible = organizers.slice(0, 3);
    const remaining = Math.max(0, organizers.length - visible.length);

    if (visible.length === 0) return null;

    return (
        <div className="flex h-[35px] items-center" aria-label={`${organizers.length} organizers`}>
            {visible.map((organizer) => (
                <OrganizerAvatar
                    key={organizer.clerkId}
                    name={organizer.name}
                    photo={organizer.photo}
                    size="sm"
                    className="-mr-2 last:mr-0"
                />
            ))}
            {remaining > 0 && (
                <span className="relative z-10 ml-1 inline-flex h-[30px] min-w-[30px] items-center justify-center rounded-full border-2 border-white bg-[#f3f4f6] px-1 text-[10px] font-bold text-[#657086]">
                    +{remaining}
                </span>
            )}
        </div>
    );
}
