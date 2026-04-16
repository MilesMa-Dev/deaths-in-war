# Deaths in War

An interactive web application tracking ongoing armed conflicts worldwide and their human cost. Data is automatically scraped daily from Wikipedia's [List of ongoing armed conflicts](https://en.wikipedia.org/wiki/List_of_ongoing_armed_conflicts).

## Tech Stack

**Frontend:** Vite + React + TypeScript + Sass + GSAP + deck.gl (WebGL)

**Backend:** Node.js + Express + Cheerio + node-cron

## Quick Start

### Backend

```bash
cd backend
npm install
npm run dev
```

The backend runs on `http://localhost:3001`. On first start, it automatically scrapes Wikipedia for conflict data. A cron job refreshes data daily at 03:00 UTC.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` with API requests proxied to the backend.

### Manual Scrape

```bash
cd backend
npm run scrape
```

## API Endpoints

- `GET /api/conflicts` — All conflict data
- `GET /api/stats` — Summary statistics
- `GET /api/last-updated` — Last scrape timestamp

## Architecture

```
deaths-in-war/
├── frontend/          # Vite + React + deck.gl WebGL map
│   └── src/
│       ├── components/  WorldMap, StatsOverlay, ConflictPanel, Legend
│       ├── hooks/       useConflicts, useRevealAnimation
│       ├── services/    API client
│       ├── styles/      Sass variables, mixins, global styles
│       └── types/       Shared TypeScript interfaces
├── backend/           # Express API + Wikipedia scraper
│   └── src/
│       ├── scraper/     Wikipedia parser, storage, coordinates
│       ├── routes/      REST API handlers
│       ├── data/        Scraped JSON (gitignored)
│       └── types/       Shared interfaces
```
