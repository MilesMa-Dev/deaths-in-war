# Deaths in War — Design System

This document defines the visual language and interaction standards for the project. All page changes must conform to this specification.

---

## 1. Design Philosophy

**Tone: solemn, mournful, restrained.**

- Every visual element serves the data itself — no decorative design
- Generous whitespace, evoking the gravity of a memorial
- Dark palette throughout; red markers are the only permitted bright color, symbolizing fire and sacrifice
- Motion is not meant to impress — it conveys weight and revelation

---

## 2. Color System

Based on a Material Design 3 Dark Theme variant.

### Background Hierarchy

| Token                 | Value       | Usage                          |
| --------------------- | ----------- | ------------------------------ |
| `$bg-primary`         | `#0a0a0c`   | Page / map base (near-black)   |
| `$bg-surface`         | `#121214`   | Panels, drawers                |
| `$bg-surface-variant` | `#1a1a1e`   | Secondary containers           |
| `$bg-surface-elevated`| `#1e1e22`   | Cards, floating layers         |

### Text Opacity

Following Material Design on-dark spec:

| Token            | Value                       | Usage                    |
| ---------------- | --------------------------- | ------------------------ |
| `$text-high`     | `rgba(255, 255, 255, 0.87)` | Primary text, headings   |
| `$text-medium`   | `rgba(255, 255, 255, 0.60)` | Secondary text, captions |
| `$text-low`      | `rgba(255, 255, 255, 0.38)` | Labels, auxiliary info   |
| `$text-disabled` | `rgba(255, 255, 255, 0.12)` | Disabled state           |

### Conflict Intensity Scale

A dark-to-light red spectrum mapping four conflict intensity tiers:

| Intensity       | Token                   | Value     | Extra          |
| --------------- | ----------------------- | --------- | -------------- |
| Major War       | `$color-major-war`      | `#b71c1c` | Outer glow     |
| War             | `$color-war`            | `#c62828` |                |
| Minor Conflict  | `$color-minor-conflict` | `#d32f2f` |                |
| Skirmish        | `$color-skirmish`       | `#e57373` |                |

### Accent Colors

| Token               | Value                       | Usage                   |
| -------------------- | --------------------------- | ----------------------- |
| `$color-accent`      | `#ff6f61` (coral red)       | Key numbers, links      |
| `$color-accent-dim`  | `rgba(255, 111, 97, 0.6)`  | Unfocused links         |

### Glass Surface

| Token              | Value                        | Usage                          |
| ------------------ | ---------------------------- | ------------------------------ |
| `$glass-bg`        | `rgba(18, 18, 28, 0.18)`    | Default glass panel background |
| `$glass-bg-heavy`  | `rgba(16, 16, 26, 0.35)`    | Dense glass (side panel)       |
| `$glass-blur`      | `6px`                       | Backdrop blur radius           |
| `$glass-border`    | `rgba(255, 255, 255, 0.1)`  | Glass edge highlight           |

### Functional Colors

| Token            | Value                       | Usage                  |
| ---------------- | --------------------------- | ---------------------- |
| `$color-scrim`   | `rgba(0, 0, 0, 0.6)`       | Panel backdrop         |
| `$color-border`  | `rgba(255, 255, 255, 0.06)` | Dividers, panel edges  |

---

## 3. Typography

Three Roboto typefaces, each carrying a distinct semantic role.

### Font Stacks

| Role         | Token         | Stack                                             |
| ------------ | ------------- | ------------------------------------------------- |
| Headings     | `$font-title` | `Roboto Condensed` → `Arial Narrow` → sans-serif  |
| Body         | `$font-body`  | `Roboto` → `Helvetica Neue` → sans-serif          |
| Numbers/Data | `$font-mono`  | `Roboto Mono` → `Courier New` → monospace         |

### Text Styles

| Mixin              | Family       | Weight | Size  | Line-height | Spacing  | Usage                  |
| ------------------ | ------------ | ------ | ----- | ----------- | -------- | ---------------------- |
| `text-display`     | Mono         | 100    | 40px  | 48px        | -0.25px  | Primary death toll     |
| `text-headline`    | Mono         | 300    | 32px  | 40px        | —        | Secondary large number |
| `text-title-large` | Condensed    | 300    | 22px  | 28px        | 0        | Panel titles           |
| `text-title-medium`| Condensed    | 400    | 16px  | 24px        | 0.15px   | Subtitles, tooltips    |
| `text-body-large`  | Roboto       | 400    | 16px  | 24px        | 0.5px    | Detail body text       |
| `text-body-medium` | Roboto       | 400    | 14px  | 20px        | 0.25px   | Descriptions           |
| `text-label`       | Roboto       | 500    | 12px  | 16px        | 0.5px    | Labels (uppercase)     |

### Number Rendering Rules

- All numbers use `font-variant-numeric: tabular-nums` for monospaced alignment
- The total death count uses ultra-thin weight (100) to convey gravity
- Numbers are formatted with English comma separators (`8,035,305`)

---

## 4. Spacing

Based on Material Design 4dp grid:

| Token        | Value |
| ------------ | ----- |
| `$space-xs`  | 4px   |
| `$space-sm`  | 8px   |
| `$space-md`  | 16px  |
| `$space-lg`  | 24px  |
| `$space-xl`  | 32px  |
| `$space-2xl` | 48px  |
| `$space-3xl` | 64px  |

---

## 5. Radii & Elevation

### Border Radius

| Token        | Value | Usage          |
| ------------ | ----- | -------------- |
| `$radius-sm` | 8px   | Small elements |
| `$radius-md` | 12px  | Cards          |
| `$radius-lg` | 16px  | Panels         |
| `$radius-xl` | 28px  | Pill / Badge   |

### Shadows (Dark Mode)

| Token          | Usage          |
| -------------- | -------------- |
| `$elevation-1` | Subtle lift    |
| `$elevation-2` | Cards          |
| `$elevation-3` | Panels, drawer |

---

## 6. Component Specs

### 6.1 Floating Card (`surface-card`)

All UI elements floating above the map share this frosted glass treatment:

```scss
background:
  linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 40%),
  $glass-bg;                                   // rgba(18, 18, 28, 0.18)
backdrop-filter: blur($glass-blur);            // 6px
-webkit-backdrop-filter: blur($glass-blur);
border: 1px solid $glass-border;               // rgba(255, 255, 255, 0.1)
border-top-color: rgba(255, 255, 255, 0.15);
border-radius: $radius-md;
box-shadow: $elevation-2, inset 0 1px 0 rgba(255, 255, 255, 0.06);
```

### 6.2 Stats Overlay (top-left)

- Pinned to top-left of viewport, `position: absolute`
- Max width 360px (280px on mobile)
- `pointer-events: none` on wrapper (card body is `pointer-events: auto`)
- Site title: Roboto Condensed 300, 18px, `letter-spacing: 4px`
- Death toll: `text-display` + `$color-accent`
- Conflict count: `text-headline` + `$text-high`
- Divider between the two figures: 1px `rgba(255,255,255,0.08)`

### 6.3 Conflict Panel (right-side drawer)

- Desktop: fixed right, 380px wide, full height
- Mobile (<=600px): bottom drawer, 70vh height, top corners rounded 16px
- Background `$glass-bg-heavy` with `backdrop-filter: blur($glass-blur)`, left border `$glass-border`
- Opens with scrim overlay (`$color-scrim`)
- Content stacked vertically, gap `$space-lg`

### 6.4 Intensity Badge

- Pill shape (`border-radius: $radius-xl`)
- Uses `text-label` style
- Background: corresponding intensity color at 20% opacity
- Text: corresponding intensity color with lightness +25%

### 6.5 Legend (bottom-center)

- Horizontal layout with four intensity items
- Each item: 10px dot (with `box-shadow: 0 0 6px` glow) + label text
- Uses `surface-card` treatment

### 6.6 Tooltip (bottom-center)

- Appears on conflict marker hover, fixed 64px from viewport bottom
- Horizontally centered, vertically stacks conflict name + death count
- Name: `text-title-medium`; deaths: `text-body-medium` + `$color-accent` + Mono font
- `pointer-events: none`

---

## 7. Map Rendering

### Technology

- deck.gl WebGL rendering, `MapView({ repeat: false })`
- Pure CSS background `#0a0a0c` — no tile basemap

### Layers

In render order:

1. **Coastlines** — `GeoJsonLayer`, `getLineColor: [255,255,255,60]`, 1–2px
2. **Country borders** — `GeoJsonLayer`, `getLineColor: [255,255,255,40]`, 0.8–1.5px
3. **Conflict glow** — `ScatterplotLayer`, using `INTENSITY_GLOW` colors, pulsing animation
4. **Conflict markers** — `ScatterplotLayer`, using `INTENSITY_COLORS`, clickable/hoverable

### Map Data

- Source: `world-atlas@2/countries-110m.json` (TopoJSON)
- Extracted via `topojson.mesh()` for clean border lines, avoiding polygon fill and anti-meridian artifacts
- Coastlines (`a === b`) and borders (`a !== b`) rendered as separate layers

### Conflict Marker Sizing

- Radius formula: `Math.max(8000, Math.log10(deaths) * 12000)` meters
- Glow radius = marker radius x 2.5
- `radiusMinPixels: 4`, `radiusMaxPixels: 40`
- Hover: scale x 1.3

### Vignette

Radial gradient overlay on top of the map, focusing the visual center:

```css
background: radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.45) 100%);
```

---

## 8. Motion Spec

Following Material Design 3 Motion principles.

### Easing Curves

| Name                 | CSS                               | GSAP Equivalent  | Usage              |
| -------------------- | --------------------------------- | ---------------- | ------------------ |
| emphasized           | `cubic-bezier(0.2, 0, 0, 1)`     | `power3.out`     | Primary transitions|
| emphasizedDecelerate | `cubic-bezier(0.05, 0.7, 0.1, 1)`| `power2.out`     | Element enter      |
| emphasizedAccelerate | `cubic-bezier(0.3, 0, 0.8, 0.15)`| `power2.in`      | Element exit       |
| standard             | `cubic-bezier(0.2, 0, 0, 1)`     | `power2.inOut`   | General            |

### Duration Tiers

| Tier       | Duration | Usage                        |
| ---------- | -------- | ---------------------------- |
| short      | 150ms    | Hover feedback, micro-interactions |
| medium     | 300ms    | Panel open/close, transitions |
| long       | 500ms    | Emphasized transitions, legend fade-in |
| extraLong  | 700ms    | Initial reveal               |

### Motion Inventory

| Effect              | Engine  | Duration | Easing               | Description                                    |
| ------------------- | ------- | -------- | -------------------- | ---------------------------------------------- |
| Initial reveal      | GSAP    | 1.5s     | emphasized           | Map fades in from `opacity:0`                  |
| Death toll count-up | GSAP    | 2.5s     | emphasizedDecelerate | Rolls from 0 to actual value with `snap`       |
| Conflict count-up   | GSAP    | 1.5s     | emphasizedDecelerate | Rolls from 0 to actual value                   |
| Stats overlay enter | GSAP    | 0.5s     | emphasizedDecelerate | Fades in from 20px below, delay 0.8s           |
| Legend enter        | GSAP    | 0.5s     | emphasizedDecelerate | Fades in from 10px below, delay 1.5s           |
| Marker pulse        | JS      | 3s cycle | Sine wave            | Glow radius +/-30%, opacity 0.25–0.55          |
| Panel open          | GSAP    | 0.5s     | emphasized           | Slides in from right `x:100%` + scrim fade-in  |
| Panel close         | GSAP    | 0.3s     | emphasizedAccelerate | Slides out to `x:100%` + scrim fade-out        |
| Panel content       | GSAP    | 0.3s     | emphasizedDecelerate | Children stagger fade-in, `stagger: 0.05s`     |
| Hover scale         | deck.gl | instant  | —                    | Marker radius x1.3, alpha 200 → 240            |
| Map fly-to          | GSAP    | 1.2s     | emphasizedDecelerate | Smooth zoom to conflict region at zoom=4       |

---

## 9. Responsive Breakpoints

| Token          | Value   | Strategy                                                  |
| -------------- | ------- | --------------------------------------------------------- |
| `$bp-mobile`   | 600px   | Panel → bottom drawer, stats narrow, legend text shrinks  |
| `$bp-tablet`   | 960px   | Intermediate state                                        |
| `$bp-desktop`  | 1280px  | Full desktop layout                                       |

---

## 10. Z-index Layers

| Token        | Value | Content                         |
| ------------ | ----- | ------------------------------- |
| `$z-map`     | 1     | Map canvas + vignette           |
| `$z-overlay` | 10    | Stats overlay, legend, tooltip  |
| `$z-scrim`   | 90    | Panel backdrop scrim            |
| `$z-panel`   | 100   | Conflict detail panel           |

---

## 11. Do-Not Rules

- **Never** use light or white backgrounds
- **Never** add decorative graphics (patterns, icon sets, illustrations, etc.)
- **Never** use typefaces outside the Roboto family
- **Never** use warm hues other than red
- **Never** use bounce, elastic, or other playful easing curves
- **Never** use proportional fonts for numbers (must be `tabular-nums`)
- **Never** add background music or sound effects
- Dividers must not exceed `rgba(255,255,255,0.08)` opacity
- All floating layers must use `backdrop-filter: blur` + translucent background
