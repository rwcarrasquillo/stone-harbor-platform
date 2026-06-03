import { serif } from "@/lib/fonts";

/**
 * Stone Harbor — offline fallback.
 *
 * Served by the service worker when the device is offline and the
 * requested page isn't in cache. The tone matches the rest of the
 * product — patient, not alarming. A man in a tunnel without bars
 * shouldn't be greeted with a red error screen.
 *
 * Notably this is NOT a 404 — it's a "you stepped out of signal"
 * page. 988 footer is preserved because crisis support is offline-
 * relevant: a member in distress whose phone is offline can still
 * call 988 from the lock screen.
 *
 * Static so it pre-renders into the SW shell cache at build time.
 */
export const metadata = {
  title: "Offline",
  description: "Stone Harbor is offline. The harbor is patient — try again in a moment.",
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0A0A0B] px-6 text-center text-stone-100">
      <p className="text-[10px] font-bold uppercase tracking-[0.36em] text-[#c4934e]">
        Offline
      </p>
      <h1
        className={`${serif.className} mt-4 max-w-xl text-3xl italic leading-snug text-stone-50 md:text-4xl`}
      >
        The signal slipped away for a moment.
      </h1>
      <p className="mt-5 max-w-md text-sm leading-relaxed text-stone-400">
        The harbor is patient. When your connection returns, this page will
        too. No rush.
      </p>

      <div className="mt-10 border-l-[2px] border-[#a9793d] bg-[#11110f] px-5 py-4 text-left">
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#c4934e]">
          If you need help right now
        </p>
        <p className="mt-2 text-sm text-stone-200">
          Call or text <span className="font-semibold">988</span> — the Suicide
          &amp; Crisis Lifeline. Available 24 hours, free, confidential.
        </p>
      </div>
    </main>
  );
}
