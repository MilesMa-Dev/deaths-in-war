# Deaths in War

> Every number is a life. Every dot on the map is someone's home.

An interactive 3D globe that visualizes ongoing armed conflicts worldwide and their human cost. Data is automatically scraped daily from Wikipedia's [List of ongoing armed conflicts](https://en.wikipedia.org/wiki/List_of_ongoing_armed_conflicts) and optionally enriched with [ACLED](https://acleddata.com/) event-level data.

## Why This Project?

War is not an abstraction. Behind every statistic are real people — parents, children, friends — whose lives have been cut short or irreversibly shattered.

Yet for most of us, conflicts happening thousands of miles away remain invisible. A headline scrolls past; a number is forgotten. We built this project because **numbers deserve to be felt, not just read**.

By placing every ongoing conflict on a spinning globe — scaled by death toll, colored by intensity — we hope to make the human cost of war harder to ignore. Not to assign blame or take sides, but to ask a simple question:

**How much longer?**

If this visualization makes even one person pause and reflect, it has served its purpose.

🕊 *We stand for peace.*

## What It Does

- Scrapes Wikipedia daily for up-to-date data on all ongoing armed conflicts
- Renders an interactive **3D globe** (Three.js) with conflict markers sized by cumulative death toll
- Classifies conflicts by intensity: major wars, wars, minor conflicts, and skirmishes
- Opens with a cinematic intro showing the total lives lost
- Optionally enriches data with ACLED's granular event-level conflict records

## Data Sources

| Source | What it provides | Required? |
|--------|-----------------|-----------|
| [Wikipedia](https://en.wikipedia.org/wiki/List_of_ongoing_armed_conflicts) | Conflict names, locations, death tolls, intensity levels | Yes (auto-scraped) |
| [ACLED](https://acleddata.com/) | Granular event-level data, affected regions | Optional |

## Getting Started

```bash
# Backend
cd backend
cp .env.example .env   # edit if you have ACLED credentials
npm install
npm run dev             # http://localhost:3001

# Frontend
cd frontend
npm install
npm run dev             # http://localhost:5173
```

The backend scrapes Wikipedia on first start and refreshes daily at 03:00 UTC. No database required — data is stored as a local JSON file.

## Environment Variables

Create a `backend/.env` file (see `backend/.env.example`):

| Variable | Required | Description |
|----------|----------|-------------|
| `ACLED_EMAIL` | No | Your ACLED account email ([register here](https://acleddata.com/register/)) |
| `ACLED_PASSWORD` | No | Your ACLED account password |

> The app works fully without ACLED credentials. ACLED enrichment adds affected-region data to each conflict but is not required for the core experience.

## Tech Stack

**Frontend:** React · TypeScript · Three.js · GSAP · Sass

**Backend:** Node.js · Express · Cheerio · node-cron

## Contributing

Contributions are welcome. Whether it's improving data accuracy, adding new visualizations, fixing bugs, or translating — every bit helps.

Please open an issue first to discuss what you'd like to change.

## License

[MIT](LICENSE)
