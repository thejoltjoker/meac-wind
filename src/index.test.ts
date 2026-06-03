import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchWindData,
  WindDataFetchError,
  WindDataValidationError,
} from "./index.js";
import { WindDataSchema } from "./schemas.js";
import { isValidSlug } from "./slug.js";
import { isKnownSlug, KNOWN_SLUGS } from "./types.js";

/**
 * Helper to create a mock response with arrayBuffer for encoding tests
 * Converts UTF-8 test HTML to ISO-8859-1 bytes to simulate the real website
 */
function createMockResponse(html: string): Response {
  // Convert UTF-8 string to ISO-8859-1 bytes
  // We need to map each character to its ISO-8859-1 byte value
  const bytes = new Uint8Array(html.length);
  for (let i = 0; i < html.length; i++) {
    const char = html[i];
    const codePoint = char.charCodeAt(0);
    // ISO-8859-1 covers 0x00-0xFF, so we can use the code point directly
    // For characters outside this range, we'll use a fallback
    if (codePoint <= 0xff) {
      bytes[i] = codePoint;
    } else {
      // Map common Swedish characters to ISO-8859-1
      const charMap: Record<string, number> = {
        Å: 0xc5,
        å: 0xe5,
        Ä: 0xc4,
        ä: 0xe4,
        Ö: 0xd6,
        ö: 0xf6,
      };
      bytes[i] = charMap[char] || 0x3f; // 0x3F is '?'
    }
  }

  return {
    ok: true,
    arrayBuffer: async () => bytes.buffer,
  } as Response;
}

// Sample HTML based on the actual website structure
const sampleHTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Vindmätare på Hummeln Åre</title>
</head>
<body>
  <table>
    <tr>
      <td>
        <table>
          <tr>
            <td class="meac_panel_bg_dark">
              <div id="meac_app_version">Vindmätare v2.0</div>
            </td>
            <td class="meac_panel_bg">
              <div class="meac_panel_header">Senaste uppdateringen</div>
              <div class="meac_data">2026-01-24 21:43</div>
            </td>
            <td class="meac_panel_bg">
              <div class="meac_panel_header">Plats</div>
              <div class="meac_data">Hummeln Åre</div>
            </td>
          </tr>
          <tr>
            <td class="meac_panel_bg">
              <div class="meac_panel_header">Vindstyrka</div>
              <div class="meac_data">1.9 m/s</div>
            </td>
            <td class="meac_panel_bg">
              <div class="meac_panel_header">Temperatur</div>
              <div class="meac_data">-14,4 ºC</div>
            </td>
            <td class="meac_panel_bg">
              <div class="meac_panel_header">Vindriktning</div>
              <div class="meac_data">30º</div>
            </td>
          </tr>
          <tr>
            <td class="meac_panel_bg">
              <div class="meac_panel_header">Statistik</div>
              <div>För de 10 senaste minuterna</div>
              <table>
                <tr>
                  <td><span class="meac_label">Max</span></td>
                  <td><span class="meac_data_simple">2.4 m/s</span></td>
                </tr>
                <tr>
                  <td><span class="meac_label">Medel</span></td>
                  <td><span class="meac_data_simple">0.9 m/s</span></td>
                </tr>
                <tr>
                  <td><span class="meac_label">Min</span></td>
                  <td><span class="meac_data_simple">0.5 m/s</span></td>
                </tr>
              </table>
            </td>
            <td class="meac_panel_bg">
              <div class="meac_panel_header">Historik för medelvind</div>
              <table>
                <tr>
                  <td>
                    <a href="javascript: alert('Vindstyrka: 2.1 m/s\nTidpunkt: 2026-01-24 20:10');">
                      <img src="spacer.gif" alt="2.1 m/s [ 2026-01-24 20:10 ]" />
                    </a>
                  </td>
                  <td>
                    <a href="javascript: alert('Vindstyrka: 1.9 m/s\nTidpunkt: 2026-01-24 20:20');">
                      <img src="spacer.gif" alt="1.9 m/s [ 2026-01-24 20:20 ]" />
                    </a>
                  </td>
                  <td>
                    <a href="javascript: alert('Vindstyrka: 1.4 m/s\nTidpunkt: 2026-01-24 20:30');">
                      <img src="spacer.gif" alt="1.4 m/s [ 2026-01-24 20:30 ]" />
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

describe("fetchWindData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should successfully scrape and parse wind data", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(sampleHTML));

    const result = await fetchWindData("hummeln");

    expect(result).toMatchObject({
      lastUpdate: "2026-01-24T21:43:00",
      location: "Hummeln Åre",
      windStrength: 1.9,
      temperature: -14.4,
      windDirection: 30,
      statistics: {
        max: 2.4,
        average: 0.9,
        min: 0.5,
      },
      history: [
        { speed: 2.1, timestamp: "2026-01-24 20:10" },
        { speed: 1.9, timestamp: "2026-01-24 20:20" },
        { speed: 1.4, timestamp: "2026-01-24 20:30" },
      ],
    });

    expect(result.history).toHaveLength(3);
    expect(result.windStrength).toBeGreaterThanOrEqual(0);
    expect(result.windDirection).toBeGreaterThanOrEqual(0);
    expect(result.windDirection).toBeLessThanOrEqual(360);
  });

  it("should handle Swedish number format (comma decimal separator)", async () => {
    const htmlWithComma = sampleHTML.replace("-14,4", "-15,7");
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(htmlWithComma));

    const result = await fetchWindData("hummeln");
    expect(result.temperature).toBe(-15.7);
  });

  it("should parse wind speeds with comma decimal separator", async () => {
    const htmlWithCommaSpeed = sampleHTML.replace("1.9 m/s", "2,3 m/s");
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(htmlWithCommaSpeed));

    const result = await fetchWindData("hummeln");
    expect(result.windStrength).toBe(2.3);
  });

  it("should extract all history entries from javascript:alert() links", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(sampleHTML));

    const result = await fetchWindData("hummeln");
    expect(result.history.length).toBeGreaterThan(0);
    result.history.forEach((entry) => {
      expect(entry).toHaveProperty("speed");
      expect(entry).toHaveProperty("timestamp");
      expect(typeof entry.speed).toBe("number");
      expect(typeof entry.timestamp).toBe("string");
    });
  });

  it("should handle network errors", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    await expect(fetchWindData("hummeln")).rejects.toThrow(
      "Failed to fetch wind data"
    );
  });

  it("should handle HTTP errors", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    } as Response);

    await expect(fetchWindData("hummeln")).rejects.toThrow(
      "Failed to fetch URL: 404 Not Found"
    );
    await expect(fetchWindData("hummeln")).rejects.toBeInstanceOf(
      WindDataFetchError
    );
  });

  it("should handle malformed HTML", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        createMockResponse("<html><body>Invalid HTML</body></html>")
      );

    await expect(fetchWindData("hummeln")).rejects.toThrow(
      "Failed to fetch wind data"
    );
  });

  it("should handle missing data fields", async () => {
    const incompleteHTML = `
      <html>
        <body>
          <div class="meac_panel_header">Some other header</div>
        </body>
      </html>
    `;

    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(incompleteHTML));

    await expect(fetchWindData("hummeln")).rejects.toThrow(
      "Failed to fetch wind data"
    );
  });

  it("should handle missing statistics", async () => {
    const htmlWithoutStats = sampleHTML.replace(
      /<span class="meac_data_simple">[\d.]+ m\/s<\/span>/g,
      ""
    );

    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(htmlWithoutStats));

    await expect(fetchWindData("hummeln")).rejects.toThrow(
      "Failed to fetch wind data"
    );
  });

  it("should handle empty history", async () => {
    // Remove all links with javascript: alert in href, handling newlines
    const htmlWithoutHistory = sampleHTML.replace(
      /<a href="javascript: alert[^"]*">[\s\S]*?<\/a>/g,
      ""
    );

    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(htmlWithoutHistory));

    const result = await fetchWindData("hummeln");
    expect(result.history).toEqual([]);
  });

  it("should validate wind direction is between 0 and 360", async () => {
    const htmlWithInvalidDirection = sampleHTML.replace("30º", "370º");

    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(htmlWithInvalidDirection));

    await expect(fetchWindData("hummeln")).rejects.toThrow("Validation failed");
    await expect(fetchWindData("hummeln")).rejects.toBeInstanceOf(
      WindDataValidationError
    );
  });

  it("should validate wind strength is non-negative", async () => {
    const htmlWithNegativeWind = sampleHTML.replace("1.9 m/s", "-1.0 m/s");

    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(htmlWithNegativeWind));

    await expect(fetchWindData("hummeln")).rejects.toThrow("Validation failed");
  });

  it("should use custom slug when provided", async () => {
    const customSlug = "sundsvallshamn";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createMockResponse(sampleHTML));
    globalThis.fetch = fetchMock;

    await fetchWindData(customSlug);

    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://meac.se/sub_2/${customSlug}/wind.asp`
    );
  });

  it("should reject invalid slugs before fetching", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    for (const slug of ["", "../evil", "foo/bar", "UPPER", "a b"]) {
      await expect(fetchWindData(slug)).rejects.toBeInstanceOf(
        WindDataFetchError
      );
      await expect(fetchWindData(slug)).rejects.toThrow("Invalid slug");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should pass AbortSignal to fetch when provided", async () => {
    const controller = new AbortController();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createMockResponse(sampleHTML));
    globalThis.fetch = fetchMock;

    await fetchWindData("hummeln", { signal: controller.signal });

    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it("should pass timeout AbortSignal when timeoutMs is set", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createMockResponse(sampleHTML));
    globalThis.fetch = fetchMock;

    await fetchWindData("hummeln", { timeoutMs: 5000 });

    expect(fetchMock.mock.calls[0][1]?.signal).toBeDefined();
  });

  it("should wrap fetch errors with native Error cause", async () => {
    const networkError = new Error("Network error");
    globalThis.fetch = vi.fn().mockRejectedValue(networkError);

    try {
      await fetchWindData("hummeln");
    } catch (error) {
      expect(error).toBeInstanceOf(WindDataFetchError);
      expect((error as WindDataFetchError).cause).toBe(networkError);
    }
  });

  it("should parse statistics by label when table rows are reordered", async () => {
    const reorderedStatsHtml = sampleHTML.replace(
      /<tr>\s*<td><span class="meac_label">Max<\/span><\/td>[\s\S]*?<td><span class="meac_data_simple">0.5 m\/s<\/span><\/td>\s*<\/tr>\s*<tr>\s*<td><span class="meac_label">Medel<\/span><\/td>[\s\S]*?<td><span class="meac_data_simple">0.9 m\/s<\/span><\/td>\s*<\/tr>\s*<tr>\s*<td><span class="meac_label">Min<\/span><\/td>[\s\S]*?<td><span class="meac_data_simple">2.4 m\/s<\/span><\/td>\s*<\/tr>/,
      `<tr>
                  <td><span class="meac_label">Min</span></td>
                  <td><span class="meac_data_simple">0.5 m/s</span></td>
                </tr>
                <tr>
                  <td><span class="meac_label">Medel</span></td>
                  <td><span class="meac_data_simple">0.9 m/s</span></td>
                </tr>
                <tr>
                  <td><span class="meac_label">Max</span></td>
                  <td><span class="meac_data_simple">2.4 m/s</span></td>
                </tr>`
    );

    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(reorderedStatsHtml));

    const result = await fetchWindData("hummeln");
    expect(result.statistics).toMatchObject({
      max: 2.4,
      average: 0.9,
      min: 0.5,
    });
  });

  it("should fail when a statistics label is missing", async () => {
    const htmlWithoutMedel = sampleHTML.replace(
      '<span class="meac_label">Medel</span>',
      '<span class="meac_label">Snitt</span>'
    );

    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(htmlWithoutMedel));

    await expect(fetchWindData("hummeln")).rejects.toThrow(
      "Statistic label not found: Medel"
    );
  });

  it("should fail when a statistics row has no wind speed value", async () => {
    const htmlWithBadMedel = sampleHTML.replace(
      '<td><span class="meac_data_simple">0.9 m/s</span></td>',
      '<td><span class="meac_data_simple">n/a</span></td>'
    );

    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(htmlWithBadMedel));

    await expect(fetchWindData("hummeln")).rejects.toThrow(
      "Statistic value not found for label: Medel"
    );
  });

  it("should fail when statistics values violate max >= average >= min", async () => {
    const htmlWithInvertedMax = sampleHTML.replace(
      '<td><span class="meac_data_simple">2.4 m/s</span></td>',
      '<td><span class="meac_data_simple">0.1 m/s</span></td>'
    );

    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(htmlWithInvertedMax));

    await expect(fetchWindData("hummeln")).rejects.toBeInstanceOf(
      WindDataFetchError
    );
    await expect(fetchWindData("hummeln")).rejects.toThrow(
      "Invalid statistics ordering"
    );
  });

  it("should handle history entries with comma decimal separator", async () => {
    const htmlWithCommaHistory = sampleHTML.replace(
      "Vindstyrka: 2.1 m/s",
      "Vindstyrka: 2,5 m/s"
    );

    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(htmlWithCommaHistory));

    const result = await fetchWindData("hummeln");
    expect(result.history[0].speed).toBe(2.5);
  });

  it("should fail when a number cannot be parsed", async () => {
    const htmlWithBadNumber = sampleHTML.replace("1.9 m/s", "not-a-number m/s");
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(htmlWithBadNumber));

    await expect(fetchWindData("hummeln")).rejects.toBeInstanceOf(
      WindDataFetchError
    );
    await expect(fetchWindData("hummeln")).rejects.toThrow(
      "Failed to fetch wind data: Failed to parse number"
    );
  });

  it("should fail when a required element exists but has no text content", async () => {
    const htmlWithEmptyLocation = sampleHTML.replace(
      '<div class="meac_data">Hummeln Åre</div>',
      '<div class="meac_data">   </div>'
    );
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(htmlWithEmptyLocation));

    await expect(fetchWindData("hummeln")).rejects.toBeInstanceOf(
      WindDataFetchError
    );
    await expect(fetchWindData("hummeln")).rejects.toThrow(
      "Failed to fetch wind data: Element has no text content"
    );
  });

  it("should fail when a panel header exists but has no associated .meac_data sibling", async () => {
    const htmlWithMissingPanelData = sampleHTML.replace(
      /<div class="meac_panel_header">Plats<\/div>\s*<div class="meac_data">Hummeln Åre<\/div>/,
      '<div class="meac_panel_header">Plats</div><div class="something_else">Hummeln Åre</div>'
    );
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(htmlWithMissingPanelData));

    await expect(fetchWindData("hummeln")).rejects.toBeInstanceOf(
      WindDataFetchError
    );
    await expect(fetchWindData("hummeln")).rejects.toThrow(
      "Failed to fetch wind data: Element not found"
    );
  });

  it("should fail when the last update timestamp format is invalid", async () => {
    const htmlWithBadDate = sampleHTML.replace(
      "2026-01-24 21:43",
      "2026-01-24"
    );
    globalThis.fetch = vi.fn().mockResolvedValue(createMockResponse(htmlWithBadDate));

    await expect(fetchWindData("hummeln")).rejects.toBeInstanceOf(
      WindDataFetchError
    );
    await expect(fetchWindData("hummeln")).rejects.toThrow(
      "Failed to fetch wind data: Invalid date format"
    );
  });

  it("should wrap non-Error thrown values in WindDataFetchError", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue("boom");

    await expect(fetchWindData("hummeln")).rejects.toBeInstanceOf(
      WindDataFetchError
    );
    await expect(fetchWindData("hummeln")).rejects.toThrow(
      "Failed to fetch wind data: boom"
    );
  });

  it("should ignore unrelated links and history links that do not match the expected pattern", async () => {
    const htmlWithExtraLinks = sampleHTML.replace(
      "</body>",
      `
        <a href="">empty href</a>
        <a href="https://example.com">external</a>
        <a href="javascript: alert('no match here');">bad history</a>
      </body>
      `
    );

    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(htmlWithExtraLinks));

    const result = await fetchWindData("hummeln");
    expect(result.history).toHaveLength(3);
  });

  it("should ignore statistics entries that are not wind speed values", async () => {
    const htmlWithExtraStat = sampleHTML.replace(
      '<td><span class="meac_data_simple">2.4 m/s</span></td>',
      '<td><span class="meac_data_simple">2.4 m/s</span><span class="meac_data_simple"></span></td>'
    );

    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(htmlWithExtraStat));

    const result = await fetchWindData("hummeln");
    expect(result.statistics).toMatchObject({ max: 2.4, average: 0.9, min: 0.5 });
  });
});

describe("slug and type helpers", () => {
  it("validates known slugs", () => {
    for (const slug of KNOWN_SLUGS) {
      expect(isValidSlug(slug)).toBe(true);
      expect(isKnownSlug(slug)).toBe(true);
    }
  });

  it("rejects invalid slugs via isValidSlug", () => {
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug("../x")).toBe(false);
    expect(isKnownSlug("unknown-place")).toBe(false);
  });
});

describe("resolveFetchSignal", () => {
  it("should reject non-positive timeoutMs", async () => {
    const { resolveFetchSignal } = await import("./options.js");
    expect(() => resolveFetchSignal({ timeoutMs: 0 })).toThrow(RangeError);
  });
});

describe("WindDataSchema", () => {
  const validPayload = {
    lastUpdate: "2026-01-24T21:43:00",
    location: "Hummeln Åre",
    windStrength: 1.9,
    temperature: -14.4,
    windDirection: 30,
    statistics: { max: 2.4, average: 0.9, min: 0.5 },
    history: [{ speed: 2.1, timestamp: "2026-01-24 20:10" }],
  };

  it("accepts a valid payload", () => {
    expect(WindDataSchema.safeParse(validPayload).success).toBe(true);
  });

  it("rejects lastUpdate strings outside YYYY-MM-DDTHH:MM:SS", () => {
    const result = WindDataSchema.safeParse({
      ...validPayload,
      lastUpdate: "2026-01-24 21:43",
    });
    expect(result.success).toBe(false);
  });
});

describe("fetchWindData validation fallback branches", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("should throw WindDataValidationError even if schema error has no issues array", async () => {
    vi.doMock("./schemas.js", async (importOriginal) => {
      const original = await importOriginal<typeof import("./schemas.js")>();
      return {
        ...original,
        WindDataSchema: {
          safeParse: () => ({ success: false, error: { issues: null } }),
        },
      };
    });

    const { fetchWindData: fetchWindDataMocked, WindDataValidationError: WindDataValidationErrorMocked } =
      await import("./index.js");

    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(sampleHTML));

    await expect(fetchWindDataMocked("hummeln")).rejects.toBeInstanceOf(
      WindDataValidationErrorMocked
    );
    await expect(fetchWindDataMocked("hummeln")).rejects.toThrow(
      "Validation failed:"
    );
  });

  it('should label validation issues with empty path as "root"', async () => {
    vi.doMock("./schemas.js", async (importOriginal) => {
      const original = await importOriginal<typeof import("./schemas.js")>();
      return {
        ...original,
        WindDataSchema: {
          safeParse: () => ({
            success: false,
            error: { issues: [{ path: [], message: "bad" }] },
          }),
        },
      };
    });

    const { fetchWindData: fetchWindDataMocked } = await import("./index");

    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(sampleHTML));

    await expect(fetchWindDataMocked("hummeln")).rejects.toThrow(
      "Validation failed: root: bad"
    );
  });
});
