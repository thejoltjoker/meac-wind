import { z } from "zod";

/** `lastUpdate` validation pattern (`YYYY-MM-DDTHH:MM:SS`, local page time). */
const lastUpdatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

const WindHistoryEntrySchema = z.object({
  speed: z.number().min(0),
  timestamp: z.string(),
});

const WindStatisticsSchema = z.object({
  max: z.number().min(0),
  average: z.number().min(0),
  min: z.number().min(0),
});

export const WindDataSchema = z.object({
  lastUpdate: z.string().regex(lastUpdatePattern, {
    message: "lastUpdate must be YYYY-MM-DDTHH:MM:SS",
  }),
  location: z.string(),
  windStrength: z.number().min(0),
  temperature: z.number(),
  windDirection: z.number().min(0).max(360),
  statistics: WindStatisticsSchema,
  history: z.array(WindHistoryEntrySchema),
});

/** Wind speed sample from a history link on the MEAC page. */
export type WindHistoryEntry = z.infer<typeof WindHistoryEntrySchema>;

/**
 * Wind speed statistics for the current reporting period.
 * Parsed values satisfy `max` >= `average` >= `min`.
 */
export type WindStatistics = z.infer<typeof WindStatisticsSchema>;

/**
 * Validated wind measurement payload from `fetchWindData`.
 *
 * - `lastUpdate` — ISO-like local timestamp (`YYYY-MM-DDTHH:MM:SS`); no timezone offset applied
 * - `location` — place name from the MEAC panel
 * - `windStrength` — current wind speed (m/s)
 * - `temperature` — air temperature (°C)
 * - `windDirection` — direction in degrees, 0–360
 * - `statistics` — max, average, and min speeds for the period
 * - `history` — recent samples from alert links on the page
 */
export type WindData = z.infer<typeof WindDataSchema>;
