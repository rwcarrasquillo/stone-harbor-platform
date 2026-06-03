/**
 * aggregateLayers — roll instrument-level scores into layer-level
 * scores suitable for storing in eidos_layer_scores.
 *
 * Phase 1 layer mapping:
 *   - bfi10        → traits
 *   - schwartz     → values
 *   - bpnsfs12     → motivational
 *   - phq2gad2     → clinical (light screening only; full clinical
 *                              layer waits for Phase 2 + advisor)
 *
 * The output is a flat record per layer. The consumer (or the chapter
 * generator) reads the layer scores back and works with them.
 */

import type {
  EidosLayer,
  InstrumentScoreResult,
  LayerScoreRow,
} from "../types";

export function aggregateLayers(
  userId: string,
  results: ReadonlyArray<InstrumentScoreResult>,
): LayerScoreRow[] {
  const layers: Partial<Record<EidosLayer, Record<string, number>>> = {};

  for (const r of results) {
    switch (r.instrumentId) {
      case "bfi10":
        layers.traits = { ...(layers.traits ?? {}), ...r.scores };
        break;
      case "schwartz":
        layers.values = { ...(layers.values ?? {}), ...r.scores };
        break;
      case "bpnsfs12":
        layers.motivational = { ...(layers.motivational ?? {}), ...r.scores };
        break;
      case "phq2gad2": {
        // NaN sentinels become null in the stored representation
        // (jsonb doesn't have NaN). The chapter generator interprets
        // missing keys as "skipped."
        const clean: Record<string, number> = {};
        if (!Number.isNaN(r.scores.phq2)) clean.phq2 = r.scores.phq2;
        if (!Number.isNaN(r.scores.gad2)) clean.gad2 = r.scores.gad2;
        layers.clinical = { ...(layers.clinical ?? {}), ...clean };
        break;
      }
      default: {
        const _exhaustive: never = r;
        throw new Error(`Unknown instrument result: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  const now = new Date().toISOString();
  return (Object.keys(layers) as EidosLayer[]).map((layer) => ({
    userId,
    layer,
    scores: layers[layer] ?? {},
    computedAt: now,
  }));
}
