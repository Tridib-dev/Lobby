import { Img, Section, Text } from "@react-email/components";
import { render } from "@react-email/render";
import { EmailWrapper } from "../wrapper";
import { BASE_URL, theme } from "../theme";
import { getEmailEventDisplayTime } from "@/lib/time";

export type BookingConfirmationData = {
    to: string;
    eventTitle: string;
    eventDate: string;
    eventTime: string;
    eventLocation: string;
    ticketId: string;
    price: number;
    eventSlug: string;
    mode?: string;
    timezone?: string;
    startAtUTC?: string;
    recipientTimezone?: string;
};

export function subject(eventTitle: string): string {
    return `Your ticket for "${eventTitle}" is confirmed`;
}

function BookingConfirmationEmail(data: BookingConfirmationData) {
    const ticketIdShort = data.ticketId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 16);
    const isPaid = data.price > 0;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(
        `${BASE_URL}/verify?type=${isPaid ? "paid" : "free"}&id=${data.ticketId}`
    )}&size=160x160&bgcolor=ffffff&color=000000&margin=10`;
    const eventUrl = `${BASE_URL}/events/${data.eventSlug}`;
    const ticketUrl = `${BASE_URL}/dashboard/attended`;
    const schedule = getEmailEventDisplayTime({
        date: data.eventDate,
        time: data.eventTime,
        timezone: data.timezone,
        startAtUTC: data.startAtUTC,
        mode: data.mode,
    }, data.recipientTimezone);

    return (
        <EmailWrapper
            previewText={`Your ticket for ${data.eventTitle} is confirmed`}
            footerEmail={data.to}
        >
            <Section style={{ paddingBottom: "24px" }}>
                <Text
                    style={{
                        margin: "0 0 6px",
                        fontSize: "12px",
                        fontWeight: 700,
                        color: theme.colors.primary,
                        textTransform: "uppercase",
                        letterSpacing: "0.12em",
                    }}
                >
                    Booking confirmed
                </Text>
                <Text
                    style={{
                        margin: "0 0 10px",
                        fontSize: "26px",
                        lineHeight: "32px",
                        fontWeight: 700,
                        color: theme.colors.dark,
                    }}
                >
                    You&apos;re in. 🎉
                </Text>
                <Text
                    style={{
                        margin: "0",
                        fontSize: "15px",
                        lineHeight: "24px",
                        color: theme.colors.textPrimary,
                    }}
                >
                    Your ticket for <strong>{data.eventTitle}</strong> has been confirmed.
                </Text>
            </Section>

            <Section
                style={{
                    backgroundColor: theme.colors.background,
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: theme.radius.md,
                    padding: "20px 24px",
                    marginBottom: "24px",
                }}
            >
                <Text style={{ margin: "0 0 10px", fontSize: "13px", color: theme.colors.textSecondary }}>
                    Event
                </Text>
                <Text
                    style={{
                        margin: "0 0 18px",
                        fontSize: "18px",
                        lineHeight: "26px",
                        fontWeight: 700,
                        color: theme.colors.dark,
                    }}
                >
                    {data.eventTitle}
                </Text>

                <Section>
                    <Text style={{ margin: "0 0 4px", fontSize: "12px", color: theme.colors.textSecondary }}>
                        {schedule.primaryLabel}
                    </Text>
                    <Text style={{ margin: "0 0 10px", fontSize: "14px", color: theme.colors.textPrimary }}>
                        {schedule.primary}
                    </Text>
                    {schedule.secondary && schedule.secondaryLabel && (
                        <>
                            <Text style={{ margin: "0 0 4px", fontSize: "12px", color: theme.colors.textSecondary }}>
                                {schedule.secondaryLabel}
                            </Text>
                            <Text style={{ margin: "0 0 14px", fontSize: "14px", color: theme.colors.textPrimary }}>
                                {schedule.secondary}
                            </Text>
                        </>
                    )}
                    <Text style={{ margin: "0 0 4px", fontSize: "12px", color: theme.colors.textSecondary }}>
                        Location
                    </Text>
                    <Text style={{ margin: "0", fontSize: "14px", color: theme.colors.textPrimary }}>
                        {data.eventLocation}
                    </Text>
                </Section>

                <Section
                    style={{
                        marginTop: "18px",
                        paddingTop: "18px",
                        borderTop: `1px solid ${theme.colors.border}`,
                    }}
                >
                    <Text style={{ margin: "0 0 4px", fontSize: "12px", color: theme.colors.textSecondary }}>
                        Ticket
                    </Text>
                    <Text
                        style={{
                            margin: "0",
                            fontSize: "14px",
                            fontWeight: 700,
                            color: isPaid ? theme.colors.warning : theme.colors.success,
                        }}
                    >
                        {isPaid ? `₹${data.price.toLocaleString("en-IN")} · Paid` : "Free"}
                    </Text>
                </Section>
            </Section>

            <Section
                style={{
                    backgroundColor: theme.colors.dark,
                    borderRadius: theme.radius.md,
                    padding: "20px 24px",
                    marginBottom: "24px",
                }}
            >
                <Section style={{ width: "55%", display: "inline-block", verticalAlign: "top" }}>
                    <Text
                        style={{
                            margin: "0 0 6px",
                            fontSize: "10px",
                            fontWeight: 700,
                            color: "rgba(255,255,255,0.45)",
                            textTransform: "uppercase",
                            letterSpacing: "0.14em",
                        }}
                    >
                        Ticket ID
                    </Text>
                    <Text
                        style={{
                            margin: "0 0 16px",
                            fontSize: "14px",
                            fontFamily: theme.font.mono,
                            color: "#ffffff",
                            letterSpacing: "0.08em",
                        }}
                    >
                        {ticketIdShort}
                    </Text>
                    <Text
                        style={{
                            margin: "0 0 6px",
                            fontSize: "10px",
                            fontWeight: 700,
                            color: "rgba(255,255,255,0.45)",
                            textTransform: "uppercase",
                            letterSpacing: "0.14em",
                        }}
                    >
                        Scan at entry
                    </Text>
                    <Text style={{ margin: "0", fontSize: "11px", lineHeight: "18px", color: "rgba(255,255,255,0.65)" }}>
                        Show this QR code at the event entrance for check-in.
                    </Text>
                </Section>
                <Section
                    style={{
                        width: "45%",
                        display: "inline-block",
                        verticalAlign: "top",
                        textAlign: "right",
                    }}
                >
                    <Img
                        src={qrUrl}
                        width="120"
                        height="120"
                        alt="Ticket QR Code"
                        style={{
                            borderRadius: "8px",
                            display: "inline-block",
                        }}
                    />
                </Section>
            </Section>

            <Section style={{ marginBottom: "8px" }}>
                <Section style={{ width: "50%", display: "inline-block", paddingRight: "8px" }}>
                    <a
                        href={ticketUrl}
                        style={{
                            display: "block",
                            textAlign: "center",
                            backgroundColor: theme.colors.primary,
                            color: "#ffffff",
                            textDecoration: "none",
                            fontSize: "13px",
                            fontWeight: 700,
                            padding: "12px 16px",
                            borderRadius: "10px",
                        }}
                    >
                        View my tickets →
                    </a>
                </Section>
                <Section style={{ width: "50%", display: "inline-block", paddingLeft: "8px" }}>
                    <a
                        href={eventUrl}
                        style={{
                            display: "block",
                            textAlign: "center",
                            backgroundColor: theme.colors.background,
                            color: theme.colors.textPrimary,
                            textDecoration: "none",
                            fontSize: "13px",
                            fontWeight: 700,
                            padding: "12px 16px",
                            borderRadius: "10px",
                            border: `1px solid ${theme.colors.border}`,
                        }}
                    >
                        View event
                    </a>
                </Section>
            </Section>
        </EmailWrapper>
    );
}

export async function html(data: BookingConfirmationData): Promise<string> {
    return render(<BookingConfirmationEmail {...data} />);
}
