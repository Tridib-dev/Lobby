import Image from "next/image";

export default function EventPriceStatus({ price, currency = "₹", isFree = price <= 0 }: {
    price: number;
    currency?: string;
    isFree?: boolean;
}) {
    return (
        <div className="flex w-full items-center justify-start gap-2 text-[30px] leading-none text-[#15803d] xl:justify-center">
            <Image
                src="/illustrations/ticket.svg"
                alt=""
                width={56}
                height={50}
                className="h-[50px] w-[57px] rotate-[-41deg] object-contain"
                aria-hidden="true"
            />
            <span>{isFree ? "Free to Attend" : `${currency}${price.toLocaleString("en-IN")}`}</span>
        </div>
    );
}
