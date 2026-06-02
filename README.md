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

### Required practices

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
  - Statistics (`max`, `average`, `min`)
  - Wind history from `javascript: alert(...)` links
- Validates the final payload with Zod.

## Installation

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

Available location slugs include:

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

- `windStrength`, statistics values, and history `speed` are non-negative.
- `windDirection` must be between `0` and `360`.
- `history` is an array of `{ speed, timestamp }`.

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

```typescript
try {
  const data = await fetchWindData("hummeln");
  console.log(data);
} catch (error) {
  console.error("Failed to fetch wind data:", error);
  // Use cached/fallback data or show user-friendly error
}
```

### 3. Identify your app

The package sends a transparent user-agent (`meac-wind-scraper/...`). Forks and apps built on top should use their own identifier with a contact URL, for example:

```typescript
"user-agent": "my-wind-dashboard/1.0 (+https://github.com/you/my-app)"
```

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

The test suite expects a Vitest setup and checks:

- successful parsing for normal and Swedish numeric formats
- handling of malformed/missing data
- validation failures for invalid ranges
- default and custom URL behavior

## Publishing

Releases are automated with GitHub Actions + release-please.

### One-time setup

1. Add an npm automation token as a GitHub Actions secret named `NPM_TOKEN`.
2. Ensure your default branch is `main`.
3. Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, etc.) for merge commits so release-please can infer version bumps.

### Release flow

1. Push/merge changes to `main`.
2. `Release Please` opens or updates a release PR with version/changelog updates.
3. Merge the release PR when ready.
4. release-please creates a GitHub release and tag.
5. `Publish to npm` workflow publishes the tagged release to npm automatically.

The CI workflow (`CI`) runs build + tests on push and pull requests.

## License

MIT — see [LICENSE.md](LICENSE.md).
