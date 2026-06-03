import type { WindData } from "./schemas.js";
import { parseHTML } from "linkedom";
import { WindDataSchema } from "./schemas.js";
import type { Slug } from "./types.js";
import { packageVersion } from "./version.js";

// Re-export types for consumers
export type { WindData, WindStatistics, WindHistoryEntry } from "./schemas.js";
export type { Slug, KnownSlug } from "./types.js";
export { KNOWN_SLUGS } from "./types.js";

export class WindDataValidationError extends Error {
  readonly details?: string[];

  constructor(message: string, details?: string[]) {
    super(message);
    this.name = "WindDataValidationError";
    this.details = details;
  }
}

export class WindDataFetchError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "WindDataFetchError";
    this.cause = cause;
  }
}

/**
 * Parses a Swedish number string (comma as decimal separator) to a number
 */
function parseSwedishNumber(value: string): number {
  // Remove whitespace and replace comma with dot
  const cleaned = value.trim().replace(/,/g, ".");
  // Remove units (m/s, °C, º, etc.)
  const withoutUnits = cleaned.replace(/[^\d.-]/g, "");
  const parsed = Number.parseFloat(withoutUnits);
  if (Number.isNaN(parsed)) {
    throw new TypeError(`Failed to parse number from: ${value}`);
  }
  return parsed;
}

/**
 * Extracts text content from an element, handling null cases
 */
function getTextContent(element: Element | null): string {
  if (!element) {
    throw new Error("Element not found");
  }
  const text = element.textContent?.trim() || "";
  if (!text) {
    throw new Error("Element has no text content");
  }
  return text;
}

/**
 * Finds a panel header and returns the associated data element
 */
function findPanelData(document: Document, headerText: string): Element | null {
  const headers = Array.from(document.querySelectorAll(".meac_panel_header"));
  const header = headers.find((h: Element) =>
    h.textContent?.includes(headerText)
  );
  if (!header) {
    return null;
  }
  // Find the next sibling with class "meac_data"
  let sibling = header.nextElementSibling as Element | null;
  while (sibling) {
    if (sibling.classList.contains("meac_data")) {
      return sibling;
    }
    sibling = sibling.nextElementSibling;
  }
  return null;
}

/**
 * Extracts statistics from the statistics table
 */
function extractStatistics(document: Document): {
  max: number;
  average: number;
  min: number;
} {
  const dataElements = document.querySelectorAll(".meac_data_simple");
  const values: number[] = [];

  dataElements.forEach((el: Element) => {
    const text = el.textContent?.trim() || "";
    if (text.includes("m/s")) {
      const value = parseSwedishNumber(text);
      values.push(value);
    }
  });

  // Assumes DOM order is Max, Medel (average), Min — see README if MEAC changes layout
  if (values.length < 3) {
    throw new Error(
      `Expected 3 statistics values, found ${values.length}: ${values.join(
        ", "
      )}`
    );
  }

  return {
    max: values[0],
    average: values[1],
    min: values[2],
  };
}

/**
 * Extracts history entries from javascript:alert() links
 */
function extractHistory(document: Document): Array<{
  speed: number;
  timestamp: string;
}> {
  const history: Array<{ speed: number; timestamp: string }> = [];
  // Find all links that contain javascript: alert
  const allLinks = document.querySelectorAll("a[href]");

  allLinks.forEach((link: Element) => {
    const href = link.getAttribute("href");
    if (!href || !href.includes("javascript: alert")) return;

    // Match pattern: alert('Vindstyrka: 2.1 m/s\nTidpunkt: 2026-01-24 20:10')
    // Handle various whitespace/newline encodings between m/s and Tidpunkt
    // Use [\s\S]*? to match any character including newlines (non-greedy)
    // Allow both dot and comma as decimal separator: [\d.,]+
    const match = href.match(
      /Vindstyrka:\s*([\d.,]+)\s+m\/s[\s\S]*?Tidpunkt:\s*([\d-]+\s+[\d:]+)/
    );

    if (match) {
      try {
        const speed = parseSwedishNumber(match[1]);
        const timestamp = match[2].trim();
        history.push({ speed, timestamp });
      } catch {
        // Skip this link if parsing fails
        // Continue to next link
      }
    }
  });

  return history;
}

/**
 * Parses a date string in format "YYYY-MM-DD HH:MM" to ISO string
 */
function parseDateString(dateStr: string): string {
  // Format: "2026-01-24 21:43"
  // Convert to ISO format
  const [date, time] = dateStr.split(" ");
  if (!date || !time) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  return `${date}T${time}:00`;
}

/**
 * Fetches and parses wind data from the MEAC wind measurement website.
 * 
 * Data source: MEAC - Metrologiska Mätsystem AB (https://meac.se)
 * This package accesses publicly available wind measurement data.
 * Please use responsibly and implement rate limiting in production.
 * 
 * @param slug The location slug (e.g., "hummeln", "sundsvallshamn")
 * @returns Validated wind data object
 * @throws {WindDataFetchError} if the HTTP request or HTML parsing fails
 * @throws {WindDataValidationError} if the parsed data fails schema validation
 */
export async function fetchWindData(slug: Slug): Promise<WindData> {
  const url = `https://meac.se/sub_2/${slug}/wind.asp`;

  try {
    // Fetch HTML with respectful user agent identifying this scraper
    const response = await fetch(url, {
      headers: {
        // Identify as meac-wind scraper (be transparent about automated access)
        "user-agent": `meac-wind-scraper/${packageVersion} (+https://github.com/thejoltjoker/meac-wind)`,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
      },
      method: "GET",
    });
    if (!response.ok) {
      throw new WindDataFetchError(
        `Failed to fetch URL: ${response.status} ${response.statusText}`
      );
    }
    // The website uses ISO-8859-1 encoding, so we need to decode it correctly
    // Get the response as bytes first, then decode with the correct encoding
    const arrayBuffer = await response.arrayBuffer();
    const decoder = new TextDecoder("iso-8859-1");
    const html = decoder.decode(arrayBuffer);

    // Parse HTML with linkedom
    const { document } = parseHTML(html);

    // Extract last update
    const lastUpdateElement = findPanelData(document, "Senaste uppdateringen");
    const lastUpdateText = getTextContent(lastUpdateElement);
    const lastUpdate = parseDateString(lastUpdateText);

    // Extract location
    const locationElement = findPanelData(document, "Plats");
    const location = getTextContent(locationElement);

    // Extract wind strength
    const windStrengthElement = findPanelData(document, "Vindstyrka");
    const windStrengthText = getTextContent(windStrengthElement);
    const windStrength = parseSwedishNumber(windStrengthText);

    // Extract temperature
    const temperatureElement = findPanelData(document, "Temperatur");
    const temperatureText = getTextContent(temperatureElement);
    const temperature = parseSwedishNumber(temperatureText);

    // Extract wind direction
    const windDirectionElement = findPanelData(document, "Vindriktning");
    const windDirectionText = getTextContent(windDirectionElement);
    const windDirection = parseSwedishNumber(windDirectionText);

    // Extract statistics
    const statistics = extractStatistics(document);

    // Extract history
    const history = extractHistory(document);

    // Build data object
    const data: WindData = {
      lastUpdate,
      location,
      windStrength,
      temperature,
      windDirection,
      statistics,
      history,
    };

    // Validate with Zod
    const validationResult = WindDataSchema.safeParse(data);
    if (!validationResult.success) {
      const error = validationResult.error;
      if (error && error.issues && Array.isArray(error.issues)) {
        const details = error.issues.map((e) => {
          const path = e.path && e.path.length > 0 ? e.path.join(".") : "root";
          return `${path}: ${e.message}`;
        });
        const errorMessages = details
          .map((e) => {
            return e;
          })
          .join(", ");
        throw new WindDataValidationError(
          `Validation failed: ${errorMessages}`,
          details
        );
      } else {
        throw new WindDataValidationError(
          `Validation failed: ${String(error)}`
        );
      }
    }

    return validationResult.data;
  } catch (error) {
    if (error instanceof WindDataValidationError) {
      throw error;
    }
    if (error instanceof WindDataFetchError) {
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
