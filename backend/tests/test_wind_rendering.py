"""Wind glyph density and isotach spacing (#45).

Both are derived rather than hardcoded, so the values they produce are the
contract. CONUS is the calibrated reference for density; the level's wind
scale group is the reference for isotach interval.
"""

from app.config import REGIONS
from app.visualizer import (
    CORE_GRID_DEG,
    DEFAULT_WIND_DENSITY,
    ISOTACH_INTERVALS_KT,
    glyph_stride,
    isotach_floor_kt,
    isotach_interval_kt,
)


class TestGlyphStride:
    def test_conus_density_is_unchanged(self):
        # The setting users calibrated on: density N = stride N.
        for density in (1, 2, 3, 4, 6):
            assert glyph_stride(density, CORE_GRID_DEG, REGIONS["CONUS"]) == density

    def test_wider_extents_thin_out(self):
        # A World map fits 3.5x more degrees per inch, so it needs a larger
        # stride to reach the same spacing on the page.
        assert glyph_stride(2, CORE_GRID_DEG, REGIONS["World"]) == 7
        assert glyph_stride(2, CORE_GRID_DEG, REGIONS["North America"]) == 3

    def test_small_extents_fill_in(self):
        # Northeast at density 2 used to draw the same sparse field as CONUS
        # despite covering a third of the width.
        assert glyph_stride(2, CORE_GRID_DEG, REGIONS["Northeast"]) == 1

    def test_coarse_source_grid_does_not_multiply_the_stride(self):
        # 2.5 deg R2 climatology has ~3.5x fewer points; stride 1 already
        # matches the on-map spacing CONUS density 2 gives on the obs grid.
        assert glyph_stride(2, 2.5, REGIONS["CONUS"]) == 1

    def test_stride_never_drops_below_one(self):
        assert glyph_stride(1, 2.5, REGIONS["Northeast"]) == 1


class TestIsotachInterval:
    def test_interval_comes_from_the_level(self):
        # A flat 20 kt drew one line or none in the lower troposphere.
        assert isotach_interval_kt(1000, "wind_10m") == 5
        assert isotach_interval_kt(850) == 10
        assert isotach_interval_kt(700) == 10
        assert isotach_interval_kt(250) == 20

    def test_every_level_offers_a_selectable_interval(self):
        for level in (1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100, 50, 10):
            assert isotach_interval_kt(level) in ISOTACH_INTERVALS_KT

    def test_floor_matches_the_level_scale(self):
        assert isotach_floor_kt(850) == 15
        assert isotach_floor_kt(250) == 50


class TestAutoDensity:
    def test_auto_resolves_to_the_calibrated_default(self):
        # -1 is the sentinel the Auto control sends. It must land on the same
        # stride as an explicit DEFAULT_WIND_DENSITY.
        for region in ("Northeast", "CONUS", "North America", "World"):
            assert glyph_stride(-1, CORE_GRID_DEG, REGIONS[region]) == glyph_stride(
                DEFAULT_WIND_DENSITY, CORE_GRID_DEG, REGIONS[region]
            )
