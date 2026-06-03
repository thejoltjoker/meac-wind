# meac-wind

TypeScript client for fetching and parsing public MEAC wind page data.

## Data source & usage

This package fetches and parses publicly available wind measurement data from [MEAC](https://meac.se/sub_2/vind.asp) (Metrologiska Mätsystem AB), a Swedish company specializing in meteorological measurement systems.

**Data credit:** Wind measurement data © MEAC - Metrologiska Mätsystem AB

This is an **unofficial** package — not affiliated with or endorsed by MEAC. It may break if MEAC changes their website. The MIT license applies to this package's code only, not to the source data.

### Allowed use

- Personal projects — learning, hobby dashboards
- Research — academic or weather analysis
- Low-frequency access — occasional fetches with caching
- Attribution — credit MEAC when displaying data

### Best practices

1. **Rate limiting** — cache responses (at least 1 minute between requests); use exponential backoff on retries
2. **Identification** — use a transparent user-agent that identifies your app (see [Best practices](#best-practices-for-production-use))
3. **Attribution** — credit MEAC and link to https://meac.se in your UI
4. **Error handling** — respect HTTP 429/503; don't retry indefinitely

### Prohibited use

- High-frequency automated fetching (don't treat this as a real-time API)
- Commercial redistribution of MEAC's data
- Server abuse or circumventing blocks if MEAC restricts access

### High-volume or commercial use

For real-time access, sub-minute updates, commercial apps, or SLAs, contact [MEAC](https://meac.se) directly — they may offer API access, data feeds, or licensing.

If you represent MEAC and have concerns about this package, open an issue on the GitHub repository or contact the maintainer. Takedown or operational change requests will be honored promptly.

## What it does

- Fetches the MEAC wind page HTML.
- Decodes the response as `iso-8859-1`.
- Under the hood, uses HTML scraping to parse the source page structure.
- Extracts:
  - Last update timestamp
  - Location
  - Current wind strength
  - Temperature
  - Wind direction
  - Statistics (`max`, `average`, `min`) — parsed in DOM order (Max → Medel → Min)
  - Wind history from `javascript: alert(...)` links
- Validates the final payload with Zod.

## Installation

This package is **ESM-only** (`"type": "module"`). Use `import` in Node 18+ or a bundler that supports ESM.

```bash
npm install meac-wind
```

## Main API

The public entry point is `fetchWindData`. It requires a location slug parameter.

```ts
import { fetchWindData } from "meac-wind";

// Get data from Hummeln Åre
const data = await fetchWindData("hummeln");
console.log(data);
```

Documented location slugs (see `KNOWN_SLUGS`); any MEAC path slug string is accepted:

```ts
import { fetchWindData, KNOWN_SLUGS } from "meac-wind";

console.log(KNOWN_SLUGS); // ["hummeln", "sundsvallshamn", "helags"]
```

```ts
import { fetchWindData } from "meac-wind";

// Get data from Sundsvalls hamn
const data = await fetchWindData("sundsvallshamn");

// Get data from Helags
const data = await fetchWindData("helags");

// Or use any other MEAC location slug
const data = await fetchWindData("your-location-slug");
```

## TypeScript Support

The package includes TypeScript definitions. Import types as needed:

```ts
import {
  fetchWindData,
  KNOWN_SLUGS,
  WindDataFetchError,
  WindDataValidationError,
  type WindData,
  type WindStatistics,
  type Slug,
} from "meac-wind";
```

## Returned data shape

```ts
type WindHistoryEntry = {
  speed: number;
  timestamp: string;
};

type WindStatistics = {
  max: number;
  average: number;
  min: number;
};

type WindData = {
  lastUpdate: string; // ISO-like timestamp: YYYY-MM-DDTHH:MM:SS
  location: string;
  windStrength: number;
  temperature: number;
  windDirection: number; // 0..360
  statistics: WindStatistics;
  history: WindHistoryEntry[];
};
```

## Validation rules

Validation is implemented in `src/schemas.ts`:

- `lastUpdate` must match `YYYY-MM-DDTHH:MM:SS` (parser output format).
- `windStrength`, statistics values, and history `speed` are non-negative.
- `windDirection` must be between `0` and `360`.
- `history` is an array of `{ speed, timestamp }`.

Statistics are read from `.meac_data_simple` elements in page order. If MEAC reorders labels or markup, `max` / `average` / `min` may be wrong until the parser is updated.

## Best practices for production use

### 1. Implement Rate Limiting

```typescript
import { fetchWindData } from "meac-wind";

// Cache data and don't fetch more than once per minute
let cachedData: WindData | null = null;
let lastFetch = 0;

async function getCachedWindData(slug: string) {
  const now = Date.now();
  if (cachedData && now - lastFetch < 60000) {
    // 1 minute cache
    return cachedData;
  }
  cachedData = await fetchWindData(slug);
  lastFetch = now;
  return cachedData;
}
```

### 2. Handle Errors Gracefully

`fetchWindData` throws `WindDataFetchError` (network, HTTP, or parse failures) or `WindDataValidationError` (schema mismatch). Both extend `Error`.

```typescript
import {
  fetchWindData,
  WindDataFetchError,
  WindDataValidationError,
} from "meac-wind";

try {
  const data = await fetchWindData("hummeln");
  console.log(data);
} catch (error) {
  if (error instanceof WindDataValidationError) {
    console.error("Invalid parsed data:", error.details);
  } else if (error instanceof WindDataFetchError) {
    console.error("Fetch or parse failed:", error.message, error.cause);
  }
}
```

### 3. Identify your app

The package sends a transparent user-agent (`meac-wind-scraper/...`). Forks and apps built on top should use their own identifier with a contact URL, for example:

```typescript
"user-agent": "my-wind-dashboard/1.0 (+https://github.com/you/my-app)"
```

## Releases

Releases are automated with [release-please](https://github.com/googleapis/release-please) on `main`. Typical flow:

1. Work on a feature branch or `dev`; open PRs into `dev` (or directly to `main` if you prefer).
2. Squash-merge into `dev`, then squash-merge `dev` → `main` when ready.
3. On `main`, release-please opens or updates a **Release PR** (version bump + `CHANGELOG.md`).
4. Merge that Release PR on `main` to create the GitHub release and publish to npm.

### Commit messages

release-please reads [Conventional Commits](https://www.conventionalcommits.org/) on `main`. For squash merges, set the **squash commit title** to a conventional message (often the PR title), e.g. `feat: add Sundsvall slug` or `fix: handle empty wind history`.

### npm trusted publishing (one-time setup)

Publishing uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) (OIDC) — no `NPM_TOKEN` in GitHub secrets.

On [npmjs.com](https://www.npmjs.com/) → package **meac-wind** → **Settings** → **Trusted Publisher** → **GitHub Actions**, set:

| Field | Value |
| --- | --- |
| Organization or user | `thejoltjoker` |
| Repository | `meac-wind` |
| Workflow filename | `release-please.yml` |

Enable **Require two-factor authentication** and **Disallow tokens** on the package if you want publish-only-via-OIDC.

In the repo, enable **Settings → Actions → General → Allow GitHub Actions to create and approve pull requests** so release-please can open Release PRs.

## Development

### Building

```bash
npm run build
```

This compiles TypeScript files from `src/` to `dist/`.

### Testing

```bash
npm test          # Run tests once
npm run test:watch # Run tests in watch mode
```

### Source Files

Current source files:

- `src/index.ts` - fetch and parse logic (HTML scraping under the hood).
- `src/schemas.ts` - Zod schemas and exported types.
- `src/types.ts` - TypeScript type definitions.
- `src/index.test.ts` - Vitest tests with mocked fetch responses.

The test suite uses Vitest with mocked `fetch` responses and checks:

- successful parsing for normal and Swedish numeric formats
- slug-based URL construction
- handling of malformed or missing HTML
- validation failures for invalid ranges and `lastUpdate` format
- custom error types and edge cases in the validation error path

## License & disclaimer

**Code:** [MIT](LICENSE.md) — applies to this repository's source and documentation only, not to wind data fetched from MEAC or other third parties.

**Disclaimer:** This package is an unofficial community tool, not a meteorological service. MEAC names and data remain the property of their respective owners; references are for identification and attribution only.

Use at your own risk. The software and any parsed data are provided **"as is"** without warranty of accuracy, completeness, timeliness, or continued availability. The parser may break if MEAC changes their site, and access may be restricted at any time.

**Do not rely on this for safety-critical decisions** (aviation, maritime, mountaineering, emergency response, construction, or similar). For authoritative or licensed data, contact [MEAC](https://meac.se) directly.

You are responsible for how you use this package - including compliance with applicable laws, website terms, rate limits, and intellectual-property rights. The maintainer does not encourage excessive automated access, circumvention of blocks, or redistribution of third-party data against applicable policies.

There is no guarantee of maintenance or support. To the extent permitted by law, liability is limited as described in [LICENSE.md](LICENSE.md). If you represent a rights holder with concerns, open a [GitHub issue](https://github.com/thejoltjoker/meac-wind/issues) and good-faith requests will be honored promptly.
