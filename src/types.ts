/** Documented MEAC location slugs (not exhaustive — any slug string is accepted). */
export const KNOWN_SLUGS = ["hummeln", "sundsvallshamn", "helags"] as const;

export type KnownSlug = (typeof KNOWN_SLUGS)[number];

/** MEAC wind page path segment, e.g. `"hummeln"`. */
export type Slug = string;
