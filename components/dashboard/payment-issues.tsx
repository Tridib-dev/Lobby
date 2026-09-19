import type { PaymentIssueItem } from "@/lib/actions/dashboard.actions";

export default function PaymentIssues({ issues }: { issues: PaymentIssueItem[] }) {
    if (!issues.length) return null;

    return (
        <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <h2 className="text-sm font-semibold text-amber-900">Payment updates</h2>
            <div className="mt-3 space-y-3">
                {issues.map((issue) => (
                    <div key={issue.id} className="rounded-lg border border-amber-200 bg-white/70 p-3 text-sm">
                        <p className="font-medium text-slate-900">{issue.eventTitle}</p>
                        <p className="mt-1 text-xs text-slate-600">
                            ₹{issue.amount.toLocaleString("en-IN")} payment — {issue.status === "refunded"
                                ? "Refunded"
                                : "Refund required; our support team will process it."}
                        </p>
                    </div>
                ))}
            </div>
        </section>
    );
}
