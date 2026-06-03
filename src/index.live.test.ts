import { describe, expect, it } from "vitest";
import { fetchWindData } from "./index.js";

const live = process.env.MEAC_LIVE === "1";

describe.skipIf(!live)("fetchWindData (live MEAC)", () => {
  it(
    "fetches hummeln from meac.se",
    async () => {
      const data = await fetchWindData("hummeln", { timeoutMs: 15_000 });
      expect(data.location.length).toBeGreaterThan(0);
      expect(data.windStrength).toBeGreaterThanOrEqual(0);
      expect(data.statistics.max).toBeGreaterThanOrEqual(data.statistics.min);
    },
    20_000
  );
});
