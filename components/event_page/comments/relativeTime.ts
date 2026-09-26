export function formatRelativeTime(value: string | Date, now = Date.now()) {
    const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
    if (Number.isNaN(timestamp)) return "";

    const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
    if (seconds < 60) return "just now";

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;

    const months = Math.floor(days / 30);
    if (months < 12) return `${months}month${months === 1 ? "" : "s"} ago`;

    const years = Math.floor(months / 12);
    return `${years}year${years === 1 ? "" : "s"} ago`;
}
