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

export default function WelcomePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [hometown, setHometown] = useState("");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [birthday, setBirthday] = useState("");
  const [gender, setGender] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [relationshipStatus, setRelationshipStatus] = useState("");
  const [work, setWork] = useState("");
  const [education, setEducation] = useState("");
  const [languages, setLanguages] = useState("");
  const [interests, setInterests] = useState("");
  const [favoriteQuote, setFavoriteQuote] = useState("");
  const [healingStage, setHealingStage] = useState("clarity");
  const [privacyLevel, setPrivacyLevel] = useState("private");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function loadProfile() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    setUserId(user.id);
    setEmail(user.email ?? "");

    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (data) {
      setDisplayName(data.display_name ?? "");
      setUsername(data.username ?? "");
      setFullName(data.full_name ?? "");
      setBio(data.bio ?? "");
      setLocation(data.location ?? "");
      setHometown(data.hometown ?? "");
      setWebsite(data.website ?? "");
      setPhone(data.phone ?? "");
      setBirthday(data.birthday ?? "");
      setGender(data.gender ?? "");
      setPronouns(data.pronouns ?? "");
      setRelationshipStatus(data.relationship_status ?? "");
      setWork(data.work ?? "");
      setEducation(data.education ?? "");
      setLanguages(data.languages ?? "");
      setInterests(data.interests ?? "");
      setFavoriteQuote(data.favorite_quote ?? "");
      setHealingStage(data.healing_stage ?? "clarity");
      setPrivacyLevel(data.privacy_level ?? "private");
    }

    setLoading(false);
  }

  async function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!userId) return;

    setSaving(true);
    setMessage("");

    const cleanUsername = username
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");

    const { error } = await supabase.from("profiles").upsert({
      id: userId,
      email,
      display_name: displayName.trim() || null,
      username: cleanUsername || null,
      full_name: fullName.trim() || null,
      bio: bio.trim() || null,
      location: location.trim() || null,
      hometown: hometown.trim() || null,
      website: website.trim() || null,
      phone: phone.trim() || null,
      birthday: birthday || null,
      gender: gender || null,
      pronouns: pronouns.trim() || null,
      relationship_status: relationshipStatus || null,
      work: work.trim() || null,
      education: education.trim() || null,
      languages: languages.trim() || null,
      interests: interests.trim() || null,
      favorite_quote: favoriteQuote.trim() || null,
      healing_stage: healingStage,
      privacy_level: privacyLevel,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      setMessage(`Profile error: ${error.message}`);
      setSaving(false);
      return;
    }

    setMessage("Profile saved. Redirecting to your dashboard...");

    setTimeout(() => {
      window.location.href = "/dashboard";
    }, 1000);

    setSaving(false);
  }

  useEffect(() => {
    loadProfile();
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3efe7] text-stone-700">
        <p className="text-sm font-bold uppercase tracking-[0.3em]">
          Preparing Your Harbor...
        </p>
      </main>
    );
  }

  return (
    <main
      className={`${sans.className} min-h-screen bg-[#f3efe7] px-6 py-14 text-stone-900`}
    >
      <section className="mx-auto max-w-6xl">
        <a
          href="/dashboard"
          className="mb-10 inline-block text-sm font-bold uppercase tracking-[0.3em] text-[#a9793d]"
        >
          ← Dashboard
        </a>

        <div className="mb-12">
          <p className="mb-5 text-sm font-bold uppercase tracking-[0.4em] text-[#a9793d]">
            Member Profile
          </p>

          <h1
            className={`${serif.className} text-6xl font-medium leading-tight md:text-7xl`}
          >
            Build your Stone Harbor identity.
          </h1>

          <p className="mt-6 max-w-3xl text-lg leading-relaxed text-stone-600">
            Add as much or as little as you want. Sensitive fields should stay
            optional and private by default.
          </p>
        </div>

        <form
          onSubmit={saveProfile}
          className="rounded-[2.5rem] border border-white/60 bg-white/75 p-8 shadow-[0_20px_80px_rgba(0,0,0,0.08)] backdrop-blur-2xl"
        >
          <div className="grid gap-6 md:grid-cols-2">
            <Field
              label="Display Name"
              value={displayName}
              setValue={setDisplayName}
              required
            />
            <Field
              label="Username"
              value={username}
              setValue={setUsername}
              placeholder="letters, numbers, underscores"
            />
            <Field label="Full Name" value={fullName} setValue={setFullName} />
            <Field
              label="Location"
              value={location}
              setValue={setLocation}
              placeholder="City, State"
            />
            <Field label="Hometown" value={hometown} setValue={setHometown} />
            <Field label="Website" value={website} setValue={setWebsite} />
            <Field label="Phone" value={phone} setValue={setPhone} />
            <Field
              label="Birthday"
              value={birthday}
              setValue={setBirthday}
              type="date"
            />
            <Field label="Pronouns" value={pronouns} setValue={setPronouns} />
            <Field
              label="Languages"
              value={languages}
              setValue={setLanguages}
              placeholder="English, Spanish..."
            />
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <SelectField
              label="Gender"
              value={gender}
              setValue={setGender}
              options={[
                ["", "Prefer not to say"],
                ["male", "Male"],
                ["female", "Female"],
                ["nonbinary", "Non-binary"],
                ["self_describe", "Prefer to self-describe"],
              ]}
            />

            <SelectField
              label="Relationship Status"
              value={relationshipStatus}
              setValue={setRelationshipStatus}
              options={[
                ["", "Prefer not to say"],
                ["single", "Single"],
                ["married", "Married"],
                ["separated", "Separated"],
                ["divorced", "Divorced"],
                ["widowed", "Widowed"],
                ["relationship", "In a relationship"],
              ]}
            />

            <SelectField
              label="Healing Stage"
              value={healingStage}
              setValue={setHealingStage}
              options={[
                ["clarity", "Clarity — I need to understand"],
                ["calm", "Calm — I need steadiness"],
                ["strength", "Strength — I am rebuilding"],
                ["purpose", "Purpose — I am moving forward"],
              ]}
            />

            <SelectField
              label="Default Privacy"
              value={privacyLevel}
              setValue={setPrivacyLevel}
              options={[
                ["private", "Private — only me"],
                ["friends", "Friends only"],
                ["members", "Members only"],
              ]}
            />
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <TextArea label="Bio" value={bio} setValue={setBio} />
            <TextArea
              label="Work"
              value={work}
              setValue={setWork}
              placeholder="Job, career, company, industry..."
            />
            <TextArea
              label="Education"
              value={education}
              setValue={setEducation}
            />
            <TextArea
              label="Interests"
              value={interests}
              setValue={setInterests}
              placeholder="Fitness, reading, hiking..."
            />
          </div>

          <div className="mt-6">
            <TextArea
              label="Favorite Quote"
              value={favoriteQuote}
              setValue={setFavoriteQuote}
              rows={3}
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="group relative mt-8 w-full overflow-hidden rounded-full border border-[#f4d7a1]/50 bg-[#a9793d]/70 px-8 py-5 text-sm font-bold uppercase tracking-[0.25em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_35px_rgba(0,0,0,0.18)] backdrop-blur-2xl transition duration-300 hover:scale-[1.02] hover:bg-[#8d6432]/80 disabled:opacity-60"
          >
            <span className="absolute inset-0 bg-gradient-to-br from-[#f4d7a1]/35 via-white/10 to-transparent opacity-80" />
            <span className="relative z-10">
              {saving ? "Saving..." : "Save Profile"}
            </span>
          </button>

          {message && (
            <div className="mt-6 rounded-2xl bg-[#f5f0e8] px-4 py-4 text-center">
              <p className="text-sm font-semibold text-stone-700">{message}</p>
            </div>
          )}
        </form>
      </section>
    </main>
  );
}

function Field({
  label,
  value,
  setValue,
  placeholder,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-bold uppercase tracking-[0.2em] text-stone-600">
        {label}
      </label>

      <input
        required={required}
        type={type}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-2xl border border-stone-300 bg-[#f8f4ed] px-5 py-4 outline-none transition focus:border-[#a9793d]"
        placeholder={placeholder}
      />
    </div>
  );
}

function TextArea({
  label,
  value,
  setValue,
  placeholder,
  rows = 5,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-bold uppercase tracking-[0.2em] text-stone-600">
        {label}
      </label>

      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={rows}
        className="w-full resize-none rounded-2xl border border-stone-300 bg-[#f8f4ed] px-5 py-4 outline-none transition focus:border-[#a9793d]"
        placeholder={placeholder}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  setValue,
  options,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-bold uppercase tracking-[0.2em] text-stone-600">
        {label}
      </label>

      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-2xl border border-stone-300 bg-[#f8f4ed] px-5 py-4 outline-none transition focus:border-[#a9793d]"
      >
        {options.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
