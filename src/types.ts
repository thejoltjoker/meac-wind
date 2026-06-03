/** Documented MEAC location slugs (not exhaustive — any slug string is accepted). */
export const KNOWN_SLUGS = ["hummeln", "sundsvallshamn", "helags"] as const;

export type KnownSlug = (typeof KNOWN_SLUGS)[number];

/** MEAC wind page path segment, e.g. `"hummeln"`. */
export type Slug = string;

/** Returns true when `slug` is one of the documented {@link KNOWN_SLUGS}. */
export function isKnownSlug(slug: string): slug is KnownSlug {
  return (KNOWN_SLUGS as readonly string[]).includes(slug);
}
