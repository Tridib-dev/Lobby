export default function EventAudiencePreview({ audience }: { audience: string[] }) {
    if (audience.length === 0) return null;

    return (
        <div className="hidden w-[350px] flex-col items-start gap-1.5 overflow-hidden pl-3.5 pr-2.5 py-1.5 xl:flex">
            <h2 className="w-full text-[30px] font-normal leading-normal text-[#14213d]">For the people like</h2>
            <div className="flex w-full flex-wrap gap-x-1.5 gap-y-2 p-1.5">
                {audience.map((item) => (
                    <span
                        key={item}
                        className="rounded-lg border border-[#e5e7eb] bg-[#f3f4f6] px-2.5 py-1.5 text-[12px] font-medium leading-normal text-[#374151] shadow-[0_1px_1px_rgba(0,0,0,0.05)]"
                    >
                        {item}
                    </span>
                ))}
            </div>
        </div>
    );
}
