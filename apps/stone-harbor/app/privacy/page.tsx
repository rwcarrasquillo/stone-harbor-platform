"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";

import { serif, sans } from "@/lib/fonts";
const GOLD_DEEP = "#a9793d";

/**
 * Stone Harbor — Privacy Policy
 *
 * Source of truth: PRIVACY_POLICY.md (for attorney review & archive)
 * This page renders the v1 content for end users.
 *
 * When updating: also bump app_settings.current_privacy_version so the
 * dashboard re-prompts existing members for acceptance.
 */
export default function PrivacyPage() {
  const [version, setVersion] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    async function loadVersion() {
      const { data } = await supabase
        .from("app_settings")
        .select("current_privacy_version, privacy_last_updated")
        .eq("id", 1)
        .single();
      setVersion(data?.current_privacy_version ?? 1);
      setLastUpdated(data?.privacy_last_updated ?? null);
    }
    loadVersion();
  }, []);

  return (
    <main
      className={`${sans.className} min-h-screen bg-[#f3efe7] text-stone-900`}
    >
      <header className="border-b border-stone-200 bg-white/40 px-6 py-5 backdrop-blur-sm md:px-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/" className="flex flex-col leading-none no-underline">
            <span className="text-base font-bold uppercase tracking-[0.28em] text-[#a9793d]">
              ← Stone Harbor
            </span>
            <span className="mt-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[#a9793d]/70">
              Men&apos;s Mental Wellness
            </span>
          </Link>
          <Link
            href="/terms"
            className="text-xs font-bold uppercase tracking-[0.22em] text-stone-600 transition hover:text-[#a9793d]"
          >
            Terms →
          </Link>
        </div>
      </header>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mx-auto max-w-3xl px-6 py-16 md:px-8"
      >
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#a9793d]">
          What We Do With Your Words
        </p>
        <h1
          className={`${serif.className} mt-4 text-5xl font-medium leading-tight md:text-7xl`}
        >
          Privacy Policy.
        </h1>
        <div className="mt-6 flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.22em] text-stone-500">
          <span>Version {version ?? "—"}</span>
          <span>·</span>
          <span>
            Last Updated{" "}
            {lastUpdated
              ? new Date(lastUpdated).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })
              : "—"}
          </span>
        </div>
        <p className="mt-8 max-w-2xl text-base leading-relaxed text-stone-600">
          Stone Harbor exists because men in difficult seasons deserve a
          private, respectful space.{" "}
          <strong className="text-stone-900">
            What you write here belongs to you.
          </strong>{" "}
          This policy explains, in plain language, what data we collect, why we
          collect it, how we use it, who we share it with (almost no one), and
          the rights you have over it.
        </p>
      </motion.section>

      <section className="mx-auto max-w-3xl border-y border-stone-200 bg-white/40 px-6 py-8 backdrop-blur-sm md:px-8">
        <p className="mb-5 text-[10px] font-bold uppercase tracking-[0.3em] text-stone-500">
          Contents
        </p>
        <ol className="grid gap-2 text-sm text-stone-700 sm:grid-cols-2">
          {TOC.map((item, i) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="transition hover:text-[#a9793d]"
              >
                <span className="font-bold text-stone-500">
                  {String(i + 1).padStart(2, "0")}.
                </span>{" "}
                {item.label}
              </a>
            </li>
          ))}
        </ol>
      </section>

      <article className="mx-auto max-w-3xl px-6 py-16 md:px-8">
        <Section id="commitment" n={1} title="Our Commitment">
          <P>
            Stone Harbor exists because men in difficult seasons deserve a
            private, respectful space. What you write here belongs to you. This
            policy explains, in plain language, what data we collect, why we
            collect it, how we use it, who we share it with (almost no one), and
            the rights you have over it.
          </P>
        </Section>

        <Section id="who" n={2} title="Who We Are">
          <P>
            Stone Harbor is operated by Stone Harbor. We are the data controller
            responsible for the personal information described in this policy.
          </P>
        </Section>

        <Section id="collect" n={3} title="What We Collect">
          <H3>Account information</H3>
          <P>When you create an account, we collect:</P>
          <Ul>
            <li>
              Your email address and password (hashed and salted, never stored
              in plain text).
            </li>
            <li>Your display name and (optionally) a username.</li>
            <li>
              Your gender attestation (you affirm at signup that you identify as
              a man).
            </li>
            <li>
              The terms version you accepted, the date, the IP address, and the
              user-agent string of the device.
            </li>
          </Ul>
          <H3>Profile information</H3>
          <P>If you choose to fill in your profile, we may collect:</P>
          <Ul>
            <li>A profile photo and banner photo.</li>
            <li>
              A bio, location, hometown, work, education, relationship status,
              website, languages, interests, and a favorite quote — all
              optional.
            </li>
            <li>
              An optional birthday (month and day stored; year separately
              optional). Used only for the quiet acknowledgment tile —{" "}
              <B>never to surface your age to other members.</B>
            </li>
            <li>
              Your healing stage (Clarity, Calm, or Strength) and privacy
              preference.
            </li>
          </Ul>
          <H3>Content you create</H3>
          <Ul>
            <li>
              <B>Journal entries</B> (treated as strictly private — see Section
              5),
            </li>
            <li>Member posts and comments in the brotherhood feed,</li>
            <li>Direct messages between you and other members (private),</li>
            <li>Mood logs and roadmap progress markers.</li>
          </Ul>
          <H3>Technical and usage information</H3>
          <Ul>
            <li>Your IP address, device type, operating system, browser.</li>
            <li>Request logs, authentication events, performance metrics.</li>
          </Ul>
          <H3>Cookies and similar technologies</H3>
          <P>
            Stone Harbor uses a small number of cookies and local-storage items
            that are essential to the Service (an authentication cookie and a
            session token managed by Supabase Auth). We do not use third-party
            advertising cookies, behavioral tracking, or cross-site tracking.
          </P>
          <H3>What we do NOT collect</H3>
          <Callout tone="brand">
            <P>We do not collect:</P>
            <Ul>
              <li>
                Your Social Security number or government identification (except
                via Stripe Identity at the moment of high-trust verification, if
                and when you opt in for coaching),
              </li>
              <li>
                Your bank account number or credit card number (Stripe handles
                all payment data; we never see your card),
              </li>
              <li>Health records from external providers,</li>
              <li>Behavioral tracking for advertising,</li>
              <li>Facial recognition data,</li>
              <li>Voice recordings without your knowledge.</li>
            </Ul>
          </Callout>
        </Section>

        <Section id="use" n={4} title="How We Use Your Information">
          <P>We use the data above only to:</P>
          <Ul>
            <li>Provide the Service.</li>
            <li>Authenticate you and keep your account secure.</li>
            <li>
              Send service emails — account confirmation, password reset, terms
              updates, billing receipts, security alerts.
            </li>
            <li>
              Personalize content (daily reflection by pillar, acknowledgment by
              date).
            </li>
            <li>Investigate reported Terms violations.</li>
            <li>Operate the moderation system.</li>
            <li>
              Improve the Service through aggregate, non-identifying analytics.
            </li>
            <li>Comply with legal obligations.</li>
          </Ul>
          <H3>What we do NOT use your data for</H3>
          <Callout tone="brand">
            <Ul>
              <li>
                We do <B>not sell</B> your personal information to anyone, ever.
              </li>
              <li>
                We do <B>not share</B> your personal information with
                advertisers or data brokers.
              </li>
              <li>
                We do <B>not use</B> your journal entries, messages, or private
                content to <B>train artificial intelligence models</B> (our own
                or anyone else&rsquo;s).
              </li>
              <li>
                We do <B>not analyze</B> the emotional content of your journal
                entries for product purposes.
              </li>
            </Ul>
          </Callout>
        </Section>

        <Section id="journal" n={5} title="Journal Entries and Direct Messages">
          <P>
            This is the most sensitive content in Stone Harbor, and we treat it
            as such.
          </P>
          <Callout tone="brand">
            <H3>Your journal is yours</H3>
            <P>
              Your journal entries are <B>private to you</B>. No other member,
              no coach, no admin, and no Stone Harbor employee reads them in the
              ordinary course of operating the Service.
            </P>
            <H3>Direct messages are private to the participants</H3>
            <P>
              Direct messages between you and another member are visible to the
              participants in that conversation. No other member sees them.
            </P>
          </Callout>
          <H3>When Stone Harbor may access private content</H3>
          <P>We may access your journal entries or direct messages only:</P>
          <Ul>
            <li>
              When required by law (valid court order, subpoena, or warrant),
            </li>
            <li>
              When necessary to prevent imminent harm to you or another person,
            </li>
            <li>
              When necessary to investigate a serious Terms violation that has
              been formally reported, and only the specific content reasonably
              relevant,
            </li>
            <li>When you explicitly request it (e.g., technical support).</li>
          </Ul>
          <H3>Encryption</H3>
          <P>
            All journal entries, messages, and other user content are stored in
            an encrypted database (Supabase, AES-256 at rest). Connections to
            the Service are protected by TLS 1.2 or higher.
          </P>
        </Section>

        <Section id="share" n={6} title="Who We Share Information With">
          <H3>Service providers (subprocessors)</H3>
          <P>
            These third parties process data on our behalf, under contractual
            data protection obligations:
          </P>
          <div className="my-3 overflow-hidden border border-stone-200">
            <table className="w-full text-sm">
              <thead className="bg-stone-100 text-[11px] uppercase tracking-[0.18em] text-stone-500">
                <tr>
                  <th className="px-4 py-2 text-left">Provider</th>
                  <th className="px-4 py-2 text-left">Purpose</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                <SubprocRow
                  name="Supabase"
                  purpose="Database, authentication, storage"
                />
                <SubprocRow name="Vercel" purpose="Application hosting" />
                <SubprocRow
                  name="Anthropic / OpenAI"
                  purpose="AI-assisted content generation (never your private journal)"
                />
                <SubprocRow
                  name="Stripe (planned)"
                  purpose="Payment processing for coaching"
                />
                <SubprocRow
                  name="Resend / Postmark (planned)"
                  purpose="Transactional email"
                />
              </tbody>
            </table>
          </div>
          <H3>Other members</H3>
          <P>
            Information that is public by your settings (profile fields, posts,
            comments) is visible to other members. Private content (journal,
            messages, mood data, birthday) is never shared with other members.
          </P>
          <H3>Legal and safety circumstances</H3>
          <P>
            We may disclose personal information when we reasonably believe it
            is necessary to comply with law, enforce our Terms, protect safety,
            or detect fraud.
          </P>
          <H3>Business transfers</H3>
          <P>
            If Stone Harbor is acquired, merged, or sells substantially all of
            its assets, your information may be transferred to the acquiring
            entity, subject to the protections of this policy.
          </P>
        </Section>

        <Section id="location" n={7} title="Where Your Information Is Stored">
          <P>
            Stone Harbor&rsquo;s primary data infrastructure (Supabase, Vercel)
            is hosted in the United States. If you are located outside the
            United States, your information will be transferred to and processed
            in the United States.
          </P>
        </Section>

        <Section id="retention" n={8} title="How Long We Keep Your Information">
          <P>
            We keep your information for as long as your account is active. When
            you close your account:
          </P>
          <Ul>
            <li>
              Your profile is marked closed and public content is removed from
              public view immediately.
            </li>
            <li>
              Your private journal entries are deleted within <B>30 days</B>.
            </li>
            <li>
              Your direct messages are deleted within <B>30 days</B>, except
              where the other party has retained their conversation history.
            </li>
            <li>
              Other personal data is deleted or anonymized within <B>90 days</B>
              , except where retention is required by law.
            </li>
          </Ul>
          <P>
            <B>Terms acceptance records</B> are retained indefinitely as part of
            an immutable audit log.
          </P>
        </Section>

        <Section id="rights" n={9} title="Your Rights">
          <Ul>
            <li>
              <B>Access.</B> Request a copy of the personal information we hold
              about you.
            </li>
            <li>
              <B>Correction.</B> Update most information directly from your
              profile settings.
            </li>
            <li>
              <B>Deletion.</B> Close your account from profile settings, or
              request deletion of specific pieces of content.
            </li>
            <li>
              <B>Export.</B> Request a machine-readable export of your data;
              we&rsquo;ll provide within 30 days.
            </li>
            <li>
              <B>Objection and restriction</B> on certain processing of your
              data.
            </li>
            <li>
              <B>Withdrawing consent</B> at any time by updating your settings.
            </li>
            <li>
              <B>Complaints.</B> Contact us first; you may also file with a data
              protection authority in your jurisdiction.
            </li>
          </Ul>
        </Section>

        <Section id="state" n={10} title="State and Region-Specific Rights">
          <H3>California (CCPA / CPRA)</H3>
          <P>
            California residents have additional rights, including the right to
            know, the right to delete, the right to correct, the right to opt
            out of &ldquo;sales&rdquo; (we do not sell), and the right to limit
            the use of sensitive personal information.
          </P>
          <H3>Other US states</H3>
          <P>
            Residents of Virginia, Colorado, Connecticut, Utah, and other states
            with comparable laws have similar rights to access, delete, and
            correct personal information.
          </P>
        </Section>

        <Section id="children" n={11} title="Children's Privacy">
          <P>
            Stone Harbor is <B>not directed to anyone under 18 years of age</B>,
            and we do not knowingly collect personal information from minors. If
            we learn that we have inadvertently collected information from a
            minor, we will delete it as soon as practicable.
          </P>
        </Section>

        <Section id="security" n={12} title="Security">
          <Ul>
            <li>Encryption at rest (Supabase, AES-256).</li>
            <li>Encryption in transit (TLS 1.2+).</li>
            <li>Row-level security policies on every database table.</li>
            <li>Hashed and salted passwords.</li>
            <li>Limited access to production systems.</li>
            <li>Audit logging of administrative actions.</li>
            <li>
              Vetted third-party providers with their own security
              certifications.
            </li>
          </Ul>
          <P>
            No system is perfectly secure. If you suspect your account has been
            compromised, contact us immediately.
          </P>
        </Section>

        <Section id="crisis" n={13} title="Crisis-Related Disclosures">
          <Callout tone="critical">
            <Ul>
              <li>
                The 988 footer and crisis resources we display are direct
                contacts you initiate.{" "}
                <B>Stone Harbor does not transmit your data to 988</B> or any
                other crisis service.
              </li>
              <li>
                If a Stone Harbor admin, moderator, or coach{" "}
                <B>becomes aware of an imminent threat</B> to your life or
                another person&rsquo;s life, we may, in our reasonable judgment,
                contact emergency services and provide the minimum information
                necessary to facilitate a welfare check.
              </li>
              <li>
                Stone Harbor does not have a clinical duty of care, but we have
                an ethical commitment to act when we reasonably believe a life
                is in imminent danger.
              </li>
            </Ul>
          </Callout>
        </Section>

        <Section id="changes" n={14} title="Changes to This Policy">
          <P>
            When we make material changes, we will update the &ldquo;Last
            Updated&rdquo; date, increment the privacy version, and notify
            members via email and via an in-app prompt requiring re-acceptance.
          </P>
        </Section>

        <Section id="contact" n={15} title="Contact">
          <P>
            For privacy questions, requests, or complaints, contact the Stone
            Harbor team. The contact email is published on the Stone Harbor
            support page when available.
          </P>
        </Section>

        <Callout tone="brand">
          <P className={`${serif.className} text-xl italic`}>
            Stone Harbor is a place where men in pain are asked to be honest
            about hard things. That honesty depends on trust, and trust depends
            on knowing what happens to your words after you write them.
          </P>
        </Callout>
      </article>

      <footer className="border-t border-stone-200 bg-[#efe8dc]/70 px-6 py-10 backdrop-blur-sm">
        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3 md:items-center">
          <div>
            <p className="text-base font-bold uppercase tracking-[0.28em] text-[#a9793d]">
              Stone Harbor
            </p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#a9793d]/70">
              Men&apos;s Mental Wellness
            </p>
          </div>
          <p
            className={`${serif.className} text-center text-base italic text-stone-600`}
          >
            The harbor is patient.
          </p>
          <p className="text-right text-sm leading-relaxed text-stone-700">
            <span className="block text-[10px] font-bold uppercase tracking-[0.3em] text-stone-500">
              If You Are In Crisis
            </span>
            <span className="mt-1 block">
              Call or text{" "}
              <span className="font-bold" style={{ color: GOLD_DEEP }}>
                988
              </span>{" "}
              — 24/7. Free. Confidential.
            </span>
          </p>
        </div>
      </footer>
    </main>
  );
}

const TOC = [
  { id: "commitment", label: "Our Commitment" },
  { id: "who", label: "Who We Are" },
  { id: "collect", label: "What We Collect" },
  { id: "use", label: "How We Use Your Information" },
  { id: "journal", label: "Journal Entries and Direct Messages" },
  { id: "share", label: "Who We Share With" },
  { id: "location", label: "Where Information Is Stored" },
  { id: "retention", label: "How Long We Keep It" },
  { id: "rights", label: "Your Rights" },
  { id: "state", label: "State-Specific Rights" },
  { id: "children", label: "Children's Privacy" },
  { id: "security", label: "Security" },
  { id: "crisis", label: "Crisis-Related Disclosures" },
  { id: "changes", label: "Changes to This Policy" },
  { id: "contact", label: "Contact" },
];

function Section({
  id,
  n,
  title,
  children,
}: {
  id: string;
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-14 scroll-mt-24">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.3em] text-[#a9793d]">
        Section {String(n).padStart(2, "0")}
      </p>
      <h2
        className={`${serif.className} mb-6 text-3xl font-medium leading-tight md:text-4xl`}
      >
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-6 text-xs font-bold uppercase tracking-[0.22em] text-stone-500">
      {children}
    </h3>
  );
}

function P({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={`text-base leading-relaxed text-stone-700 ${className}`}>
      {children}
    </p>
  );
}

function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-stone-900">{children}</strong>;
}

function Ul({ children }: { children: React.ReactNode }) {
  return (
    <ul className="ml-5 list-disc space-y-2 text-base leading-relaxed text-stone-700">
      {children}
    </ul>
  );
}

function Callout({
  tone,
  children,
}: {
  tone: "warning" | "critical" | "brand";
  children: React.ReactNode;
}) {
  const styles =
    tone === "critical"
      ? "border-[#b14a3a] bg-[#fcefe9]"
      : tone === "warning"
        ? "border-stone-400 bg-stone-100"
        : "border-[#a9793d] bg-[#f8f0e3]";
  return (
    <div className={`my-4 border-l-[3px] ${styles} px-5 py-4`}>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function SubprocRow({ name, purpose }: { name: string; purpose: string }) {
  return (
    <tr>
      <td className="px-4 py-2 font-semibold text-stone-800">{name}</td>
      <td className="px-4 py-2 text-stone-600">{purpose}</td>
    </tr>
  );
}
