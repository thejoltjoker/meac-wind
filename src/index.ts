import { parseHTML } from "linkedom";
import type { FetchWindDataOptions } from "./options.js";
import { resolveFetchSignal } from "./options.js";
import { parseWindDataFromDocument } from "./parser.js";
import type { WindData } from "./schemas.js";
import { WindDataSchema } from "./schemas.js";
import { isValidSlug } from "./slug.js";
import type { KnownSlug, Slug } from "./types.js";
import { packageVersion } from "./version.js";

export type { WindData, WindStatistics, WindHistoryEntry } from "./schemas.js";
export type { FetchWindDataOptions } from "./options.js";
export type { Slug, KnownSlug } from "./types.js";
export { KNOWN_SLUGS, isKnownSlug } from "./types.js";

/** Thrown when parsed wind data fails Zod schema validation. */
export class WindDataValidationError extends Error {
  /** Human-readable issue list (`path: message`), when available from Zod. */
  readonly details?: string[];

  constructor(message: string, details?: string[]) {
    super(message);
    this.name = "WindDataValidationError";
    this.details = details;
  }
}

/** Thrown for invalid slugs, HTTP errors, HTML/parsing failures, or wrapped fetch errors. */
export class WindDataFetchError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "WindDataFetchError";
  }
}

function validateParsedData(data: WindData): WindData {
  const validationResult = WindDataSchema.safeParse(data);
  if (!validationResult.success) {
    const error = validationResult.error;
    if (error?.issues && Array.isArray(error.issues)) {
      const details = error.issues.map((e) => {
        const path = e.path?.length ? e.path.join(".") : "root";
        return `${path}: ${e.message}`;
      });
      throw new WindDataValidationError(
        `Validation failed: ${details.join(", ")}`,
        details
      );
    }
    throw new WindDataValidationError(`Validation failed: ${String(error)}`);
  }
  return validationResult.data;
}

function assertValidSlug(slug: string): void {
  if (!isValidSlug(slug)) {
    throw new WindDataFetchError(
      `Invalid slug: "${slug}". Slugs must match [a-z][a-z0-9-]{0,63} (lowercase letters, digits, hyphens).`
    );
  }
}

/**
 * Fetches and parses wind data from the MEAC wind measurement website.
 *
 * Data source: MEAC - Metrologiska Mätsystem AB (https://meac.se)
 * This package accesses publicly available wind measurement data.
 * Please use responsibly and implement rate limiting in production.
 *
 * @param slug The location slug (e.g., "hummeln", "sundsvallshamn")
 * @param options Optional {@link FetchWindDataOptions}: `signal` or `timeoutMs` (`timeoutMs` is ignored when `signal` is set)
 * @returns Validated wind data object
 * @throws {WindDataFetchError} if the slug, HTTP request, or HTML parsing fails
 * @throws {WindDataValidationError} if the parsed data fails schema validation
 * @example
 * ```ts
 * const data = await fetchWindData("hummeln");
 * console.log(data.windStrength);
 * ```
 */
export function fetchWindData(
  slug: KnownSlug,
  options?: FetchWindDataOptions
): Promise<WindData>;
export function fetchWindData(
  slug: Slug,
  options?: FetchWindDataOptions
): Promise<WindData>;
export async function fetchWindData(
  slug: Slug,
  options?: FetchWindDataOptions
): Promise<WindData> {
  assertValidSlug(slug);
  const url = `https://meac.se/sub_2/${slug}/wind.asp`;

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": `meac-wind/${packageVersion}`,
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
      },
      method: "GET",
      signal: resolveFetchSignal(options),
    });
    if (!response.ok) {
      throw new WindDataFetchError(
        `Failed to fetch URL: ${response.status} ${response.statusText}`
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    const decoder = new TextDecoder("iso-8859-1");
    const html = decoder.decode(arrayBuffer);

    const { document } = parseHTML(html);
    const data = parseWindDataFromDocument(document);
    return validateParsedData(data);
  } catch (error) {
    if (
      error instanceof WindDataValidationError ||
      error instanceof WindDataFetchError
    ) {
      throw error;
    }
    if (error instanceof Error) {
      throw new WindDataFetchError(
        `Failed to fetch wind data: ${error.message}`,
        error
      );
    }
    throw new WindDataFetchError(
      `Failed to fetch wind data: ${String(error)}`,
      error
    );
  }
}
