import Sidebar from "@/components/sidebar";
import { getCurrentUser } from "@/lib/auth";
import { AccountSettings } from "@stackframe/stack";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen" style={{ background: "#0a0a0f" }}>
      <Sidebar currentPath="/settings" />
      <main className="ml-64 p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold" style={{ color: "#e2e8f0" }}>Settings</h1>
          <p className="text-sm mt-1" style={{ color: "rgba(226,232,240,0.5)" }}>
            Manage your account settings and preferences.
          </p>
        </div>
        <div className="max-w-4xl">
          <div className="p-6" style={{ background: "rgba(13,13,26,0.8)", border: "1px solid rgba(56,189,248,0.15)", borderRadius: "12px" }}>
            <AccountSettings fullPage />
          </div>
        </div>
      </main>
    </div>
  );
}
