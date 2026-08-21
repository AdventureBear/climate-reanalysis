from __future__ import annotations

from app import synopsis


DISCUSSION = """Short Range Forecast Discussion
NWS Weather Prediction Center College Park MD
359 AM EDT Mon Aug 17 2026

...Severe thunderstorm and flash flooding threats today...

For the remainder of Monday, a cold front will trigger scattered thunderstorms
from the Ohio Valley to the Central Appalachians.

By Tuesday, the cold front in the East slides off the coast."""


def _bonus_map(map_id: str = "dewpoint") -> dict:
    return {
        "id": map_id,
        "caption": "A dewpoint gradient highlights the warm-season boundary.",
        "recipe": {
            "variable": "dewpoint_2m",
            "level": "surface_2m_dpt",
            "region": "CONUS",
            "date": "20260817",
            "hour": "18",
            "displayMode": "raw",
            "wind": False,
            "fillMode": "shaded",
            "contours": None,
            "centers": False,
        },
    }


def _plan() -> dict:
    return {
        "headline": "Storms and flooding focus on the Ohio Valley",
        "description": "WPC highlights storms and flash flooding along a cold front.",
        "intro": "A cold front is focusing storms and heavy rain across the Ohio Valley and Central Appalachians today.",
        "sections": [
            {
                "heading": "Storms Along The Front",
                "body": "Scattered thunderstorms remain possible from the Ohio Valley to the Central Appalachians today.",
            },
            {
                "heading": "The Front Moves East",
                "body": "By Tuesday, the cold front in the East will slide off the coast.",
            },
        ],
        "topics": [
            {"region": "Ohio Valley", "tags": ["Cold Front", "Flash Flooding", "Thunderstorms", "Made Up"]},
            {"region": "Central Appalachians", "tags": ["Heavy Rain", "Severe Thunderstorms"]},
            {"region": "Atlantis", "tags": ["Heavy Rain"]},
        ],
        "setup_notes": {
            "overview": "A 500mb trough helps steer the cold front and storm corridor into the Ohio Valley.",
            "vorticity": "Mid-level disturbances moving through the trough can provide lift for storms along the front.",
            "jet": "Stronger upper-level flow crosses the Ohio Valley storm corridor and can help organize thunderstorms.",
            "low_flow": "Low-level flow feeds moisture into the front from the Tennessee Valley toward the Appalachians.",
        },
        "bonus_maps": [_bonus_map()],
    }


def test_assemble_post_preserves_official_text_and_derives_taxonomy():
    post = synopsis.assemble_post(_plan(), DISCUSSION, "20260817")

    assert post["post_date"] == "20260817"
    assert post["official_text"] == DISCUSSION
    assert post["intro"].startswith("A cold front is focusing")
    assert post["topics"] == [
        {"region": "Ohio Valley", "tags": ["Cold Front", "Flash Flooding", "Thunderstorms"]},
        {"region": "Central Appalachians", "tags": ["Heavy Rain", "Severe Thunderstorms"]},
    ]
    assert post["tags"] == [
        "Cold Front", "Flash Flooding", "Thunderstorms", "Heavy Rain",
        "Severe Thunderstorms",
    ]
    assert post["regions"] == ["Ohio Valley", "Central Appalachians"]
    assert post["sections"][0]["heading"] == "Storms Along The Front"
    assert [m["id"] for m in post["maps"][:5]] == [
        "overview", "vorticity", "jet", "low_flow", "surface",
    ]
    assert post["maps"][2]["caption"].startswith("Stronger upper-level flow")
    assert post["maps"][0]["recipe"]["time"]["date"] == "2026-08-17"
    assert post["maps"][-1]["id"] == "dewpoint"


def test_build_body_md_appends_map_gallery_after_prose():
    post = synopsis.assemble_post(_plan(), DISCUSSION, "20260817")
    post["source"] = {"url": "https://example.test/wpc", "issued": "359 AM EDT Mon Aug 17 2026"}

    body = synopsis.build_body_md(post, "us-weather-monday-august-17-2026")

    assert "### 500mb Geopotential Height, 8/17/2026 12Z" in body
    assert "![500mb Geopotential Height, 8/17/2026 12Z. A 500mb trough helps steer" in body
    image = body.index("![500mb Geopotential Height")
    trigger = body.index("A cold front is focusing")
    later = body.index("By Tuesday")
    assert "## Atmospheric Setup Maps for " in body
    gallery = body.index("## Atmospheric Setup Maps for ")
    assert trigger < later < gallery < image
    assert "Short Range Forecast Discussion\nNWS Weather Prediction Center" not in body
    assert "Source: [NWS WPC Short Range Forecast Discussion, issued 359 AM EDT Mon Aug 17 2026]" in body


def test_generated_recipe_still_translates_to_api_params():
    post = synopsis.assemble_post(_plan(), DISCUSSION, "20260817")

    params = synopsis.recipe_to_params(post["maps"][0]["recipe"])

    assert params["variable"] == "height"
    assert params["level"] == 500
    assert params["date"] == "20260817"
    assert params["fill_mode"] == "shaded"
    assert params["contours"] == "height"


def test_unsupported_words_checks_generated_metadata():
    plan = _plan()
    plan["description"] = "A historic setup is highlighted."
    discussion = DISCUSSION + "\n\nHistoric rainfall is possible."
    post = synopsis.assemble_post(plan, discussion, "20260817")
    assert synopsis.unsupported_words(post, discussion) == []

    plan["description"] = "A catastrophic setup is highlighted."
    post = synopsis.assemble_post(plan, DISCUSSION, "20260817")
    assert synopsis.unsupported_words(post, DISCUSSION) == ["catastrophic"]


def test_plan_requires_rewritten_body_before_post_assembly():
    plan = _plan()
    plan["sections"] = []

    try:
        synopsis.assemble_post(plan, DISCUSSION, "20260817")
    except ValueError as exc:
        assert "sections" in str(exc)
    else:
        raise AssertionError("assemble_post accepted a plan without rewritten prose")


def test_bonus_maps_are_capped_without_repair():
    plan = _plan()
    plan["bonus_maps"] = [_bonus_map("bonus1"), _bonus_map("bonus2"), _bonus_map("bonus3")]

    post = synopsis.assemble_post(plan, DISCUSSION, "20260817")

    assert [m["id"] for m in post["maps"][-2:]] == ["bonus1", "bonus2"]


def test_topics_must_derive_enough_legal_tags():
    plan = _plan()
    plan["topics"] = [{"region": "Ohio Valley", "tags": ["Made Up"]}]

    try:
        synopsis.assemble_post(plan, DISCUSSION, "20260817")
    except ValueError as exc:
        assert "legal region topics" in str(exc)
    else:
        raise AssertionError("assemble_post accepted invalid topics")


def test_flat_tags_are_capped_from_topics():
    plan = _plan()
    plan["topics"] = [
        {"region": "Ohio Valley", "tags": ["Cold Front", "Flash Flooding", "Thunderstorms"]},
        {"region": "Central Plains", "tags": ["Warm Front", "Low Pressure", "High Pressure"]},
        {"region": "Southwest", "tags": ["Trough", "Ridge", "Shortwave"]},
        {"region": "Southeast", "tags": ["Longwave", "Cyclone", "Cyclogenesis"]},
        {"region": "Northern Plains", "tags": ["Jet Stream", "Low-Level Jet", "Cold Air Advection"]},
    ]

    post = synopsis.assemble_post(plan, DISCUSSION, "20260817")

    assert len(post["tags"]) == 12


def test_base_gallery_contains_core_setup_maps():
    maps = synopsis.base_map_plans("20260817")

    assert [(m["recipe"]["variable"], m["recipe"]["level"]) for m in maps] == [
        ("height", "500"),
        ("absv", "500"),
        ("wind_speed", "300"),
        ("wind_speed", "850"),
        ("pressure", "surface_mslp"),
    ]
    assert all(m["recipe"]["region"] == "CONUS" for m in maps)


def test_surface_setup_note_is_ignored_for_mslp():
    maps = synopsis.base_map_plans(
        "20260817",
        {
            "surface": "The MSLP field frames the stationary front along the northern edge of the high.",
        },
    )

    assert "front" not in maps[4]["caption"].lower()


def test_mslp_caption_from_detected_centers_uses_pressure_language():
    caption = synopsis.mslp_caption_from_centers(
        lows=[(260.0, 35.0, 1002.0)],
        highs=[(275.0, 28.0, 1019.0)],
    )

    assert "lower pressure" in caption
    assert "higher pressure" in caption
    assert "return flow" in caption
    assert "front" not in caption
    assert "boundary" not in caption
