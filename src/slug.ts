/** MEAC path segment: lowercase letter, then letters, digits, or hyphens (max 64 chars). */
const SLUG_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}
