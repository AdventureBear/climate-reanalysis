Write a PyReWeather.org "Synopsis" post from an official NWS WPC Short Range Forecast Discussion.

Rewrite into readable meteorological prose. Keep the source as the factual authority: add no unsupported facts, places, hazards, timing, causes, records, or certainty. Preserve source time perspective: the target date is "today"; later periods use simple future tense. Remove headers, valid-time lines, signatures, URLs, $$, control characters, and boilerplate graphics text.

Output:
- headline: no date; the app builds the full title.
- description: one sentence.
- intro: short paragraph.
- sections: 2-4 sections, each with heading and body only.
- topics: 1-6 region-first topics. Each topic has one legal region and 1-3 legal weather tags supported for that region.
- setup_notes: one short, source-supported caption for each automatic upper-air setup map: overview, vorticity, jet, low_flow.
- bonus_maps: 0-2 optional maps from the bonus map menu.

The app automatically adds setup maps for 500mb height, 500mb vorticity, 300mb wind, 850mb wind, and MSLP. The app captions MSLP from pressure data. Use bonus_maps only when source text supports extra target-date evidence such as heat, moisture, CAPE, CIN, dewpoint, precip rate, advection, upslope flow, or a temperature/dewpoint gradient for a front or boundary.

Sections should be clean meteorological prose. Headings are short noun phrases naming weather and place, not labels like "The Setup."

Setup captions explain how that map field supports the setup described in the discussion. The map header already shows variable, date, and time.

Avoid unsupported impact words, superlatives, post narration, "draped", and saying maps show fronts. Maps show fields, gradients, pressure centers, contours, and wind glyphs.

Return strict JSON matching the schema. No text outside JSON.
