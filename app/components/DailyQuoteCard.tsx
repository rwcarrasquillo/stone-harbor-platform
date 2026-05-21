"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { serif, sans } from "@/lib/fonts";
import { Cormorant_Garamond } from "next/font/google";

const calligraphy = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

type DailyQuote = {
  quote_text: string;
  theme: string;
  category: string | null;
};

export default function DailyQuoteCard() {
  const [quote, setQuote] = useState<DailyQuote | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDailyQuote() {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("recovery_stage")
        .eq("id", user.id)
        .maybeSingle();

      const recoveryStage = profile?.recovery_stage || "Clarity";
      const today = new Date().toISOString().split("T")[0];

      const { data } = await supabase
        .from("daily_quotes")
        .select("quote_text, theme, category")
        .eq("quote_date", today)
        .eq("audience", "men")
        .eq("theme", recoveryStage)
        .eq("is_active", true)
        .maybeSingle();

      setQuote(data);
      setLoading(false);
    }

    loadDailyQuote();
  }, []);

  if (loading) {
    return null;
  }

  if (!quote) {
    return null;
  }

  return (
    <section className="mx-auto mt-6 max-w-3xl px-6 text-center">
      <div className="rounded-[2rem] border border-white/50 bg-white/55 px-8 py-8 shadow-sm backdrop-blur-md">
        <p
          className={`${calligraphy.className} text-3xl font-medium leading-relaxed text-stone-800 md:text-4xl`}
        >
          “{quote.quote_text}”
        </p>

        <div className="mt-5 flex justify-center">
          <span className="rounded-full bg-stone-900/5 px-4 py-1 text-xs font-medium uppercase tracking-[0.25em] text-stone-500">
            {quote.theme}
          </span>
        </div>
      </div>
    </section>
  );
}
