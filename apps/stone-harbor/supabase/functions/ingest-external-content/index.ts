import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const RELEVANCE_THRESHOLD = 60;
const MAX_ITEMS_PER_SOURCE = 15;
const MAX_LOOKBACK_DAYS = 21;

type Source = {
  id: string;
  name: string;
  base_url: string;
  feed_url: string;
  trust_tier: string;
};

type Item = {
  title: string;
  link: string;
  description: string;
  pubDate: string | null;
  imageUrl: string | null;
};

type Classification = {
  relevance: number;
  pillar: "clarity" | "calm" | "strength" | "none";
  reasoning: string;
};

// ----- Minimal XML/RSS+Atom parser (no npm dependency). -----

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function cleanText(s: string): string {
  return decodeEntities(stripHtml(stripCdata(s))).trim();
}

function firstMatch(xml: string, regex: RegExp): string {
  const m = xml.match(regex);
  return m ? m[1] : "";
}

function parseFeed(xml: string): Item[] {
  const items: Item[] = [];
  const itemRegex = /<(item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null) {
    const inner = match[2];
    const title = cleanText(
      firstMatch(inner, /<title\b[^>]*>([\s\S]*?)<\/title>/i),
    );
    // RSS uses <link>URL</link>; Atom uses <link href="URL" .../>
    let link = firstMatch(inner, /<link\b[^>]*>([\s\S]*?)<\/link>/i).trim();
    if (!link) {
      link = firstMatch(inner, /<link\b[^>]*href=["']([^"']+)["']/i);
    }
    link = cleanText(link);

    const description = cleanText(
      firstMatch(inner, /<description\b[^>]*>([\s\S]*?)<\/description>/i) ||
        firstMatch(inner, /<summary\b[^>]*>([\s\S]*?)<\/summary>/i) ||
        firstMatch(inner, /<content\b[^>]*>([\s\S]*?)<\/content>/i),
    );

    const pubRaw =
      firstMatch(inner, /<pubDate\b[^>]*>([\s\S]*?)<\/pubDate>/i) ||
      firstMatch(inner, /<published\b[^>]*>([\s\S]*?)<\/published>/i) ||
      firstMatch(inner, /<updated\b[^>]*>([\s\S]*?)<\/updated>/i);
    const pubDate = pubRaw.trim() || null;

    let imageUrl: string | null = null;
    const mediaContent = firstMatch(
      inner,
      /<media:content\b[^>]*url=["']([^"']+)["']/i,
    );
    const enclosure = firstMatch(
      inner,
      /<enclosure\b[^>]*url=["']([^"']+)["']/i,
    );
    imageUrl = mediaContent || enclosure || null;

    if (title && link) {
      items.push({
        title: title.slice(0, 500),
        link,
        description: description.slice(0, 1500),
        pubDate,
        imageUrl,
      });
    }
  }
  return items;
}

// ----- LLM classification -----

async function classify(
  apiKey: string,
  model: string,
  source: Source,
  item: Item,
): Promise<Classification | null> {
  const prompt = `You are classifying an article for Stone Harbor, a men's psychological recovery and mental wellness platform organized around three pillars:

- Clarity: naming patterns, perception, cognitive reframing, early-recovery insight, IFS/ACT concepts.
- Calm: nervous system regulation, somatic practice, sleep, anxiety, breath work.
- Strength: rebuilding identity, boundaries, structure, discipline, agency, Stoic practice.

Source: ${source.name} (${source.trust_tier} tier)
Title: ${item.title}
Summary: ${item.description.slice(0, 500)}

Return a single-line JSON object and nothing else:
{"relevance": <integer 0-100, how relevant for men's psychological recovery>, "pillar": "clarity"|"calm"|"strength"|"none", "reasoning": "<one short sentence>"}`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: prompt,
      temperature: 0.2,
      max_output_tokens: 200,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
  }

  type R = {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };
  const json = (await response.json()) as R;
  const raw =
    json.output_text || json.output?.[0]?.content?.[0]?.text || "";

  // Be forgiving — the model might wrap in code fences or add prose.
  const objectMatch = raw.match(/\{[\s\S]*\}/);
  if (!objectMatch) return null;

  try {
    const parsed = JSON.parse(objectMatch[0]) as Classification;
    if (
      typeof parsed.relevance !== "number" ||
      !parsed.pillar ||
      typeof parsed.reasoning !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch (_) {
    return null;
  }
}

// ----- Main -----

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!supabaseUrl || !serviceKey || !openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "Missing environment variables" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let sourceId: string | undefined;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body && typeof body.source_id === "string") sourceId = body.source_id;
      } catch (_) {
        // ignore
      }
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const model = "gpt-4o-mini";
    const lookbackCutoff = Date.now() - MAX_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

    let sourcesQuery = supabase
      .from("external_sources")
      .select("id, name, base_url, feed_url, trust_tier, is_active")
      .eq("is_active", true);
    if (sourceId) sourcesQuery = sourcesQuery.eq("id", sourceId);
    const { data: sources, error: sourcesErr } = await sourcesQuery;
    if (sourcesErr) throw new Error(sourcesErr.message);
    if (!sources || sources.length === 0) {
      return new Response(
        JSON.stringify({ status: "no active sources" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const results: Array<Record<string, unknown>> = [];

    for (const source of sources as Source[]) {
      let fetched = 0,
        fresh = 0,
        classified = 0,
        inserted = 0,
        skipped = 0;
      try {
        const res = await fetch(source.feed_url, {
          headers: {
            "User-Agent":
              "StoneHarbor-Ingest/1.0 (+https://fbqcmtcvgijlemfpncay.supabase.co)",
          },
        });
        if (!res.ok) {
          throw new Error(`Feed fetch ${res.status} for ${source.feed_url}`);
        }
        const xml = await res.text();
        const items = parseFeed(xml).slice(0, MAX_ITEMS_PER_SOURCE);
        fetched = items.length;

        for (const item of items) {
          // Skip too-old items
          const ts = item.pubDate ? Date.parse(item.pubDate) : NaN;
          if (!isNaN(ts) && ts < lookbackCutoff) {
            skipped++;
            continue;
          }

          // Dedupe — external_url is UNIQUE
          const { data: existing } = await supabase
            .from("external_content")
            .select("id")
            .eq("external_url", item.link)
            .maybeSingle();
          if (existing) {
            skipped++;
            continue;
          }
          fresh++;

          let cls: Classification | null = null;
          try {
            cls = await classify(openaiApiKey, model, source, item);
          } catch (e) {
            // Classification failed — skip this item, log overall later
            skipped++;
            continue;
          }
          classified++;

          if (
            !cls ||
            cls.relevance < RELEVANCE_THRESHOLD ||
            cls.pillar === "none"
          ) {
            skipped++;
            continue;
          }

          const { error: insertErr } = await supabase
            .from("external_content")
            .insert({
              source_id: source.id,
              source_name: source.name,
              external_url: item.link,
              title: item.title,
              summary: item.description.slice(0, 600),
              image_url: item.imageUrl,
              pillar: cls.pillar,
              relevance_score: Math.round(cls.relevance),
              classification_model: model,
              classification_reasoning: cls.reasoning,
              external_published_at: ts && !isNaN(ts) ? new Date(ts).toISOString() : null,
            });
          if (insertErr) {
            // Likely a race on uniqueness — count as skipped
            skipped++;
            continue;
          }
          inserted++;
        }

        await supabase
          .from("external_sources")
          .update({ last_fetched_at: new Date().toISOString() })
          .eq("id", source.id);

        await supabase.from("external_ingestion_logs").insert({
          source_id: source.id,
          fetched_count: fetched,
          new_count: fresh,
          classified_count: classified,
          inserted_count: inserted,
          skipped_count: skipped,
          status: "success",
          message: `Fetched ${fetched}, new ${fresh}, kept ${inserted}.`,
        });

        results.push({
          source: source.name,
          status: "success",
          fetched,
          fresh,
          classified,
          inserted,
          skipped,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        await supabase.from("external_ingestion_logs").insert({
          source_id: source.id,
          fetched_count: fetched,
          new_count: fresh,
          classified_count: classified,
          inserted_count: inserted,
          skipped_count: skipped,
          status: "failed",
          message,
        });
        results.push({
          source: source.name,
          status: "failed",
          error: message,
        });
      }
    }

    return new Response(
      JSON.stringify({ status: "completed", results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
