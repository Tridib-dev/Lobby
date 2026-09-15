import { Section, Text } from "@react-email/components";
import { render } from "@react-email/render";
import { EmailWrapper } from "../wrapper";
import { BASE_URL, theme } from "../theme";
import { getEmailEventDisplayTime } from "@/lib/time";

export type OrderReceiptData = {
    to: string;
    eventTitle: string;
    eventDate: string;
    eventTime: string;
    eventLocation: string;
    ticketId: string;
    paymentId: string;
    amount: number;
    eventSlug: string;
    mode?: string;
    timezone?: string;
    startAtUTC?: string;
    recipientTimezone?: string;
};

export function subject(eventTitle: string): string {
    return `Payment receipt for "${eventTitle}"`;
}

function OrderReceiptEmail(data: OrderReceiptData) {
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
            previewText={`Your payment for ${data.eventTitle} is confirmed`}
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
                    Payment received
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
                    Your order is confirmed.
                </Text>
                <Text
                    style={{
                        margin: "0",
                        fontSize: "15px",
                        lineHeight: "24px",
                        color: theme.colors.textPrimary,
                    }}
                >
                    We&apos;ve received your payment for <strong>{data.eventTitle}</strong>.
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
                    backgroundColor: theme.colors.dark,
                    borderRadius: theme.radius.md,
                    padding: "20px 24px",
                    marginBottom: "24px",
                }}
            >
                <Text style={{ margin: "0 0 6px", fontSize: "10px", fontWeight: 700, color: "rgba(255,255,255,0.45)" }}>
                    Receipt total
                </Text>
                <Text style={{ margin: "0 0 14px", fontSize: "22px", fontWeight: 700, color: "#ffffff" }}>
                    ₹{data.amount.toLocaleString("en-IN")}
                </Text>
                <Text style={{ margin: "0 0 6px", fontSize: "10px", fontWeight: 700, color: "rgba(255,255,255,0.45)" }}>
                    Razorpay payment ID
                </Text>
                <Text style={{ margin: "0", fontSize: "12px", fontFamily: theme.font.mono, color: "rgba(255,255,255,0.8)" }}>
                    {data.paymentId}
                </Text>
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
                        View my ticket →
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

export async function html(data: OrderReceiptData): Promise<string> {
    return render(<OrderReceiptEmail {...data} />);
}
