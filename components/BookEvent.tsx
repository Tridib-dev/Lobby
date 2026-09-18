'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useUser } from '@clerk/nextjs';
import { CreateBooking, hasUserBookedEvent } from '@/lib/actions/booking.actions';
import { hasUserPaidForEvent } from '@/lib/actions/order.actions';
import { toast } from 'sonner';
// Image import removed (not used here)
import { Button } from "@/components/ui/button";
import { toggleWatchlist, isEventSaved } from '@/lib/actions/watchlist.actions';
import SaveButtonIcon from '@/components/ui/SaveButtonIcon';
import TicketModal from '@/components/dashboard/ticket-modal';
import type { TicketItem } from '@/lib/actions/dashboard.actions';

// Extend window to include Razorpay
declare global {
    interface Window {
        Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
    }
}

interface RazorpayOptions {
    key: string;
    amount: number;
    currency: string;
    name: string;
    description: string;
    order_id: string;
    handler: (response: RazorpayResponse) => void;
    prefill?: { name?: string; email?: string };
    theme?: { color?: string };
    modal?: { ondismiss?: () => void };
}

interface RazorpayInstance {
    open: () => void;
}

interface RazorpayResponse {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
}

// Load Razorpay script dynamically
const loadRazorpayScript = (): Promise<boolean> =>
    new Promise((resolve) => {
        if (typeof window !== "undefined" && window.Razorpay) {
            resolve(true);
            return;
        }
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
    });

interface StickyBookingBarProps {
    eventId: string;
    slug: string;
    title: string;
    description?: string;
    image: string;
    location: string;
    category?: string;
    price: number;
    mode: string;
    eventDate?: string;
    eventTime?: string;
    timezone?: string;
    capacity?: number | null;
    confirmedRegistrationCount?: number;
    reservedRegistrationCount?: number;
}

const StickyBookingBar = ({
    eventId,
    slug,
    title,
    description = "",
    image,
    location,
    category,
    price,
    mode,
    eventDate = "",
    eventTime = "",
    timezone,
    capacity = null,
    confirmedRegistrationCount = 0,
    reservedRegistrationCount = 0,
}: StickyBookingBarProps) => {
    const { isSignedIn, user } = useUser();
    const [isSaved, setIsSaved] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isBooking, setIsBooking] = useState(false);
    const [hasBooked, setHasBooked] = useState(false);
    const [ticketModalOpen, setTicketModalOpen] = useState(false);

    const isPaid = price > 0;
    const remaining = capacity === null ? null : Math.max(0, capacity - confirmedRegistrationCount - reservedRegistrationCount);
    const isSoldOut = remaining === 0;
    const shortDesc =
        description.length > 85 ? description.substring(0, 85) + "..." : description;
    const bookedAt = new Date().toISOString();
    const ticketStatus: TicketItem["status"] = "upcoming";
    const ticketType: TicketItem["type"] = isPaid ? "paid" : "free";

    // NOTE: eventDate is used as-is (empty string if not provided by the
    // parent) rather than fabricating "now" as a fallback — a fabricated
    // date would silently show the wrong event date on this placeholder
    // ticket. This placeholder is only shown briefly right after booking;
    // the authoritative ticket (correct date/time/timezone) is fetched
    // properly afterward via getUserTickets. Revisit once TicketModal's
    // handling of an empty eventDate is confirmed.
    const ticket = ticketModalOpen && hasBooked
        ? {
            id: `${eventId}-${slug}`,
            type: ticketType,
            eventId,
            eventTitle: title,
            username: user?.fullName ?? user?.username ?? "Guest",
            eventCategory: category,
            eventSlug: slug,
            eventImage: image,
            eventDate,
            eventTime,
            eventLocation: location,
            eventMode: mode,
            eventOrganizer: "Organizer", // placeholder — matches backend's organizerForEvent() fallback; real name resolved via getUserTickets
            timezone, // now threaded from props, not hardcoded to undefined
            price,
            bookedAt,
            checkedIn: false,
            status: ticketStatus,
        }
        : null;

    // Check existing booking/order status
    useEffect(() => {
        const check = async () => {
            if (!isSignedIn) return;
            if (isPaid) {
                const paid = await hasUserPaidForEvent(eventId);
                setHasBooked(paid);
            } else {
                const booked = await hasUserBookedEvent(eventId);
                setHasBooked(booked);
            }
            const saved = await isEventSaved(eventId);
            setIsSaved(saved);
        };
        check();
    }, [eventId, isSignedIn, isPaid]);

    const handleSave = async () => {
        if (!isSignedIn) {
            window.location.href = `/sign-in?redirect_url=${encodeURIComponent(window.location.pathname)}`;
            return;
        }
        setIsSaving(true);
        try {
            const result = await toggleWatchlist(eventId);
            setIsSaved(result.saved);
            toast.success(result.saved ? "Saved to watchlist" : "Removed from watchlist");
        } catch {
            toast.error("Could not update watchlist. Try again.");
        } finally {
            setIsSaving(false);
        }
    };

    // ── Free event booking ────────────────────────────────────────────────
    const handleFreeBook = async () => {
        if (!isSignedIn) {
            window.location.href = `/sign-in?redirect_url=${encodeURIComponent(window.location.pathname)}`;
            return;
        }
        setIsBooking(true);
        if (isSoldOut) {
            toast.error("This event is sold out.");
            setIsBooking(false);
            return;
        }
        const recipientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const result = await CreateBooking({ eventId, slug, recipientTimezone });
        if (result.success) {
            setHasBooked(true);
            setTicketModalOpen(true);
            toast.success("🎉 You're signed up!");
        } else {
            toast.error(result.error || "Booking failed.");
        }
        setIsBooking(false);
    };

    // ── Paid event booking via Razorpay ───────────────────────────────────
    const handlePaidBook = async () => {
        if (!isSignedIn) {
            window.location.href = `/sign-in?redirect_url=${encodeURIComponent(window.location.pathname)}`;
            return;
        }

        setIsBooking(true);

        if (isSoldOut) {
            toast.error("This event is sold out.");
            setIsBooking(false);
            return;
        }

        // 1. Load Razorpay SDK
        const loaded = await loadRazorpayScript();
        if (!loaded) {
            toast.error("Failed to load payment gateway. Please try again.");
            setIsBooking(false);
            return;
        }

        // 2. Create Razorpay order on server
        const res = await fetch("/api/razorpay/create-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventId }),
        });

        if (!res.ok) {
            const payload = await res.json().catch(() => ({}));
            toast.error(payload.error || "Could not initiate payment. Please try again.");
            setIsBooking(false);
            return;
        }

        const { orderId, amount, currency } = await res.json();

        // 3. Open Razorpay modal
        const options: RazorpayOptions = {
            key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
            amount,
            currency,
            name: "DevEvent",
            description: title,
            order_id: orderId,
            prefill: {
                name: user?.fullName ?? "",
                email: user?.emailAddresses?.[0]?.emailAddress ?? "",
            },
            theme: { color: "#06b6d4" },
            modal: {
                ondismiss: () => {
                    toast.info("Payment cancelled.");
                    setIsBooking(false);
                },
            },
            handler: async (response: RazorpayResponse) => {
                // 4. Verify on server
                const verifyRes = await fetch("/api/razorpay/verify", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        ...response,
                        eventId,
                        recipientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                        userEmail: user?.emailAddresses?.[0]?.emailAddress ?? "",
                    }),
                });

                if (verifyRes.ok) {
                    setHasBooked(true);
                    setTicketModalOpen(true);
                    toast.success("Your ticket is ready.");
                } else {
                    toast.error("Payment verification failed. Contact support.");
                }
                setIsBooking(false);
            },
        };

        const rzp = new window.Razorpay(options);
        rzp.open();
    };

    const handleBook = isPaid ? handlePaidBook : handleFreeBook;
    const handleViewTicket = () => {
        setTicketModalOpen(true);
    };

    return (
        <>
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-3xl px-4">
                <div className="bg-zinc-950/95 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
                    <div className="px-6 py-5 flex items-center justify-between">
                        {/* Left Info */}
                        <div className="flex-1 min-w-0 pr-6">
                            <div className="flex items-center gap-3 mb-1">
                                <div className="text-xs font-mono text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded">
                                    {mode}
                                </div>
                                {isPaid && (
                                    <div className="text-xs font-medium text-amber-400">
                                        ₹{price.toLocaleString("en-IN")}
                                    </div>
                                )}
                                {remaining !== null && (
                                    <div className={`text-xs font-medium ${isSoldOut ? "text-rose-400" : "text-cyan-300"}`}>
                                        {isSoldOut ? "Sold out" : `${remaining} spot${remaining === 1 ? "" : "s"} left`}
                                    </div>
                                )}
                            </div>
                            <p className="font-semibold text-white text-[17px] leading-tight truncate">
                                {title}
                            </p>
                            {shortDesc && (
                                <p className="text-sm text-white/60 mt-1 line-clamp-1">
                                    {shortDesc}
                                </p>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3">
                            <SaveButtonIcon
                                saved={isSaved}
                                loading={isSaving}
                                onToggle={() => handleSave()}
                            >
                                {isSaved ? 'Saved' : 'Save'}
                            </SaveButtonIcon>

                            {hasBooked ? (
                                <Button
                                    type="button"
                                    onClick={handleViewTicket}
                                    className="group inline-flex h-auto min-h-0 items-center justify-center gap-2 rounded-xl border px-3 py-2 leading-none shadow-sm backdrop-blur-md transform transition-all duration-200 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 border-white/80 bg-white/90 text-zinc-900 hover:-translate-y-0.5 hover:shadow-md hover:bg-white"
                                >
                                    <span className="flex items-center justify-center w-5 h-5 shrink-0 transition-transform duration-300 group-hover:scale-110 group-active:scale-95">
                                        <Image
                                            src="/icons/coupon-2-svgrepo-com.svg"
                                            alt=""
                                            width={20}
                                            height={20}
                                            className="w-5 h-5 select-none"
                                        />
                                    </span>
                                    <span className="text-sm font-medium leading-none">View Ticket</span>
                                </Button>
                            ) : (
                                <Button
                                    onClick={handleBook}
                                    disabled={isBooking || isSoldOut}
                                    className="group inline-flex h-auto min-h-0 items-center justify-center gap-2 rounded-xl border px-3 py-2 leading-none shadow-sm backdrop-blur-md transform transition-all duration-200 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 border-white/80 bg-white/90 text-zinc-900 hover:-translate-y-0.5 hover:shadow-md hover:bg-white disabled:translate-y-0 disabled:hover:bg-white disabled:hover:shadow-sm disabled:opacity-70"
                                >
                                    <span className="relative z-10 flex items-center gap-2">
                                        {isBooking ? (
                                            isPaid ? "Opening payment…" : "Booking…"
                                        ) : isSoldOut ? (
                                            "Sold out"
                                        ) : isPaid ? (
                                            `Book • ₹${price.toLocaleString("en-IN")}`
                                        ) : (
                                            "Attend Free"
                                        )}
                                    </span>
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <TicketModal
                ticket={ticket}
                onClose={() => setTicketModalOpen(false)}
            />
        </>
    );
};

export default StickyBookingBar;
