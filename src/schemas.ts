import { z } from "zod";

/** ISO-like timestamp produced by the parser: `YYYY-MM-DDTHH:MM:SS`. */
const lastUpdatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

export const WindHistoryEntrySchema = z.object({
  speed: z.number().min(0),
  timestamp: z.string(),
});

export const WindStatisticsSchema = z.object({
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

export type WindHistoryEntry = z.infer<typeof WindHistoryEntrySchema>;
export type WindStatistics = z.infer<typeof WindStatisticsSchema>;
export type WindData = z.infer<typeof WindDataSchema>;
