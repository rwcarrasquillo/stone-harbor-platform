"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";

import { serif, sans } from "@/lib/fonts";
// Stone Harbor brand
const GOLD_DEEP = "#a9793d";

/**
 * Stone Harbor — Terms of Service
 *
 * Source of truth: TERMS_OF_SERVICE.md (for attorney review & archive)
 * This page renders the v1 content for end users.
 *
 * When updating: also bump app_settings.current_terms_version so the
 * dashboard re-prompts existing members for acceptance.
 */
export default function TermsPage() {
  const [version, setVersion] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    async function loadVersion() {
      const { data } = await supabase
        .from("app_settings")
        .select("current_terms_version, terms_last_updated")
        .eq("id", 1)
        .single();
      setVersion(data?.current_terms_version ?? 1);
      setLastUpdated(data?.terms_last_updated ?? null);
    }
    loadVersion();
  }, []);

  return (
    <main
      className={`${sans.className} min-h-screen bg-[#f3efe7] text-stone-900`}
    >
      {/* NAV */}
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
            href="/privacy"
            className="text-xs font-bold uppercase tracking-[0.22em] text-stone-600 transition hover:text-[#a9793d]"
          >
            Privacy →
          </Link>
        </div>
      </header>

      {/* HEAD */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mx-auto max-w-3xl px-6 py-16 md:px-8"
      >
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#a9793d]">
          The Rules of the Harbor
        </p>
        <h1
          className={`${serif.className} mt-4 text-5xl font-medium leading-tight md:text-7xl`}
        >
          Terms of Service.
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
          These Terms govern your use of Stone Harbor. They are written in the
          same voice as the rest of the product — clear, respectful, and honest
          about what we are and what we are not. If something here feels unclear
          or unfair, please tell us.
        </p>
      </motion.section>

      {/* TOC */}
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

      {/* BODY */}
      <article className="mx-auto max-w-3xl px-6 py-16 md:px-8">
        <Section id="acceptance" n={1} title="Acceptance of These Terms">
          <P>
            By creating an account, accessing, or using Stone Harbor (the{" "}
            <B>&ldquo;Service&rdquo;</B>), you agree to be bound by these Terms
            of Service (the <B>&ldquo;Terms&rdquo;</B>) and our{" "}
            <Link
              href="/privacy"
              className="font-semibold text-[#a9793d] underline-offset-4 hover:underline"
            >
              Privacy Policy
            </Link>
            , which is incorporated here by reference.
          </P>
          <P>
            If you do not agree to these Terms, do not create an account and do
            not use the Service.
          </P>
          <P>
            Stone Harbor is operated by Stone Harbor (referred to as{" "}
            <B>&ldquo;Stone Harbor,&rdquo;</B> <B>&ldquo;we,&rdquo;</B>{" "}
            <B>&ldquo;us,&rdquo;</B> or <B>&ldquo;our&rdquo;</B>). The terms{" "}
            <B>&ldquo;you&rdquo;</B> and <B>&ldquo;your&rdquo;</B> refer to the
            individual member using the Service.
          </P>
        </Section>

        <Section
          id="what-we-are"
          n={2}
          title="What Stone Harbor Is — And What It Is Not"
        >
          <H3>What we are</H3>
          <P>
            Stone Harbor is a mental wellness platform for adult men. We provide
            tools, content, and a community space to support self-reflection,
            emotional regulation, and personal growth. Our features include
            private journaling, mood tracking, guided reflections, a brotherhood
            feed, and (when available) connection to vetted coaches.
          </P>
          <H3>What we are NOT</H3>
          <Callout tone="warning">
            <P>
              <B>
                Stone Harbor is not a substitute for professional medical care,
                mental health treatment, therapy, counseling, or psychiatric
                services.
              </B>{" "}
              We are not a licensed healthcare provider. We do not diagnose,
              treat, cure, or prevent any medical or mental health condition.
            </P>
            <P>
              Information, content, and community discussions on Stone Harbor
              are for informational and supportive purposes only and do not
              constitute medical advice. You should always consult a qualified,
              licensed healthcare professional for medical questions, mental
              health concerns, and treatment decisions.
            </P>
          </Callout>
          <H3>If you are in crisis</H3>
          <Callout tone="critical">
            <P>
              <B>
                If you are experiencing a mental health crisis, having thoughts
                of self-harm or suicide, or are in immediate danger, do not rely
                on Stone Harbor.
              </B>{" "}
              Contact the <B>988 Suicide &amp; Crisis Lifeline</B> (call or text{" "}
              <B>988</B>) immediately, or call <B>911</B> for emergency
              services. These resources are available 24 hours a day, 7 days a
              week.
            </P>
          </Callout>
        </Section>

        <Section id="eligibility" n={3} title="Eligibility">
          <P>To use Stone Harbor, you must:</P>
          <Ul>
            <li>
              Be <B>at least 18 years of age</B>. Stone Harbor is not directed
              to, and we do not knowingly collect information from, anyone under
              18.
            </li>
            <li>
              <B>Identify as a man.</B> Stone Harbor is intentionally designed
              as a community space for men. By creating an account, you affirm
              that you identify as a man. Misrepresenting your gender to gain
              access is a violation of these Terms.
            </li>
            <li>
              Be legally able to enter into a binding contract under the laws of
              your jurisdiction.
            </li>
            <li>
              Not be prohibited from receiving the Service under applicable law.
            </li>
            <li>
              Not have previously had your Stone Harbor account terminated for
              violations of these Terms (unless we have expressly authorized you
              to create a new account).
            </li>
          </Ul>
        </Section>

        <Section id="account" n={4} title="Account Registration">
          <H3>Truthful information</H3>
          <P>
            When you create an account, you agree to provide accurate, current,
            and complete information. You agree to keep this information
            updated. Submitting false or misleading information is a violation
            of these Terms.
          </P>
          <H3>One account per person</H3>
          <P>
            You may maintain only one Stone Harbor account. Creating multiple
            accounts to circumvent suspension, gather additional data, or
            otherwise abuse the Service is a violation of these Terms.
          </P>
          <H3>Account security</H3>
          <P>
            You are responsible for safeguarding your account credentials and
            for all activity that occurs under your account. Notify us
            immediately if you suspect unauthorized access.
          </P>
          <H3>No account sharing</H3>
          <P>
            Your account is personal to you. Do not share your login with
            anyone, including a spouse, partner, therapist, or family member.
          </P>
        </Section>

        <Section id="conduct" n={5} title="User Conduct">
          <P>
            Stone Harbor exists because men in pain need a calm, respectful
            space. Member behavior that undermines that space is a violation of
            these Terms.
          </P>
          <H3>What is not allowed</H3>
          <P>You agree not to use Stone Harbor to:</P>
          <Ul>
            <li>
              <B>Harass, threaten, intimidate, or stalk</B> any other member.
            </li>
            <li>
              Post <B>hate speech</B> or discriminatory content targeting any
              individual or group on the basis of race, ethnicity, national
              origin, religion, age, gender identity, sexual orientation,
              disability, or other protected characteristic.
            </li>
            <li>
              Post <B>sexual content</B>, including sexually explicit text,
              images, or solicitations. Stone Harbor is not a dating or hookup
              platform.
            </li>
            <li>
              <B>
                Promote, encourage, or instruct others in self-harm or suicide.
              </B>{" "}
              Sharing your own struggles in good faith is welcome; encouraging
              others to harm themselves is not.
            </li>
            <li>
              Share content that <B>endangers minors</B> in any way.
            </li>
            <li>
              <B>Impersonate</B> another person, including any Stone Harbor
              coach, employee, or other member.
            </li>
            <li>
              Misrepresent your identity, gender, or eligibility (see Section
              3).
            </li>
            <li>
              Use Stone Harbor for <B>commercial solicitation</B>, advertising,
              multi-level marketing, or unsolicited promotion.
            </li>
            <li>
              <B>Spam</B> the community feed, messages, or any other surface
              with repetitive, irrelevant, or low-quality content.
            </li>
            <li>
              Attempt to <B>circumvent moderation actions</B> (warnings,
              suspensions, content removal) by creating new accounts or using
              the Service in bad faith.
            </li>
            <li>
              Attempt to <B>gain unauthorized access</B> to any portion of the
              Service, other members&rsquo; accounts, or our systems.
            </li>
            <li>
              <B>Scrape, harvest, or extract</B> data from Stone Harbor by
              automated means.
            </li>
            <li>
              <B>Reverse engineer, decompile, or disassemble</B> any part of the
              Service except as expressly permitted by applicable law.
            </li>
            <li>Use the Service in any way that violates applicable law.</li>
          </Ul>
          <H3>Reporting violations</H3>
          <P>
            You can report content that violates these Terms using the flag icon
            next to any post, comment, or message. Reports are reviewed by our
            moderation team.
          </P>
          <H3>Good faith use</H3>
          <P>
            Stone Harbor is built on the assumption that members are here in
            good faith. Tough emotions, raw language, and difficult subject
            matter are welcome when shared honestly. The line we care about is{" "}
            <B>
              whether your behavior makes the harbor a safer or more dangerous
              place for the men around you.
            </B>
          </P>
        </Section>

        <Section
          id="moderation"
          n={6}
          title="Moderation, Warnings, and Suspension"
        >
          <H3>The three-warning policy</H3>
          <P>
            Stone Harbor operates a <B>three-warning policy.</B> When a
            member&rsquo;s content or behavior violates Section 5, our
            moderation team may, at its discretion:
          </P>
          <Ul>
            <li>
              <B>Dismiss</B> the report (no action),
            </li>
            <li>
              <B>Issue a warning</B> (recorded against your account; you will be
              notified by email and in the app), or
            </li>
            <li>
              <B>Suspend your account</B> immediately for severe violations.
            </li>
          </Ul>
          <P>
            <B>
              Three active (non-rescinded) warnings result in automatic account
              suspension.
            </B>{" "}
            You will see your warning count in your profile settings at all
            times.
          </P>
          <H3>Severe violations</H3>
          <P>
            Some violations result in immediate suspension or termination
            without prior warnings, including but not limited to: content that
            endangers minors, credible threats of violence, hate speech
            targeting protected groups, sexual content, account-takeover
            attempts or hacking, and coordinated abuse.
          </P>
          <H3>Suspended accounts</H3>
          <P>
            If your account is suspended, you will still be able to log in to
            view your warning history, the reasons for your suspension, and to
            submit an appeal. You will not be able to post, journal, message,
            join groups, or use coaching features while suspended.
          </P>
          <H3>Appeals</H3>
          <P>
            You may submit a written appeal of any warning or suspension.
            Appeals are reviewed by an administrator and may result in denial
            (the warning or suspension stands), partial relief (one or more
            warnings are rescinded; if your active count drops below three, your
            suspension is lifted), or full relief (all warnings cleared;
            suspension lifted; you return to the Service without record).
          </P>
        </Section>

        <Section id="content" n={7} title="Your Content">
          <H3>Ownership</H3>
          <P>
            You retain all ownership rights to the content you post on Stone
            Harbor — your journal entries, posts, comments, messages, profile
            information, photos, and any other content you submit (
            <B>&ldquo;Your Content&rdquo;</B>).
          </P>
          <H3>License to Stone Harbor</H3>
          <P>
            By submitting Your Content, you grant Stone Harbor a{" "}
            <B>
              worldwide, non-exclusive, royalty-free, sublicensable, and
              transferable license
            </B>{" "}
            to host, store, reproduce, display, and process Your Content{" "}
            <B>
              solely for the purpose of operating, providing, and improving the
              Service
            </B>{" "}
            and for related internal operations.
          </P>
          <H3>Private content stays private</H3>
          <Callout tone="brand">
            <P>
              Your <B>journal entries</B> and <B>direct messages</B> are private
              by design. Stone Harbor employees and administrators do not read
              your journal entries except in the rarest circumstances expressly
              allowed below.
            </P>
          </Callout>
          <H3>When we may access private content</H3>
          <P>
            We may access Your Content, including private journal entries and
            messages, only:
          </P>
          <Ul>
            <li>
              When required by law (e.g., a valid court order or subpoena),
            </li>
            <li>
              When necessary to prevent imminent harm to you or to another
              person,
            </li>
            <li>
              When necessary to investigate a serious Terms violation that has
              been reported, and only the specific content reasonably relevant
              to that investigation, or
            </li>
            <li>When you expressly request that we access specific content.</li>
          </Ul>
          <P>
            We do not access private content for product analytics, marketing,
            training of artificial intelligence systems, or any other routine
            purpose.
          </P>
        </Section>

        <Section id="ip" n={8} title="Stone Harbor's Intellectual Property">
          <P>
            The Stone Harbor name, logo, design, written content (including
            daily reflections, journal prompts, blog posts, and acknowledgment
            copy), software, and any other materials we provide are owned by
            Stone Harbor or our licensors and are protected by copyright,
            trademark, and other intellectual property laws.
          </P>
          <P>
            We grant you a{" "}
            <B>limited, personal, non-exclusive, non-transferable, revocable</B>{" "}
            license to access and use the Service for your personal,
            non-commercial use, subject to these Terms.
          </P>
        </Section>

        <Section id="coaching" n={9} title="Coaching (Future Service)">
          <P>
            Stone Harbor expects to launch a paid coaching service. When that
            service is available:
          </P>
          <Ul>
            <li>
              <B>Coaching is not therapy.</B> Stone Harbor coaches are not
              licensed clinicians. Coaching is a goal-oriented supportive
              service, not a medical or mental health treatment.
            </li>
            <li>
              <B>Referrals.</B> If a coach reasonably believes you would benefit
              from professional clinical care, they may decline to continue
              coaching and refer you to a licensed provider.
            </li>
            <li>
              <B>Coach independence.</B> Coaches participate as independent
              contractors, not employees. Stone Harbor is not responsible for
              the personal conduct, statements, or advice of any individual
              coach.
            </li>
            <li>
              <B>Payment.</B> Coaching sessions are sold individually or as
              programs and are paid via Stripe.
            </li>
            <li>
              <B>Confidentiality.</B> What you share with your coach during a
              coaching engagement is treated as confidential between you and
              that coach, subject to the same exceptions in Section 7.
            </li>
          </Ul>
        </Section>

        <Section id="privacy" n={10} title="Privacy">
          <P>
            Your privacy is governed by our{" "}
            <Link
              href="/privacy"
              className="font-semibold text-[#a9793d] underline-offset-4 hover:underline"
            >
              Privacy Policy
            </Link>
            , which explains what data we collect, how we use it, and your
            rights regarding that data.
          </P>
        </Section>

        <Section id="third-party" n={11} title="Third-Party Services">
          <P>
            Stone Harbor uses third-party service providers to operate. The
            privacy policies and terms of these providers apply to data
            processed by them on our behalf. Current subprocessors are listed in
            the Privacy Policy.
          </P>
        </Section>

        <Section id="changes-service" n={12} title="Changes to the Service">
          <P>
            We may, at our discretion, modify, suspend, or discontinue any
            feature of the Service at any time, with or without notice. We may
            also pause new account registration at any time.
          </P>
        </Section>

        <Section id="changes-terms" n={13} title="Changes to These Terms">
          <P>
            We may update these Terms from time to time. When we make material
            changes, we will update the &ldquo;Last Updated&rdquo; date,
            increment the terms version, and notify members via email and via an
            in-app prompt requiring re-acceptance before continuing to use the
            Service.
          </P>
          <P>
            Your continued use of Stone Harbor after the effective date of
            updated Terms constitutes your acceptance of them.
          </P>
        </Section>

        <Section id="closure" n={14} title="Account Closure">
          <H3>By you</H3>
          <P>
            You may close your account at any time from your profile settings.
            When you close your account:
          </P>
          <Ul>
            <li>
              Your profile is marked closed and your public content is removed
              from public view.
            </li>
            <li>Your private journal entries are deleted within 30 days.</li>
            <li>
              Other personal data is deleted or anonymized within 90 days,
              except where retention is required by law.
            </li>
          </Ul>
          <H3>By us</H3>
          <P>
            We may close your account for the reasons described in Section 6,
            for prolonged inactivity, or where we are required to do so by law.
          </P>
        </Section>

        <Section
          id="disclaimer"
          n={15}
          title="Disclaimers and Limitation of Liability"
        >
          <H3>Service &ldquo;as is&rdquo;</H3>
          <P className="text-xs uppercase tracking-wide">
            THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
            AVAILABLE,&rdquo; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR
            IMPLIED, INCLUDING WITHOUT LIMITATION ANY WARRANTIES OF
            MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT,
            OR ANY WARRANTY ARISING FROM COURSE OF DEALING OR USAGE OF TRADE.
          </P>
          <H3>No medical or clinical warranty</H3>
          <P className="text-xs uppercase tracking-wide">
            WE EXPRESSLY DISCLAIM ANY WARRANTY OR REPRESENTATION THAT THE
            SERVICE, ITS CONTENT, OR ANY USER CONTENT IS APPROPRIATE FOR
            DIAGNOSING, TREATING, CURING, OR PREVENTING ANY MEDICAL OR MENTAL
            HEALTH CONDITION. THE SERVICE IS NOT A SUBSTITUTE FOR PROFESSIONAL
            CARE.
          </P>
          <H3>Limitation of liability</H3>
          <P className="text-xs uppercase tracking-wide">
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT WILL STONE
            HARBOR, ITS OFFICERS, EMPLOYEES, CONTRACTORS, OR AGENTS BE LIABLE
            FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR
            PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, DATA, OR
            GOODWILL, ARISING FROM OR RELATING TO YOUR USE OF (OR INABILITY TO
            USE) THE SERVICE, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF
            SUCH DAMAGES.
          </P>
          <P className="text-xs uppercase tracking-wide">
            OUR TOTAL CUMULATIVE LIABILITY ARISING FROM OR RELATING TO THESE
            TERMS OR THE SERVICE WILL NOT EXCEED THE GREATER OF (A) ONE HUNDRED
            U.S. DOLLARS ($100) OR (B) THE AMOUNTS YOU HAVE PAID TO STONE HARBOR
            IN THE TWELVE MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM.
          </P>
          <H3>Member-to-member interactions</H3>
          <P>
            Stone Harbor is a community platform. We do not control what other
            members say or do, and we are not responsible for any interaction
            between members.{" "}
            <B>You interact with other members at your own risk.</B>
          </P>
        </Section>

        <Section id="indemnification" n={16} title="Indemnification">
          <P>
            To the maximum extent permitted by law, you agree to indemnify,
            defend, and hold harmless Stone Harbor and its officers, employees,
            contractors, and agents from and against any claims, liabilities,
            damages, losses, and expenses (including reasonable attorneys&rsquo;
            fees) arising from or relating to your use of the Service, your
            violation of these Terms, your violation of any third-party right,
            or content you submit to the Service.
          </P>
        </Section>

        <Section
          id="arbitration"
          n={17}
          title="Dispute Resolution and Arbitration"
        >
          <H3>Informal resolution first</H3>
          <P>
            Before bringing any formal claim, you agree to first contact us and
            attempt to resolve the dispute informally for{" "}
            <B>at least 60 days</B>.
          </P>
          <H3>Binding arbitration</H3>
          <P>
            If informal resolution fails,{" "}
            <B>
              any dispute arising from or relating to these Terms or the Service
              will be resolved by binding individual arbitration.
            </B>
          </P>
          <H3>Class action waiver</H3>
          <P className="text-xs uppercase tracking-wide">
            YOU AND STONE HARBOR EACH AGREE THAT ANY DISPUTE WILL BE RESOLVED ON
            AN INDIVIDUAL BASIS, AND THAT NEITHER PARTY WILL BRING OR
            PARTICIPATE IN ANY CLASS, COLLECTIVE, OR REPRESENTATIVE ACTION
            AGAINST THE OTHER.
          </P>
          <H3>Exceptions</H3>
          <P>
            Either party may bring an individual action in small claims court
            for any claim within that court&rsquo;s jurisdiction.
          </P>
          <H3>Opt-out</H3>
          <P>
            You may opt out of this arbitration agreement by sending written
            notice within <B>30 days</B> of first accepting these Terms.
          </P>
        </Section>

        <Section id="law" n={18} title="Governing Law">
          <P>
            These Terms are governed by the laws of the State where Stone Harbor
            is organized, without regard to its conflict-of-law principles. The
            federal and state courts located in that State will have exclusive
            jurisdiction over any non-arbitrable dispute.
          </P>
        </Section>

        <Section id="general" n={19} title="General Provisions">
          <H3>Entire agreement</H3>
          <P>
            These Terms, together with the Privacy Policy and any
            service-specific addenda, constitute the entire agreement between
            you and Stone Harbor regarding the Service.
          </P>
          <H3>Severability</H3>
          <P>
            If any provision of these Terms is held to be invalid or
            unenforceable, the remaining provisions will remain in full force
            and effect.
          </P>
          <H3>No waiver</H3>
          <P>
            Our failure to enforce any provision of these Terms is not a waiver
            of our right to do so later.
          </P>
          <H3>Assignment</H3>
          <P>
            You may not assign or transfer these Terms without our prior written
            consent. We may assign these Terms in connection with a merger,
            acquisition, or sale of substantially all of our assets.
          </P>
          <H3>Force majeure</H3>
          <P>
            We are not liable for any failure to perform our obligations under
            these Terms caused by circumstances beyond our reasonable control.
          </P>
        </Section>

        <Section id="contact" n={20} title="Contact">
          <P>
            For questions about these Terms or the Service, contact us via the
            Privacy &amp; Legal contact information provided in our{" "}
            <Link
              href="/privacy"
              className="font-semibold text-[#a9793d] underline-offset-4 hover:underline"
            >
              Privacy Policy
            </Link>
            .
          </P>
        </Section>

        <Callout tone="brand">
          <P className={`${serif.className} text-xl italic`}>
            Stone Harbor exists because the men who use it deserve a careful,
            respectful space. These Terms are written in that spirit.
          </P>
        </Callout>
      </article>

      {/* FOOTER */}
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

/* ──────────────────────────────────────────────
   PRIMITIVES — kept inline for one-file simplicity
   ────────────────────────────────────────────── */

const TOC = [
  { id: "acceptance", label: "Acceptance of These Terms" },
  { id: "what-we-are", label: "What Stone Harbor Is — And Is Not" },
  { id: "eligibility", label: "Eligibility" },
  { id: "account", label: "Account Registration" },
  { id: "conduct", label: "User Conduct" },
  { id: "moderation", label: "Moderation, Warnings, and Suspension" },
  { id: "content", label: "Your Content" },
  { id: "ip", label: "Intellectual Property" },
  { id: "coaching", label: "Coaching (Future Service)" },
  { id: "privacy", label: "Privacy" },
  { id: "third-party", label: "Third-Party Services" },
  { id: "changes-service", label: "Changes to the Service" },
  { id: "changes-terms", label: "Changes to These Terms" },
  { id: "closure", label: "Account Closure" },
  { id: "disclaimer", label: "Disclaimers and Limitation of Liability" },
  { id: "indemnification", label: "Indemnification" },
  { id: "arbitration", label: "Dispute Resolution and Arbitration" },
  { id: "law", label: "Governing Law" },
  { id: "general", label: "General Provisions" },
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
