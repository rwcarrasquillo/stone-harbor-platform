"use client";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { serif, sans } from "@/lib/fonts";
import {
  Anchor as AnchorIcon,
  Book,
  Camera,
  ChevronLeft,
  ChevronRight,
  Edit as EditIcon,
  Eye,
  Image as ImageIcon,
  Lock,
  Message,
  Mountain,
  Settings,
  User as UserIcon,
  Wave,
  type IconProps,
} from "@/app/components/icons";

// Brand tokens
const GOLD = "#c4934e";
const GOLD_DEEP = "#a9793d";
const MOSS = "#586558";

type Pillar = "clarity" | "calm" | "strength";
type Storm =
  | "divorce"
  | "betrayal"
  | "burnout"
  | "loss"
  | "self"
  | "other"
  | null;
type Privacy = "private" | "members";

type PillarInfo = {
  value: Pillar;
  label: string;
  Icon: ComponentType<IconProps>;
  blurb: string;
  description: string;
  identity: string;
  accent: string;
};

const PILLARS: PillarInfo[] = [
  {
    value: "clarity",
    label: "Clarity",
    Icon: Eye,
    blurb: "Name the storm. Trust your perception again.",
    description:
      "You may still be questioning what happened. Start by naming patterns, separating facts from emotional noise, and rebuilding trust in your own perception.",
    identity: "Become the man who sees clearly.",
    accent: GOLD_DEEP,
  },
  {
    value: "calm",
    label: "Calm",
    Icon: Wave,
    blurb: "Steady your nervous system. Reclaim your peace.",
    description:
      "Your nervous system may be carrying prolonged stress. Begin with grounding, breath, rest, and emotional regulation.",
    identity: "Become the man who is unshakable.",
    accent: MOSS,
  },
  {
    value: "strength",
    label: "Strength",
    Icon: Mountain,
    blurb: "Rebuild discipline, boundaries, identity.",
    description:
      "You are ready to restore discipline, confidence, boundaries, and identity. The next step is rebuilding your life with structure.",
    identity: "Become the man who rebuilds.",
    accent: GOLD_DEEP,
  },
];

const STORMS: { value: Storm; label: string }[] = [
  { value: "divorce", label: "A divorce or separation" },
  { value: "betrayal", label: "A betrayal" },
  { value: "burnout", label: "Burnout" },
  { value: "loss", label: "Loss of someone close" },
  { value: "self", label: "Waking up not recognizing myself" },
  { value: "other", label: "Something else" },
];

const TOTAL_STEPS = 8;

// Step indices — keeping these named makes the wizard easier to re-order later.
const STEP_WELCOME = 0;
const STEP_STORM = 1;
const STEP_PILLAR = 2;
const STEP_PRIVACY = 3;
const STEP_IDENTITY = 4;
const STEP_BREATH = 5;
const STEP_TOUR = 6;
const STEP_READY = 7;

const stepTransition = {
  type: "tween" as const,
  ease: [0.32, 0.72, 0, 1] as [number, number, number, number],
  duration: 0.7,
};

export default function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pillar, setPillar] = useState<Pillar | null>(null);
  const [storm, setStorm] = useState<Storm>(null);
  const [privacy, setPrivacy] = useState<Privacy>("private");
  const [breathPhase, setBreathPhase] = useState<"inhale" | "exhale">("inhale");
  const [breathSeconds, setBreathSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Auth gate + load profile name for personalization
  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUserId(user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, full_name, avatar_url, cover_url")
        .eq("id", user.id)
        .single();
      const name =
        profile?.display_name?.split(" ")[0] ||
        profile?.full_name?.split(" ")[0] ||
        null;
      setFirstName(name);
      if (profile?.avatar_url) setAvatarUrl(profile.avatar_url);
      if (profile?.cover_url) setBannerUrl(profile.cover_url);
    }
    init();
  }, [router]);

  // Continuous 4s/4s breath cycle — used by welcome circle + breath step
  useEffect(() => {
    const id = setInterval(() => {
      setBreathPhase((p) => (p === "inhale" ? "exhale" : "inhale"));
    }, 4000);
    return () => clearInterval(id);
  }, []);

  // Breath step counter
  useEffect(() => {
    if (step !== STEP_BREATH) return;
    setBreathSeconds(0);
    const id = setInterval(() => {
      setBreathSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  function next() {
    if (step < TOTAL_STEPS - 1) setStep((s) => s + 1);
  }
  function prev() {
    if (step > 0) setStep((s) => s - 1);
  }
  async function skipAll() {
    // Honor the skip but still mark the wizard as seen so the dashboard
    // gate doesn't bounce them back here next visit.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("profiles")
        .update({ onboarding_completed_at: new Date().toISOString() })
        .eq("id", user.id);
    }
    router.push("/dashboard");
  }

  async function complete() {
    if (!pillar) return;
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }
    await supabase
      .from("profiles")
      .update({
        healing_stage: pillar,
        privacy_level: privacy,
        avatar_url: avatarUrl,
        cover_url: bannerUrl,
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    router.push("/dashboard");
  }

  // ── Storage upload helpers ─────────────────────────────────────────
  // Files are stored as {userId}/{kind}-{timestamp}.{ext} so storage RLS
  // (which checks the leading folder == auth.uid()) gates writes per user.
  async function uploadImage(
    bucket: "avatars" | "banners",
    file: File,
  ): Promise<string | null> {
    if (!userId) return null;
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${userId}/${bucket === "avatars" ? "avatar" : "banner"}-${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
    if (upErr) {
      setUploadError(upErr.message);
      return null;
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleAvatarChange(file: File) {
    setUploadError(null);
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("That image is over 5 MB. Try a smaller one.");
      return;
    }
    setUploadingAvatar(true);
    const url = await uploadImage("avatars", file);
    if (url) setAvatarUrl(url);
    setUploadingAvatar(false);
  }

  async function handleBannerChange(file: File) {
    setUploadError(null);
    if (file.size > 8 * 1024 * 1024) {
      setUploadError("That image is over 8 MB. Try a smaller one.");
      return;
    }
    setUploadingBanner(true);
    const url = await uploadImage("banners", file);
    if (url) setBannerUrl(url);
    setUploadingBanner(false);
  }

  return (
    <main
      className={`${sans.className} relative min-h-screen overflow-hidden bg-[#0A0A0B] text-white`}
    >
      {/* AMBIENT — base dark + drifting forest + dawn glow + contour + grain */}
      <div className="fixed inset-0 z-0 bg-[#0A0A0B]" />
      <motion.div
        animate={{
          scale: [1, 1.06, 1],
          x: ["0%", "-1%", "0%"],
          y: ["0%", "1%", "0%"],
        }}
        transition={{ duration: 32, repeat: Infinity, ease: "easeInOut" }}
        className="fixed inset-0 z-0 bg-cover bg-center opacity-30 grayscale"
        style={{ backgroundImage: "url('/forest-hero.png')" }}
      />
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-black/70 via-black/45 to-black/85" />
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 65% 45% at 50% 75%, rgba(196,147,78,0.22) 0%, rgba(196,147,78,0.08) 35%, transparent 70%)",
        }}
      />
      <svg
        className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-[0.04]"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern
            id="onb-contour"
            x="0"
            y="0"
            width="320"
            height="320"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0 60 Q 80 30 160 60 T 320 60"
              fill="none"
              stroke="white"
              strokeWidth="1"
            />
            <path
              d="M0 130 Q 80 100 160 130 T 320 130"
              fill="none"
              stroke="white"
              strokeWidth="1"
            />
            <path
              d="M0 200 Q 80 170 160 200 T 320 200"
              fill="none"
              stroke="white"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#onb-contour)" />
      </svg>
      <svg
        className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-[0.05] mix-blend-overlay"
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="onb-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#onb-grain)" />
      </svg>

      {/* Vertical edge guides — quiet brand cue */}
      <div className="pointer-events-none fixed left-8 top-0 z-10 h-full w-px bg-gradient-to-b from-transparent via-white/15 to-transparent" />
      <div className="pointer-events-none fixed right-8 top-0 z-10 h-full w-px bg-gradient-to-b from-transparent via-white/15 to-transparent" />

      {/* TOP BAR: brand mark + progress dots + skip */}
      <header className="fixed left-0 right-0 top-0 z-30 px-6 py-6 md:px-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex flex-col leading-none">
            <span className="text-base font-semibold uppercase tracking-[0.28em] text-[#c4934e]">
              Stone Harbor
            </span>
            <span className="mt-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[#c4934e]/70">
              Men&apos;s Mental Wellness
            </span>
          </div>

          {/* Progress dots */}
          <div className="hidden items-center gap-2 md:flex">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
              const state =
                i === step ? "active" : i < step ? "done" : "pending";
              return (
                <motion.span
                  key={i}
                  animate={{
                    width: state === "active" ? 28 : 6,
                    opacity:
                      state === "pending" ? 0.25 : state === "done" ? 0.55 : 1,
                  }}
                  transition={{ duration: 0.4 }}
                  className="h-[3px] rounded-full"
                  style={{ backgroundColor: GOLD }}
                />
              );
            })}
          </div>

          {step < TOTAL_STEPS - 1 ? (
            <button
              type="button"
              onClick={skipAll}
              className="text-xs font-bold uppercase tracking-[0.22em] text-white/50 transition hover:text-[#c4934e]"
            >
              Skip the tour
            </button>
          ) : (
            <span className="w-[100px]" />
          )}
        </div>
      </header>

      {/* CONTENT */}
      <section className="relative z-20 flex min-h-screen items-center justify-center px-6 pb-24 pt-32 md:px-10 md:pt-36">
        <AnimatePresence mode="wait">
          {step === STEP_WELCOME && (
            <WelcomeStep
              key="welcome"
              firstName={firstName}
              breathPhase={breathPhase}
              onContinue={next}
            />
          )}
          {step === STEP_STORM && (
            <StormStep
              key="storm"
              storm={storm}
              setStorm={setStorm}
              onContinue={next}
              onBack={prev}
            />
          )}
          {step === STEP_PILLAR && (
            <PillarStep
              key="pillar"
              pillar={pillar}
              setPillar={setPillar}
              onContinue={next}
              onBack={prev}
            />
          )}
          {step === STEP_PRIVACY && (
            <PrivacyStep
              key="privacy"
              privacy={privacy}
              setPrivacy={setPrivacy}
              onContinue={next}
              onBack={prev}
            />
          )}
          {step === STEP_IDENTITY && (
            <IdentityStep
              key="identity"
              firstName={firstName}
              avatarUrl={avatarUrl}
              bannerUrl={bannerUrl}
              uploadingAvatar={uploadingAvatar}
              uploadingBanner={uploadingBanner}
              uploadError={uploadError}
              onAvatarChange={handleAvatarChange}
              onBannerChange={handleBannerChange}
              onClearAvatar={() => setAvatarUrl(null)}
              onClearBanner={() => setBannerUrl(null)}
              onContinue={next}
              onBack={prev}
            />
          )}
          {step === STEP_BREATH && (
            <BreathStep
              key="breath"
              phase={breathPhase}
              seconds={breathSeconds}
              onContinue={next}
              onBack={prev}
            />
          )}
          {step === STEP_TOUR && (
            <TourStep key="tour" onContinue={next} onBack={prev} />
          )}
          {step === STEP_READY && (
            <ReadyStep
              key="ready"
              firstName={firstName}
              pillar={pillar}
              saving={saving}
              onComplete={complete}
              onBack={prev}
            />
          )}
        </AnimatePresence>
      </section>

      {/* QUIET 988 LINE — required on every authenticated screen.
          Kept small and bottom-fixed so it doesn't intrude on the wizard's
          immersive feel; visible enough to be a real lifeline. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-3 z-30 flex justify-center px-6">
        <p className="pointer-events-auto rounded-full border border-white/10 bg-black/45 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-white/70 backdrop-blur-md">
          In Crisis · Call or text <span className="text-[#c4934e]">988</span> ·
          24/7
        </p>
      </div>
    </main>
  );
}

/* ──────────────────────────────────────────────
   SHARED PRIMITIVES
   ────────────────────────────────────────────── */

function StepShell({
  children,
  width = "max-w-3xl",
}: {
  children: React.ReactNode;
  width?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -24 }}
      transition={stepTransition}
      className={`relative w-full ${width} text-center`}
    >
      {children}
    </motion.div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.1 }}
      className="text-xs font-bold uppercase tracking-[0.32em] text-[#c4934e]"
    >
      {children}
    </motion.p>
  );
}

function Headline({ children }: { children: React.ReactNode }) {
  return (
    <motion.h1
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.2 }}
      className={`${serif.className} mt-5 text-5xl font-medium leading-[1.05] text-white md:text-7xl lg:text-[5rem]`}
    >
      {children}
    </motion.h1>
  );
}

function Subhead({ children }: { children: React.ReactNode }) {
  return (
    <motion.p
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.4 }}
      className="mx-auto mt-7 max-w-xl text-base leading-relaxed text-white/75 md:text-lg"
    >
      {children}
    </motion.p>
  );
}

function PrimaryCTA({
  children,
  onClick,
  disabled = false,
  busy = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.6 }}
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      whileHover={!disabled && !busy ? { scale: 1.03 } : undefined}
      whileTap={!disabled && !busy ? { scale: 0.98 } : undefined}
      className="group relative inline-flex items-center justify-center gap-3 overflow-hidden border border-[#c4934e] bg-[#a9793d] px-10 py-5 text-sm font-bold uppercase tracking-[0.25em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_18px_40px_rgba(0,0,0,0.45)] transition disabled:cursor-not-allowed disabled:opacity-40"
    >
      {busy ? (
        <motion.span
          animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
          transition={{
            duration: 1.6,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="h-2 w-2 rounded-full bg-white"
        />
      ) : null}
      <span className="relative z-10">{children}</span>
      <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-white/60 transition-all duration-500 group-hover:w-full" />
    </motion.button>
  );
}

function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-white/40 transition hover:text-[#c4934e]"
    >
      <ChevronLeft size={12} />
      Back
    </button>
  );
}

/* ──────────────────────────────────────────────
   STEP 1 — WELCOME
   ────────────────────────────────────────────── */

function WelcomeStep({
  firstName,
  breathPhase,
  onContinue,
}: {
  firstName: string | null;
  breathPhase: "inhale" | "exhale";
  onContinue: () => void;
}) {
  return (
    <StepShell>
      {/* Breathing focal circle */}
      <motion.div
        animate={{
          scale: breathPhase === "inhale" ? 1.3 : 1,
          opacity: breathPhase === "inhale" ? 0.95 : 0.55,
        }}
        transition={{ duration: 4, ease: "easeInOut" }}
        className="mx-auto mb-12 flex h-40 w-40 items-center justify-center rounded-full border border-[#c4934e]/40"
        style={{
          background:
            "radial-gradient(circle, rgba(196,147,78,0.25) 0%, rgba(196,147,78,0.04) 70%, transparent 100%)",
        }}
      >
        <AnchorIcon size={36} strokeWidth={1.25} className="text-[#c4934e]" />
      </motion.div>

      <Eyebrow>Welcome{firstName ? `, ${firstName}` : ""}</Eyebrow>
      <Headline>The harbor is patient.</Headline>
      <Subhead>
        Take a minute to set up your space. Six small choices. We&apos;ll meet
        you wherever you are.
      </Subhead>

      <div className="mt-12">
        <PrimaryCTA onClick={onContinue}>Begin</PrimaryCTA>
      </div>
    </StepShell>
  );
}

/* ──────────────────────────────────────────────
   STEP 2 — STORM (pain mirror)
   ────────────────────────────────────────────── */

function StormStep({
  storm,
  setStorm,
  onContinue,
  onBack,
}: {
  storm: Storm;
  setStorm: (s: Storm) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <StepShell>
      <Eyebrow>The storm</Eyebrow>
      <Headline>What brought you here?</Headline>
      <Subhead>
        Pick one if it fits. Otherwise skip — you don&apos;t owe us a story.
      </Subhead>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.5 }}
        className="mt-12 grid gap-3 sm:grid-cols-2"
      >
        {STORMS.map((s) => {
          const active = storm === s.value;
          return (
            <button
              key={s.value ?? "x"}
              type="button"
              onClick={() => setStorm(s.value)}
              className="group relative overflow-hidden border bg-black/30 px-6 py-5 text-left text-sm font-semibold uppercase tracking-[0.18em] text-white/85 transition hover:bg-black/45"
              style={{
                borderColor: active ? GOLD : "rgba(255,255,255,0.15)",
                boxShadow: active ? `inset 0 0 0 1px ${GOLD}` : undefined,
                color: active ? GOLD : undefined,
              }}
            >
              {s.label}
              {active && (
                <span
                  className="absolute inset-y-0 left-0 w-[3px]"
                  style={{ backgroundColor: GOLD }}
                />
              )}
            </button>
          );
        })}
      </motion.div>

      <div className="mt-12 flex flex-col items-center gap-4">
        <PrimaryCTA onClick={onContinue}>Continue</PrimaryCTA>
        <BackLink onBack={onBack} />
      </div>
    </StepShell>
  );
}

/* ──────────────────────────────────────────────
   STEP 3 — PILLAR (sets healing_stage)
   ────────────────────────────────────────────── */

function PillarStep({
  pillar,
  setPillar,
  onContinue,
  onBack,
}: {
  pillar: Pillar | null;
  setPillar: (p: Pillar) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <StepShell width="max-w-5xl">
      <Eyebrow>Your path</Eyebrow>
      <Headline>Where do you start?</Headline>
      <Subhead>
        Three paths. Choose the one closest to where you are right now. You can
        change it any time.
      </Subhead>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.5 }}
        className="mt-12 grid gap-5 md:grid-cols-3"
      >
        {PILLARS.map((p, idx) => {
          const active = pillar === p.value;
          return (
            <motion.button
              key={p.value}
              type="button"
              onClick={() => setPillar(p.value)}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 + idx * 0.1 }}
              whileHover={{ y: -4 }}
              className="group relative flex flex-col items-start overflow-hidden border bg-black/30 p-7 text-left transition"
              style={{
                borderColor: active ? p.accent : "rgba(255,255,255,0.12)",
                boxShadow: active
                  ? `inset 0 0 0 1px ${p.accent}, 0 20px 60px rgba(0,0,0,0.45)`
                  : "0 10px 35px rgba(0,0,0,0.3)",
                backgroundColor: active ? "rgba(196,147,78,0.06)" : undefined,
              }}
            >
              <p.Icon
                size={32}
                strokeWidth={1.4}
                style={{ color: p.accent }}
                className="mb-5"
              />
              <h3
                className={`${serif.className} text-3xl font-medium leading-tight text-white`}
              >
                {p.label}
              </h3>
              <p
                className="mt-2 text-xs font-bold uppercase tracking-[0.22em]"
                style={{ color: p.accent }}
              >
                {p.identity}
              </p>
              <p className="mt-4 text-sm leading-relaxed text-white/70">
                {p.description}
              </p>
              {active && (
                <motion.div
                  layoutId="pillar-active"
                  className="absolute bottom-0 left-0 h-[3px] w-full"
                  style={{ backgroundColor: p.accent }}
                />
              )}
            </motion.button>
          );
        })}
      </motion.div>

      <div className="mt-12 flex flex-col items-center gap-4">
        <PrimaryCTA onClick={onContinue} disabled={!pillar}>
          {pillar
            ? `Continue as ${PILLARS.find((p) => p.value === pillar)?.label}`
            : "Choose a path"}
        </PrimaryCTA>
        <BackLink onBack={onBack} />
      </div>
    </StepShell>
  );
}

/* ──────────────────────────────────────────────
   STEP 4 — PRIVACY
   ────────────────────────────────────────────── */

function PrivacyStep({
  privacy,
  setPrivacy,
  onContinue,
  onBack,
}: {
  privacy: Privacy;
  setPrivacy: (p: Privacy) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const options: {
    value: Privacy;
    label: string;
    description: string;
    Icon: ComponentType<IconProps>;
  }[] = [
    {
      value: "private",
      label: "Strictly private",
      description:
        "Your journal stays private no matter what. You can still message other members directly.",
      Icon: Lock,
    },
    {
      value: "members",
      label: "Members can see what I post",
      description:
        "Your journal is still private — but anything you post to the timeline is visible to other Stone Harbor members.",
      Icon: AnchorIcon,
    },
  ];

  return (
    <StepShell width="max-w-4xl">
      <Eyebrow>Your space</Eyebrow>
      <Headline>Your space is yours.</Headline>
      <Subhead>
        Your journal is always private — only you can read it. Choose how public
        your other activity feels.
      </Subhead>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.5 }}
        className="mt-12 grid gap-5 md:grid-cols-2"
      >
        {options.map((opt, idx) => {
          const active = privacy === opt.value;
          return (
            <motion.button
              key={opt.value}
              type="button"
              onClick={() => setPrivacy(opt.value)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 + idx * 0.1 }}
              className="group relative flex flex-col items-start overflow-hidden border bg-black/30 p-7 text-left transition"
              style={{
                borderColor: active ? GOLD : "rgba(255,255,255,0.12)",
                boxShadow: active
                  ? `inset 0 0 0 1px ${GOLD}, 0 18px 50px rgba(0,0,0,0.4)`
                  : "0 10px 30px rgba(0,0,0,0.3)",
              }}
            >
              <opt.Icon
                size={26}
                strokeWidth={1.4}
                style={{ color: active ? GOLD : "rgba(255,255,255,0.5)" }}
                className="mb-5"
              />
              <h3
                className={`${serif.className} text-3xl font-medium text-white`}
              >
                {opt.label}
              </h3>
              <p className="mt-4 text-sm leading-relaxed text-white/70">
                {opt.description}
              </p>
            </motion.button>
          );
        })}
      </motion.div>

      <div className="mt-12 flex flex-col items-center gap-4">
        <PrimaryCTA onClick={onContinue}>Continue</PrimaryCTA>
        <BackLink onBack={onBack} />
      </div>
    </StepShell>
  );
}

/* ──────────────────────────────────────────────
   STEP 5 — BREATH (60-second ritual)
   ────────────────────────────────────────────── */

function BreathStep({
  phase,
  seconds,
  onContinue,
  onBack,
}: {
  phase: "inhale" | "exhale";
  seconds: number;
  onContinue: () => void;
  onBack: () => void;
}) {
  const target = 60;
  const done = seconds >= target;
  const remaining = Math.max(0, target - seconds);

  return (
    <StepShell>
      <Eyebrow>Your first ritual</Eyebrow>
      <Headline>Take sixty seconds.</Headline>
      <Subhead>
        Four seconds in. Four seconds out. We&apos;ll let you know when the
        minute is up.
      </Subhead>

      {/* Breathing focal circle */}
      <motion.div
        animate={{
          scale: phase === "inhale" ? 1.4 : 1,
          opacity: phase === "inhale" ? 0.98 : 0.55,
        }}
        transition={{ duration: 4, ease: "easeInOut" }}
        className="mx-auto mt-14 flex h-52 w-52 items-center justify-center rounded-full border border-[#c4934e]/40"
        style={{
          background:
            "radial-gradient(circle, rgba(196,147,78,0.28) 0%, rgba(196,147,78,0.06) 70%, transparent 100%)",
        }}
      >
        <span className={`${serif.className} text-3xl italic text-white/95`}>
          {phase === "inhale" ? "Inhale" : "Exhale"}
        </span>
      </motion.div>

      <p className="mt-8 text-xs font-bold uppercase tracking-[0.32em] text-white/40">
        {done ? "Sixty seconds. Well done." : `${remaining}s remaining`}
      </p>

      <div className="mt-12 flex flex-col items-center gap-4">
        <PrimaryCTA onClick={onContinue}>
          {done ? "Continue" : "Skip the breath"}
        </PrimaryCTA>
        <BackLink onBack={onBack} />
      </div>
    </StepShell>
  );
}

/* ──────────────────────────────────────────────
   STEP 6 — TOUR (the four daily moves)
   ────────────────────────────────────────────── */

function TourStep({
  onContinue,
  onBack,
}: {
  onContinue: () => void;
  onBack: () => void;
}) {
  const moves = [
    {
      Icon: EditIcon,
      label: "Reflect",
      blurb: "Write what you cannot carry alone. Your journal is yours alone.",
    },
    {
      Icon: Message,
      label: "Connect",
      blurb:
        "Reach out to another member when you're ready. One conversation is enough.",
    },
    {
      Icon: Book,
      label: "Read",
      blurb:
        "Curated reflections — Stone Harbor originals plus trusted sources.",
    },
    {
      Icon: Settings,
      label: "Refine",
      blurb: "Tend your identity. Update what changes. Keep what's yours.",
    },
  ];

  return (
    <StepShell width="max-w-5xl">
      <Eyebrow>Four small moves</Eyebrow>
      <Headline>This is the daily practice.</Headline>
      <Subhead>
        The harbor is built around these four. Do as many or as few as you like.
        Coming back is the practice.
      </Subhead>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.5 }}
        className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4"
      >
        {moves.map((m, idx) => (
          <motion.div
            key={m.label}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 + idx * 0.12 }}
            className="border bg-black/30 p-7 text-left shadow-[0_18px_55px_rgba(0,0,0,0.4)]"
            style={{ borderColor: "rgba(196,147,78,0.4)" }}
          >
            <m.Icon
              size={28}
              strokeWidth={1.4}
              style={{ color: GOLD }}
              className="mb-5"
            />
            <h3
              className={`${serif.className} text-3xl font-medium text-white`}
            >
              {m.label}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-white/70">
              {m.blurb}
            </p>
          </motion.div>
        ))}
      </motion.div>

      <div className="mt-12 flex flex-col items-center gap-4">
        <PrimaryCTA onClick={onContinue}>Continue</PrimaryCTA>
        <BackLink onBack={onBack} />
      </div>
    </StepShell>
  );
}

/* ──────────────────────────────────────────────
   STEP 7 — READY
   ────────────────────────────────────────────── */

function ReadyStep({
  firstName,
  pillar,
  saving,
  onComplete,
  onBack,
}: {
  firstName: string | null;
  pillar: Pillar | null;
  saving: boolean;
  onComplete: () => void;
  onBack: () => void;
}) {
  const pillarMeta = PILLARS.find((p) => p.value === pillar);

  return (
    <StepShell>
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, delay: 0.2 }}
        className="mx-auto mb-12 flex h-36 w-36 items-center justify-center rounded-full border border-[#c4934e]/40"
        style={{
          background:
            "radial-gradient(circle, rgba(196,147,78,0.3) 0%, rgba(196,147,78,0.05) 70%, transparent 100%)",
        }}
      >
        {pillarMeta ? (
          <pillarMeta.Icon
            size={42}
            strokeWidth={1.3}
            style={{ color: pillarMeta.accent }}
          />
        ) : (
          <AnchorIcon size={42} strokeWidth={1.3} className="text-[#c4934e]" />
        )}
      </motion.div>

      <Eyebrow>You&apos;re ready</Eyebrow>
      <Headline>Welcome{firstName ? `, ${firstName}` : ""}.</Headline>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.5 }}
        className={`${serif.className} mx-auto mt-7 max-w-lg text-2xl italic text-[#c4934e] md:text-3xl`}
      >
        {pillarMeta?.identity ?? "The harbor is patient."}
      </motion.p>

      <Subhead>
        Your space is ready. Come back as often as you need.{" "}
        {pillarMeta && (
          <>
            Your first stop:{" "}
            <span className={`${serif.className} italic`}>
              {pillarMeta.blurb}
            </span>
          </>
        )}
      </Subhead>

      <div className="mt-12 flex flex-col items-center gap-4">
        <PrimaryCTA onClick={onComplete} disabled={!pillar} busy={saving}>
          {saving ? "Saving…" : "Open Your Dashboard"}
        </PrimaryCTA>
        <BackLink onBack={onBack} />
      </div>
    </StepShell>
  );
}

/* ──────────────────────────────────────────────
   IDENTITY STEP — Optional profile photo + banner
   ────────────────────────────────────────────── */

function IdentityStep({
  firstName,
  avatarUrl,
  bannerUrl,
  uploadingAvatar,
  uploadingBanner,
  uploadError,
  onAvatarChange,
  onBannerChange,
  onClearAvatar,
  onClearBanner,
  onContinue,
  onBack,
}: {
  firstName: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  uploadingAvatar: boolean;
  uploadingBanner: boolean;
  uploadError: string | null;
  onAvatarChange: (f: File) => void;
  onBannerChange: (f: File) => void;
  onClearAvatar: () => void;
  onClearBanner: () => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <StepShell>
      <Eyebrow>Optional</Eyebrow>
      <Headline>
        How will the men of Stone Harbor{" "}
        <span className={`${serif.className} italic text-[#c4934e]`}>
          recognize you?
        </span>
      </Headline>
      <Subhead>
        Add a face and a banner — or don&apos;t. Many men start anonymous and
        add these later. There is no rush, and no judgment.
      </Subhead>

      {/* Live preview card — banner + avatar composition */}
      <div className="mx-auto mt-10 w-full max-w-xl">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-sm">
          {/* Banner area */}
          <div className="relative h-32 w-full overflow-hidden md:h-40">
            {bannerUrl ? (
              <img
                src={bannerUrl}
                alt="Your banner"
                className="h-full w-full object-cover"
              />
            ) : (
              <div
                className="h-full w-full"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(88,101,88,0.45) 0%, rgba(196,147,78,0.30) 100%)",
                }}
              />
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

            {/* Banner controls */}
            <div className="absolute right-3 top-3 flex gap-2">
              <UploadButton
                label={bannerUrl ? "Replace banner" : "Add banner"}
                busy={uploadingBanner}
                onFile={onBannerChange}
                icon={<ImageIcon size={14} />}
              />
              {bannerUrl && (
                <button
                  onClick={onClearBanner}
                  className="rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-medium text-white/85 backdrop-blur transition hover:bg-black/75"
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          {/* Avatar + name row */}
          <div className="relative flex items-end gap-4 px-6 pb-6 pt-2">
            <div className="-mt-10 shrink-0">
              <div className="relative h-20 w-20 overflow-hidden rounded-full border-2 border-[#0A0A0B] bg-[#1a1a1c] shadow-lg md:h-24 md:w-24">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Your avatar"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[#c4934e]/60">
                    <UserIcon size={36} strokeWidth={1.4} />
                  </div>
                )}
              </div>
            </div>
            <div className="flex-1 pb-1">
              <div
                className={`${serif.className} text-xl text-white md:text-2xl`}
              >
                {firstName || "Brother"}
              </div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/45">
                Stone Harbor member
              </div>
            </div>
          </div>
        </div>

        {/* Avatar action row, below the preview card */}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <UploadButton
            label={avatarUrl ? "Replace photo" : "Add profile photo"}
            busy={uploadingAvatar}
            onFile={onAvatarChange}
            icon={<Camera size={14} />}
            prominent
          />
          {avatarUrl && (
            <button
              onClick={onClearAvatar}
              className="rounded-full border border-white/15 bg-white/[0.03] px-4 py-2 text-xs font-medium text-white/75 transition hover:bg-white/[0.07]"
            >
              Remove photo
            </button>
          )}
        </div>

        {uploadError && (
          <p className="mt-4 text-center text-xs text-red-400/90">
            {uploadError}
          </p>
        )}

        <p className="mt-6 text-center text-[11px] uppercase tracking-[0.18em] text-white/35">
          You can change either of these any time from your profile.
        </p>
      </div>

      <div className="mt-10 flex flex-col items-center gap-4">
        <PrimaryCTA onClick={onContinue}>
          {avatarUrl || bannerUrl ? "Continue" : "Skip for now"}
        </PrimaryCTA>
        <BackLink onBack={onBack} />
      </div>
    </StepShell>
  );
}

/**
 * UploadButton — wraps a hidden <input type="file"> in a styled button.
 * Used by IdentityStep for both avatar and banner uploads.
 */
function UploadButton({
  label,
  busy,
  onFile,
  icon,
  prominent = false,
}: {
  label: string;
  busy: boolean;
  onFile: (f: File) => void;
  icon?: React.ReactNode;
  prominent?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const base = prominent
    ? "inline-flex items-center gap-2 rounded-full bg-[#c4934e] px-5 py-2.5 text-sm font-semibold text-[#0A0A0B] shadow-lg transition hover:bg-[#d4a563] disabled:opacity-60"
    : "inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-medium text-white/85 backdrop-blur transition hover:bg-black/75 disabled:opacity-60";
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          // Reset so the same file can be re-selected after a clear.
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className={base}
      >
        {icon}
        {busy ? "Uploading…" : label}
      </button>
    </>
  );
}
