import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/shell";
import SettingsForm from "@/components/dashboard/settings-form";
import { connection } from "next/server";

export const metadata = { title: "Settings — DevEvent" };

type SettingsMetadata = {
    devEventSettings?: {
        notifications?: {
            eventReminders?: boolean;
            nearbyEvents?: boolean;
            organizerUpdates?: boolean;
            productUpdates?: boolean;
        };
    };
};

export default async function SettingsPage() {
    await connection();
    const user = await currentUser();
    if (!user) redirect("/sign-in");

    const publicMetadata = (user.publicMetadata ?? {}) as SettingsMetadata;

    return (
        <div>
            <PageHeader
                kicker="Preferences"
                title="Settings"
                description="Manage your Clerk account, app preferences, and future dashboard settings from one place."
            />
            <SettingsForm
                initialData={{
                    firstName: user.firstName ?? "",
                    lastName: user.lastName ?? "",
                    username: user.username ?? "",
                    email: user.emailAddresses[0]?.emailAddress ?? "",
                    imageUrl: user.imageUrl ?? "",
                    publicMetadata,
                }}
            />
        </div>
    );
}
