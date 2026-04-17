import Link from "next/link";
import { stackServerApp } from "@/stack/server";
import { redirect } from "next/navigation";
import Logo from "@/components/logo";

export default async function Home() {
  const user = await stackServerApp.getUser();
  if (user) {
    redirect("/dashboard");
  }
  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(56,189,248,0.08) 0%, rgba(168,85,247,0.06) 40%, #0a0a0f 70%)" }}>
      {/* Grid background */}
      <div className="absolute inset-0 opacity-10"
        style={{ backgroundImage: "linear-gradient(rgba(56,189,248,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.3) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

      <div className="relative text-center px-4">
        <div className="flex justify-center mb-6">
          <Logo size={100} />
        </div>
        <h1 className="text-5xl font-bold mb-4 tracking-tight"
          style={{ background: "linear-gradient(90deg, #38bdf8, #a855f7, #38bdf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          Inventory App
        </h1>
        <p className="text-lg mb-10 max-w-xl mx-auto" style={{ color: "rgba(226,232,240,0.6)" }}>
          Streamline your inventory tracking with our powerful, easy-to-use management system.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/sign-in"
            className="px-8 py-3 rounded-lg font-semibold transition-all duration-200 hover:opacity-90"
            style={{ background: "linear-gradient(90deg, #38bdf8, #7c3aed)", color: "white" }}
          >
            Sign In
          </Link>
          <Link
            href="#"
            className="px-8 py-3 rounded-lg font-semibold transition-all duration-200"
            style={{ border: "1px solid rgba(56,189,248,0.4)", color: "#38bdf8", background: "rgba(56,189,248,0.05)" }}
          >
            Learn More
          </Link>
        </div>
      </div>
    </div>
  );
}
