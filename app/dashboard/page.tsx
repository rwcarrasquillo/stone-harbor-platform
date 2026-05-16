"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Cormorant_Garamond, Inter } from "next/font/google";

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

type Profile = {
  email: string | null;
  display_name: string | null;
  role: string | null;
  bio?: string | null;
  healing_stage?: string | null;
  privacy_level?: string | null;
};

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function checkUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { data } = await supabase
      .from("profiles")
      .select("email, display_name, role, bio, healing_stage, privacy_level")
      .eq("id", user.id)
      .single();

    setProfile({
      email: data?.email ?? user.email ?? null,
      display_name: data?.display_name ?? null,
      role: data?.role ?? "member",
      bio: data?.bio ?? null,
      healing_stage: data?.healing_stage ?? null,
      privacy_level: data?.privacy_level ?? "private",
    });

    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  useEffect(() => {
    checkUser();
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3efe7] text-stone-700">
        <p className="text-sm font-bold uppercase tracking-[0.3em]">
          Loading Harbor...
        </p>
      </main>
    );
  }

  return (
    <main
      className={`${sans.className} min-h-screen bg-[#f3efe7] px-6 py-12 text-stone-900`}
    >
      <section className="mx-auto max-w-7xl">
        <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <a
            href="/"
            className="text-sm font-bold uppercase tracking-[0.3em] text-[#a9793d]"
          >
            ← Stone Harbor
          </a>

          <button
            onClick={handleLogout}
            className="w-fit rounded-full border border-stone-300 bg-white/70 px-6 py-3 text-xs font-bold uppercase tracking-[0.25em] text-stone-700 transition hover:border-[#a9793d] hover:bg-white"
          >
            Logout
          </button>
        </div>

        <div className="rounded-[3rem] border border-white/50 bg-white/75 p-8 shadow-[0_20px_80px_rgba(0,0,0,0.08)] backdrop-blur-2xl md:p-14">
          <p className="mb-5 text-sm font-bold uppercase tracking-[0.35em] text-[#a9793d]">
            Member Dashboard Updated
          </p>

          <h1
            className={`${serif.className} max-w-5xl text-5xl font-medium leading-tight md:text-7xl`}
          >
            Welcome back
            {profile?.display_name ? `, ${profile.display_name}` : ""}.
          </h1>

          <p className="mt-6 max-w-3xl text-lg leading-relaxed text-stone-600 md:text-xl">
            You are logged in as{" "}
            <span className="font-semibold text-stone-900">
              {profile?.email}
            </span>
            .
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-[2rem] border border-stone-200 bg-[#f8f4ed] p-6">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.25em] text-[#a9793d]">
                Stage
              </p>
              <p className="text-lg font-semibold capitalize text-stone-800">
                {profile?.healing_stage || "Not set"}
              </p>
            </div>

            <div className="rounded-[2rem] border border-stone-200 bg-[#f8f4ed] p-6">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.25em] text-[#a9793d]">
                Privacy
              </p>
              <p className="text-lg font-semibold capitalize text-stone-800">
                {profile?.privacy_level || "Private"}
              </p>
            </div>

            <div className="rounded-[2rem] border border-stone-200 bg-[#f8f4ed] p-6">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.25em] text-[#a9793d]">
                Role
              </p>
              <p className="text-lg font-semibold capitalize text-stone-800">
                {profile?.role || "Member"}
              </p>
            </div>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            <a
              href="/welcome"
              className="rounded-[2rem] border border-stone-200 bg-[#f8f4ed] p-7 transition hover:-translate-y-1 hover:border-[#a9793d]/50 hover:bg-white hover:shadow-md"
            >
              <p className="mb-4 text-sm font-bold uppercase tracking-[0.25em] text-[#a9793d]">
                Profile
              </p>

              <h2 className={`${serif.className} text-4xl font-medium`}>
                My Profile
              </h2>

              <p className="mt-4 leading-relaxed text-stone-600">
                Update your display name, privacy defaults, and healing stage.
              </p>
            </a>

            <a
              href="/journal"
              className="rounded-[2rem] border border-stone-200 bg-[#f8f4ed] p-7 transition hover:-translate-y-1 hover:border-[#a9793d]/50 hover:bg-white hover:shadow-md"
            >
              <p className="mb-4 text-sm font-bold uppercase tracking-[0.25em] text-[#a9793d]">
                Phase 2
              </p>

              <h2 className={`${serif.className} text-4xl font-medium`}>
                Journal
              </h2>

              <p className="mt-4 leading-relaxed text-stone-600">
                A private space for daily reflection, clarity, and emotional
                processing.
              </p>
            </a>

            <a
              href="/members-blog"
              className="rounded-[2rem] border border-stone-200 bg-[#f8f4ed] p-7 transition hover:-translate-y-1 hover:border-[#a9793d]/50 hover:bg-white hover:shadow-md"
            >
              <p className="mb-4 text-sm font-bold uppercase tracking-[0.25em] text-[#a9793d]">
                Phase 3
              </p>

              <h2 className={`${serif.className} text-4xl font-medium`}>
                Member Blog
              </h2>

              <p className="mt-4 leading-relaxed text-stone-600">
                Protected articles, lessons, and recovery resources for members
                only.
              </p>
            </a>

            <a
              href="/community"
              className="rounded-[2rem] border border-stone-200 bg-[#f8f4ed] p-7 transition hover:-translate-y-1 hover:border-[#a9793d]/50 hover:bg-white hover:shadow-md"
            >
              <p className="mb-4 text-sm font-bold uppercase tracking-[0.25em] text-[#a9793d]">
                Phase 4+
              </p>

              <h2 className={`${serif.className} text-4xl font-medium`}>
                Community
              </h2>

              <p className="mt-4 leading-relaxed text-stone-600">
                Photos, posts, friends, and privacy-controlled member sharing.
              </p>
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
