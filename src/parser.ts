import type { WindData, WindStatistics } from "./schemas.js";

/**
 * Parses a Swedish number string (comma as decimal separator) to a number.
 * @throws {TypeError} when the value cannot be parsed
 */
function parseSwedishNumber(value: string): number {
  const cleaned = value.trim().replace(/,/g, ".");
  const withoutUnits = cleaned.replace(/[^\d.-]/g, "");
  const parsed = Number.parseFloat(withoutUnits);
  if (Number.isNaN(parsed)) {
    throw new TypeError(`Failed to parse number from: ${value}`);
  }
  return parsed;
}

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

function findPanelData(document: Document, headerText: string): Element | null {
  const headers = Array.from(document.querySelectorAll(".meac_panel_header"));
  const header = headers.find((h: Element) =>
    h.textContent?.includes(headerText)
  );
  if (!header) {
    return null;
  }
  let sibling = header.nextElementSibling as Element | null;
  while (sibling) {
    if (sibling.classList.contains("meac_data")) {
      return sibling;
    }
    sibling = sibling.nextElementSibling;
  }
  return null;
}

function extractStatisticByLabel(document: Document, label: string): number {
  const labels = Array.from(document.querySelectorAll(".meac_label"));
  const labelEl = labels.find((el) => el.textContent?.trim() === label);
  if (!labelEl) {
    throw new Error(`Statistic label not found: ${label}`);
  }
  const row = labelEl.closest("tr");
  if (!row) {
    throw new Error(`Statistic row not found for label: ${label}`);
  }
  const dataEl = row.querySelector(".meac_data_simple");
  const text = dataEl?.textContent?.trim() || "";
  if (!text.includes("m/s")) {
    throw new Error(`Statistic value not found for label: ${label}`);
  }
  return parseSwedishNumber(text);
}

function assertStatisticsOrdering(statistics: WindStatistics): void {
  const { max, average, min } = statistics;
  if (max < average || average < min) {
    throw new Error(
      `Invalid statistics ordering: max=${max}, average=${average}, min=${min}`
    );
  }
}

function extractStatistics(document: Document): WindStatistics {
  const statistics: WindStatistics = {
    max: extractStatisticByLabel(document, "Max"),
    average: extractStatisticByLabel(document, "Medel"),
    min: extractStatisticByLabel(document, "Min"),
  };
  assertStatisticsOrdering(statistics);
  return statistics;
}

function extractHistory(document: Document): WindData["history"] {
  const history: WindData["history"] = [];
  const allLinks = document.querySelectorAll("a[href]");

  allLinks.forEach((link: Element) => {
    const href = link.getAttribute("href");
    if (!href || !href.includes("javascript: alert")) return;

    const match = href.match(
      /Vindstyrka:\s*([\d.,]+)\s+m\/s[\s\S]*?Tidpunkt:\s*([\d-]+\s+[\d:]+)/
    );

    if (match) {
      try {
        const speed = parseSwedishNumber(match[1]);
        const timestamp = match[2].trim();
        history.push({ speed, timestamp });
      } catch {
        // Skip malformed history links
      }
    }
  });

  return history;
}

/**
 * Converts MEAC's `YYYY-MM-DD HH:MM` display string to `YYYY-MM-DDTHH:MM:SS`.
 * No timezone is applied; invalid calendar dates are not rejected here.
 */
function parseDateString(dateStr: string): string {
  const [date, time] = dateStr.split(" ");
  if (!date || !time) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  return `${date}T${time}:00`;
}

/**
 * @internal
 * Parses a MEAC wind page document into a wind data object (before Zod validation).
 * Not exported from the package entry point; intended for tests and advanced use.
 */
export function parseWindDataFromDocument(document: Document): WindData {
  const lastUpdateElement = findPanelData(document, "Senaste uppdateringen");
  const lastUpdateText = getTextContent(lastUpdateElement);
  const lastUpdate = parseDateString(lastUpdateText);

  const locationElement = findPanelData(document, "Plats");
  const location = getTextContent(locationElement);

  const windStrengthElement = findPanelData(document, "Vindstyrka");
  const windStrengthText = getTextContent(windStrengthElement);
  const windStrength = parseSwedishNumber(windStrengthText);

  const temperatureElement = findPanelData(document, "Temperatur");
  const temperatureText = getTextContent(temperatureElement);
  const temperature = parseSwedishNumber(temperatureText);

  const windDirectionElement = findPanelData(document, "Vindriktning");
  const windDirectionText = getTextContent(windDirectionElement);
  const windDirection = parseSwedishNumber(windDirectionText);

  const statistics = extractStatistics(document);
  const history = extractHistory(document);

  return {
    lastUpdate,
    location,
    windStrength,
    temperature,
    windDirection,
    statistics,
    history,
  };
}
