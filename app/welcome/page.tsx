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

  const [avatarUrl, setAvatarUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);

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
      setAvatarUrl(data.avatar_url ?? "");
      setCoverUrl(data.cover_url ?? "");
    }

    setLoading(false);
  }

  async function uploadProfileImage(file: File, type: "avatar" | "cover") {
    if (!userId) return null;

    const fileExtension = file.name.split(".").pop()?.toLowerCase() || "png";
    const filePath = `${userId}/${type}-${Date.now()}.${fileExtension}`;

    const { error } = await supabase.storage
      .from("profile-images")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
      });

    if (error) {
      setMessage(`${type} upload error: ${error.message}`);
      return null;
    }

    const { data } = supabase.storage
      .from("profile-images")
      .getPublicUrl(filePath);

    return data.publicUrl;
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    setAvatarUploading(true);
    setMessage("");

    const publicUrl = await uploadProfileImage(file, "avatar");

    if (publicUrl) {
      setAvatarUrl(publicUrl);

      const { error } = await supabase
        .from("profiles")
        .update({
          avatar_url: publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (error) {
        setMessage(`Avatar save error: ${error.message}`);
      } else {
        setMessage("Avatar uploaded.");
      }
    }

    setAvatarUploading(false);
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    setCoverUploading(true);
    setMessage("");

    const publicUrl = await uploadProfileImage(file, "cover");

    if (publicUrl) {
      setCoverUrl(publicUrl);

      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          cover_url: publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (profileError) {
        setMessage(`Cover save error: ${profileError.message}`);
        setCoverUploading(false);
        return;
      }

      await supabase.from("profile_cover_images").insert({
        user_id: userId,
        image_url: publicUrl,
        caption: "Profile cover image",
      });

      setMessage("Cover image uploaded.");
    }

    setCoverUploading(false);
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
      avatar_url: avatarUrl || null,
      cover_url: coverUrl || null,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      setMessage(`Profile error: ${error.message}`);
      setSaving(false);
      return;
    }

    setMessage("Profile saved. Redirecting...");
    setSaving(false);

    setTimeout(() => {
      window.location.href = "/dashboard";
    }, 900);
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
          className="border border-white/60 bg-white p-8 shadow-[0_20px_80px_rgba(0,0,0,0.08)]"
        >
          <div className="mb-10 overflow-hidden border border-stone-200 bg-[#f8f4ed]">
            <div
              className="relative h-64 bg-cover bg-center"
              style={{
                backgroundImage: coverUrl
                  ? `url(${coverUrl})`
                  : "linear-gradient(135deg, #d8b07b, #8d6432)",
              }}
            >
              <label className="absolute right-5 top-5 cursor-pointer rounded-full border border-white/40 bg-white/30 px-5 py-3 text-xs font-bold uppercase tracking-[0.2em] text-white shadow-lg backdrop-blur-xl transition hover:bg-white/45">
                {coverUploading ? "Uploading..." : "Upload Cover"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCoverUpload}
                  className="hidden"
                  disabled={coverUploading}
                />
              </label>

              <div className="absolute -bottom-14 left-8">
                <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-4 border-[#f8f4ed] bg-[#efe8dc] shadow-xl">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Profile avatar"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-5xl text-[#a9793d]">⚓</span>
                  )}
                </div>

                <label className="mt-4 inline-flex cursor-pointer rounded-full border border-[#a9793d]/30 bg-white px-5 py-3 text-xs font-bold uppercase tracking-[0.2em] text-stone-700 shadow-sm transition hover:bg-[#f8f4ed]">
                  {avatarUploading ? "Uploading..." : "Upload Avatar"}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                    disabled={avatarUploading}
                  />
                </label>
              </div>
            </div>

            <div className="px-8 pb-8 pt-24">
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-[#a9793d]">
                Profile Images
              </p>

              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-stone-600">
                Upload a profile avatar and cover image. Cover images are saved
                to your history so you can browse previous banners from the
                dashboard.
              </p>
            </div>
          </div>

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
            <TextArea label="Work" value={work} setValue={setWork} />
            <TextArea
              label="Education"
              value={education}
              setValue={setEducation}
            />
            <TextArea
              label="Interests"
              value={interests}
              setValue={setInterests}
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
            disabled={saving || avatarUploading || coverUploading}
            className="mt-8 w-full rounded-full border border-[#f4d7a1]/50 bg-[#a9793d] px-8 py-5 text-sm font-bold uppercase tracking-[0.25em] text-white transition hover:bg-[#8d6432] disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Profile"}
          </button>

          {message && (
            <div className="mt-6 bg-[#f5f0e8] px-4 py-4 text-center">
              <p className="text-sm font-semibold text-stone-700">{message}</p>
            </div>
          )}
        </form>
      </section>
    </main>
  );
}

type FieldProps = {
  label: string;
  value: string;
  setValue: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
};

function Field({
  label,
  value,
  setValue,
  placeholder,
  type = "text",
  required = false,
}: FieldProps) {
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
        className="w-full border border-stone-300 bg-[#f8f4ed] px-5 py-4 outline-none transition focus:border-[#a9793d]"
        placeholder={placeholder}
      />
    </div>
  );
}

type TextAreaProps = {
  label: string;
  value: string;
  setValue: (value: string) => void;
  placeholder?: string;
  rows?: number;
};

function TextArea({
  label,
  value,
  setValue,
  placeholder,
  rows = 5,
}: TextAreaProps) {
  return (
    <div>
      <label className="mb-2 block text-sm font-bold uppercase tracking-[0.2em] text-stone-600">
        {label}
      </label>

      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={rows}
        className="w-full resize-none border border-stone-300 bg-[#f8f4ed] px-5 py-4 outline-none transition focus:border-[#a9793d]"
        placeholder={placeholder}
      />
    </div>
  );
}

type SelectFieldProps = {
  label: string;
  value: string;
  setValue: (value: string) => void;
  options: [string, string][];
};

function SelectField({ label, value, setValue, options }: SelectFieldProps) {
  return (
    <div>
      <label className="mb-2 block text-sm font-bold uppercase tracking-[0.2em] text-stone-600">
        {label}
      </label>

      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full border border-stone-300 bg-[#f8f4ed] px-5 py-4 outline-none transition focus:border-[#a9793d]"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue || optionLabel} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  );
}
