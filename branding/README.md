# PyRe brand assets

Vector versions of the PyRe swirl logo, traced from the original raster source
(`frontend/public/logo.png`) with potrace. True Bézier curves — scale to any
print size without pixelation.

| File | Use |
|---|---|
| `pyre-logo.svg` | Two-tone brand mark (sky-500 `#0ea5e9` / amber-500 `#f59e0b`) — full-color printing |
| `pyre-logo-black.svg` | Single-color version for screen printing on light garments |
| `pyre-logo-white.svg` | Single-color version for dark garments |

Notes for print shops:

- All files share the same 2000×2000 viewBox and geometry; only fills differ.
- Each swirl arm is its own `<path>`, so a designer can re-ink either arm
  (e.g. Pantone matching for screen printing) by editing the two `fill` values.
- Web/favicon assets live in `frontend/public/` (favicon uses solid sky-600
  `#0284c7`); this folder is the print/branding source of truth.
