# PyRe brand assets

Vector versions of the PyRe swirl logo, traced from the original raster source
(`frontend/public/logo.png`) with potrace. True Bézier curves — scale to any
print size without pixelation.

| File | Use |
|---|---|
| `pyre-logo.svg` | Two-tone brand mark (sky-500 `#0ea5e9` / amber-500 `#f59e0b`) — full-color printing |
| `pyre-logo-black.svg` | Single-color version for screen printing on light garments |
| `pyre-logo-white.svg` | Single-color version for dark garments |
| `pyre-logo-4500.png` | Print-ready raster of the two-tone mark (4500×4500, transparent) for services that reject SVG (Spring/Teespring, etc.) |
| `pyre-logo-black-4500.png` | Print-ready raster, solid black |
| `pyre-logo-white-4500.png` | Print-ready raster, solid white (invisible on white backgrounds — it's not broken) |

## Wordmark ("pyreweather" lockup)

Brand font: **Audiowide** (Google Fonts, OFL) — chosen 2026-07-08 as the closest
real font to the AI-generated wordmark sample. Text in these files is converted
to outlines, so no font installation is needed to use them.

| File | Use |
|---|---|
| `pyre-wordmark-color-light.svg` / `-4500.png` | Two-tone swirl + slate text — light backgrounds/garments |
| `pyre-wordmark-color-dark.svg` / `-4500.png` | Two-tone swirl + white text — dark backgrounds/garments |
| `pyre-wordmark-black.svg` / `-4500.png` | Single-color black |
| `pyre-wordmark-white.svg` / `-4500.png` | Single-color white |

PNGs are 4500px wide with transparent backgrounds (Spring-ready). To set new
text in the brand font, get Audiowide from https://fonts.google.com/specimen/Audiowide.

Notes for print shops:

- All files share the same 2000×2000 viewBox and geometry; only fills differ.
- Each swirl arm is its own `<path>`, so a designer can re-ink either arm
  (e.g. Pantone matching for screen printing) by editing the two `fill` values.
- Web/favicon assets live in `frontend/public/` (favicon uses solid sky-600
  `#0284c7`); this folder is the print/branding source of truth.
