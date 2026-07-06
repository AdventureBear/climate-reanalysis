# Color Scale Reference

## Wind Speed

Source: **Pivotal Weather**. Same color sequence across all levels — only the
knot values at each color step change. Sampled at ~5-knot intervals.

### Level groups and knot ranges

| Levels                              | Scale group | Range      | Status                               |
|-------------------------------------|-------------|------------|--------------------------------------|
| 1000mb                              | surface     | 10–60 kt   | Breakpoints computed, colors TBD     |
| 925, 850, 700, 600mb                | low         | 20–80 kt   | Implemented (sampled from Pivotal)   |
| 500, 400mb                          | mid         | 20–140 kt  | Placeholder even spacing             |
| 300, 250, 200, 150, 100, 70–10mb   | high        | 50–170 kt  | Placeholder even spacing             |

600mb defaults to the 700mb (low) scale — try mid if winds look clipped.
400mb defaults to the 500mb (mid) scale — try high if winds look clipped.

The pattern: wind speed ranges expand as altitude increases (jet stream).
Colors are the same visual sequence regardless of level — only the m/s
threshold at each color step shifts.

### Color sequence (13 colors, Pivotal Weather — same for all levels)

| position | hex     |
|----------|---------|
| 1 (low)  | #f2f9ff |
| 2        | #87cefa |
| 3        | #6b5acc |
| 4        | #e695db |
| 5        | #c95bbe |
| 6        | #a11397 |
| 7        | #c90028 |
| 8        | #de2a3c |
| 9        | #f04f4f |
| 10       | #faf061 |
| 11       | #faf061 |
| 12       | #8b5a2b |
| 13 (high)| #a15d0a |

The 13 colors are distributed **evenly** across the level's kt range.
Only the range endpoints change — the color sequence never changes.

### Implementation

`visualizer.py` computes breakpoints dynamically:
```
step = (max_kt - min_kt) / 12   # 12 intervals between 13 points
breakpoints = [min_kt + i * step for i in range(13)]  # converted to m/s
```

Scale is always **absolute** — same color = same physical value within a level
group. This is required for side-by-side map comparison.

## Other Variables (placeholder)

TMP, HGT, SPFH currently use matplotlib auto-scaling. Each needs a fixed
Pivotal Weather-sourced scale before being considered production-ready.

To add a new scale: sample Pivotal Weather at the target level, record hex
colors at each threshold, add an entry to `SCALE_CONFIGS` in `visualizer.py`.
