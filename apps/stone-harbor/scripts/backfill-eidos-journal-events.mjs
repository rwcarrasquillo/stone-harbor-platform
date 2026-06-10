#!/usr/bin/env node
/**
 * Stone Harbor — one-off Eidos historical-event backfill (SH-37).
 *
 * Reads every `journal_entries` row via service-role and replays it
 * as a `journal.created` event to the Eidos ingestion endpoint, so
 * the engine has real signal from before SH-36 wired the live emit
 * (2026-06-10). Without this, [EID-20](https://linear.app/stone-harbor-ventures/issue/EID-20)
 * (circadian compute) would start from a near-empty event stream
 * and wait two weeks for output to become meaningful.
 *
 * Key properties:
 *
 *   • Deterministic event_id = `evt_backfill_<entry.id>`. Eidos
 *     dedups on (consumer_id, event_id), so re-running this script
 *     is safe — interrupted runs resume; the second pass deduplicates
 *     instead of duplicating. Critical for an idempotent backfill.
 *
 *   • Original `created_at` becomes the event timestamp, NOT now().
 *     The circadian construct cares when journaling actually
 *     happened, not when we backfilled. Same logic for any future
 *     time-aware construct.
 *
 *   • Batch size 500 (Eidos cap is 1000). Leaves headroom; small
 *     enough that an individual batch failure doesn't lose much
 *     work; large enough that the 18-row corpus today fits in one
 *     batch but the script scales.
 *
 *   • Chronological order (`ascending created_at`) so Eidos sees
 *     the same temporal sequence the user wrote in.
 *
 *   • Filters on `consumer = 'stone_harbor'` — this script is for
 *     Stone Harbor's event stream only. The Long Light (when it
 *     integrates) gets its own backfill script with its own
 *     consumer token.
 *
 *   • Payload shape mirrors what SH-36's live emit sends:
 *       { mood, mood_specific, length, word_count,
 *         reflection_mood, is_story_prompt }
 *     `reflection_mood` and `is_story_prompt` are nulled/false on
 *     backfill — enriching them would require joins to `telemetry`
 *     and `member_story_invitations`, which Eidos doesn't need for
 *     the first-pass constructs. See SH-37 description for the
 *     rationale.
 *
 * Usage:
 *
 *   # Dry-run first — fetches + prints what would be sent, no POST
 *   node apps/stone-harbor/scripts/backfill-eidos-journal-events.mjs --dry-run
 *
 *   # Live run
 *   node apps/stone-harbor/scripts/backfill-eidos-journal-events.mjs
 *
 * Required env (from `apps/stone-harbor/.env.local`):
 *
 *   NEXT_PUBLIC_SUPABASE_URL       — Stone Harbor's project
 *   SUPABASE_SERVICE_ROLE_KEY      — bypasses RLS on the read
 *   EIDOS_CONSUMER_TOKEN           — stone_harbor consumer secret
 *   EIDOS_INGEST_URL  (optional)   — defaults to prod endpoint
 *
 * After a successful run, archive this script (move to
 * `scripts/archive/` or delete) per the repo's "scripts dir is for
 * active tooling" convention.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, "..");

// Load .env.local from the app root, matching the convention used by
// the other scripts/ files (run-db-tests.mjs, ingest-knowledge.mjs).
dotenv.config({ path: path.join(APP_ROOT, ".env.local") });

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 500;
const EIDOS_INGEST_URL =
  process.env.EIDOS_INGEST_URL ??
  "https://eidos.stoneharbor.app/api/v1/events";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EIDOS_TOKEN = process.env.EIDOS_CONSUMER_TOKEN;

if (!SUPABASE_URL) {
  fail("Missing NEXT_PUBLIC_SUPABASE_URL in apps/stone-harbor/.env.local");
}
if (!SERVICE_ROLE) {
  fail("Missing SUPABASE_SERVICE_ROLE_KEY in apps/stone-harbor/.env.local");
}
if (!EIDOS_TOKEN && !DRY_RUN) {
  fail(
    "Missing EIDOS_CONSUMER_TOKEN in apps/stone-harbor/.env.local " +
      "(required for live run; not needed for --dry-run)",
  );
}

// ── Run ─────────────────────────────────────────────────────────
banner();

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log("Fetching journal_entries (consumer = stone_harbor)…");
const { data: entries, error: readError } = await supabase
  .from("journal_entries")
  .select("id, user_id, content, mood, mood_specific, created_at, consumer")
  .eq("consumer", "stone_harbor")
  .order("created_at", { ascending: true });

if (readError) {
  fail(`Failed to read journal_entries: ${readError.message}`);
}
if (!entries || entries.length === 0) {
  console.log("No entries found — nothing to backfill.");
  process.exit(0);
}

console.log(
  `Found ${entries.length} entries (oldest ${entries[0].created_at}, ` +
    `newest ${entries[entries.length - 1].created_at}).`,
);
console.log("");

const events = entries.map(buildEvent);

if (DRY_RUN) {
  console.log("First event (sample):");
  console.log(JSON.stringify(events[0], null, 2));
  if (events.length > 1) {
    console.log("");
    console.log("Last event (sample):");
    console.log(JSON.stringify(events[events.length - 1], null, 2));
  }
  console.log("");
}

let totalAccepted = 0;
let totalDeduped = 0;
let batchN = 0;

for (let i = 0; i < events.length; i += BATCH_SIZE) {
  batchN++;
  const batch = events.slice(i, i + BATCH_SIZE);

  if (DRY_RUN) {
    console.log(
      `[batch ${batchN}] ${batch.length} events ready (skipped — dry-run)`,
    );
    continue;
  }

  let res;
  try {
    res = await fetch(EIDOS_INGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${EIDOS_TOKEN}`,
      },
      body: JSON.stringify({ events: batch }),
    });
  } catch (err) {
    fail(`[batch ${batchN}] network error: ${err.message}`);
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => "<unreadable>");
    fail(`[batch ${batchN}] HTTP ${res.status}: ${errBody}`);
  }

  const json = await res.json();
  const accepted = Number(json.accepted ?? 0);
  const deduped = Number(json.deduped ?? 0);
  totalAccepted += accepted;
  totalDeduped += deduped;

  console.log(
    `[batch ${batchN}] accepted=${accepted} deduped=${deduped} ` +
      `(events=${batch.length})`,
  );
}

console.log("");
console.log("─".repeat(60));
console.log("Done.");
console.log("─".repeat(60));
console.log(`Total events processed: ${events.length}`);
if (!DRY_RUN) {
  console.log(`  Accepted: ${totalAccepted}`);
  console.log(`  Deduped:  ${totalDeduped}`);
  console.log(
    `  Sum:      ${totalAccepted + totalDeduped} ` +
      `(${totalAccepted + totalDeduped === events.length ? "matches ✓" : "MISMATCH ✗"})`,
  );
  console.log("");
  console.log(
    "Verify next: count(eidos_event_stream where consumer_id='stone_harbor') " +
      `should equal ${events.length}.`,
  );
} else {
  console.log("");
  console.log("Re-run without --dry-run to send these events.");
}

// ── Helpers ─────────────────────────────────────────────────────

function buildEvent(entry) {
  const content = entry.content ?? "";
  return {
    event_id: `evt_backfill_${entry.id}`,
    user_id: entry.user_id,
    type: "journal.created",
    // Supabase returns timestamptz as an ISO 8601 string; pass it
    // through verbatim so the Eidos ISO-8601 check sees what the
    // database actually stored.
    timestamp: entry.created_at,
    payload: {
      mood: entry.mood,
      mood_specific: entry.mood_specific,
      length: content.length,
      word_count: content.split(/\s+/).filter(Boolean).length,
      // Out of scope for backfill — see SH-37 description.
      reflection_mood: null,
      is_story_prompt: false,
    },
  };
}

function banner() {
  const mode = DRY_RUN ? "DRY RUN (no POSTs)" : "LIVE";
  console.log("─".repeat(60));
  console.log(" Eidos historical event backfill (SH-37)");
  console.log("─".repeat(60));
  console.log(` Mode:       ${mode}`);
  console.log(` Target:     ${EIDOS_INGEST_URL}`);
  console.log(` Batch size: ${BATCH_SIZE}`);
  console.log("─".repeat(60));
  console.log("");
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}
