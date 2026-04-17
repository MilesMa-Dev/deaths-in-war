# Deaths in War

> Every number is a life. Every dot on the map is a community's home.

An interactive world map that visualizes ongoing armed conflicts worldwide and their human cost. Data is automatically scraped daily from Wikipedia's [List of ongoing armed conflicts](https://en.wikipedia.org/wiki/List_of_ongoing_armed_conflicts), with affected regions derived from [UCDP GED](https://ucdp.uu.se/downloads/) (Uppsala Conflict Data Program).

## Why This Project?

War is not an abstraction. Behind every statistic are real people — parents, children, friends — whose lives have been cut short or irreversibly shattered.

Yet for most of us, conflicts happening thousands of miles away remain invisible. A headline scrolls past; a number is forgotten. We built this project because **numbers deserve to be felt, not just read**.

By placing every ongoing conflict on a world map — scaled by death toll, colored by intensity — we hope to make the human cost of war harder to ignore. Not to assign blame or take sides, but to ask a simple question:

**How much longer?**

If this visualization makes even one person pause and reflect, it has served its purpose.

🕊 *We stand for peace.*

## What It Does

- Scrapes Wikipedia daily for up-to-date data on all ongoing armed conflicts
- Renders an interactive **world map** with conflict markers sized by cumulative death toll
- Classifies conflicts by intensity: major wars, wars, minor conflicts, and skirmishes
- Shows affected regions per conflict using UCDP georeferenced event data!

## Data Sources

| Source | What it provides | Update frequency |
|--------|-----------------|------------------|
| [Wikipedia](https://en.wikipedia.org/wiki/List_of_ongoing_armed_conflicts) | Conflict names, locations, death tolls, intensity levels | Daily (auto-scraped) |
| [UCDP GED](https://ucdp.uu.se/downloads/) | Affected regions with georeferenced event coordinates | Yearly (stable) / Monthly (candidate) |

## Live Demo

https://www.deaths-in-war.com

## Getting Started

```bash
cd frontend
npm install
npm run dev             # http://localhost:5173
```

The API runs as Vercel Serverless Functions alongside the frontend. A daily Vercel Cron job at 03:00 UTC triggers `/api/cron/scrape` to refresh data from Wikipedia. Data is persisted in Vercel Blob storage. Region data is pre-computed from UCDP GED and bundled with the project.

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob access token (auto-generated when linking a Blob store) |
| `CRON_SECRET` | Protects the `/api/cron/scrape` endpoint |
| `CRAWLER_INGEST_SECRET` | Authenticates crawler log ingestion |

### Updating Region Data

When a new UCDP GED release is available, download the CSV and re-export:

```bash
cd backend
npx tsx src/scraper/export-regions.ts /path/to/GEDEvent_vXX_X.csv
```

Copy the output to the frontend server data directory:

```bash
cp backend/src/data/regions-static.json frontend/server/data/regions-static.json
```

## Tech Stack

**Frontend:** React · TypeScript · Three.js · GSAP · Sass

**Backend:** Vercel Serverless Functions · Vercel Blob · Vercel Cron · Cheerio

## Contributing

Contributions are welcome. Whether it's improving data accuracy, adding new visualizations, fixing bugs, or translating — every bit helps.

Please open an issue first to discuss what you'd like to change.

## License

[MIT](LICENSE)
