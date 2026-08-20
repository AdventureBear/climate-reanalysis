from __future__ import annotations

from app import synopsis


DISCUSSION = """Short Range Forecast Discussion
NWS Weather Prediction Center College Park MD
359 AM EDT Mon Aug 17 2026

...Severe thunderstorm and flash flooding threats today...

For the remainder of Monday, a cold front will trigger scattered thunderstorms
from the Ohio Valley to the Central Appalachians.

By Tuesday, the cold front in the East slides off the coast."""


def _plan() -> dict:
    maps = []
    for idx in range(4):
        maps.append(
            {
                "id": "overview" if idx == 0 else f"map{idx + 1}",
                "caption": "The 500mb height field places the larger trough over the eastern half of the country.",
                "recipe": {
                    "variable": "height",
                    "level": "500",
                    "region": "CONUS",
                    "date": "20260817",
                    "hour": "12",
                    "displayMode": "raw",
                    "wind": False,
                    "fillMode": "shaded",
                    "contours": ["height"],
                    "centers": False,
                },
            }
        )
    return {
        "headline": "Storms and flooding focus on the Ohio Valley",
        "description": "WPC highlights storms and flash flooding along a cold front.",
        "intro": "A cold front is focusing storms and heavy rain across the Ohio Valley and Central Appalachians today.",
        "sections": [
            {
                "heading": "Storms Along The Front",
                "body": "Scattered thunderstorms remain possible from the Ohio Valley to the Central Appalachians today.",
                "map_ids": ["overview", "map2"],
            },
            {
                "heading": "The Front Moves East",
                "body": "By Tuesday, the cold front in the East will slide off the coast.",
                "map_ids": ["map3", "map4"],
            },
        ],
        "tags": [
            "Cold Front", "Flash Flooding", "Thunderstorms", "Heavy Rain",
            "Severe Thunderstorms", "Cold Front", "Made Up",
        ],
        "regions": ["Ohio Valley", "Central Appalachians", "Ohio Valley", "Atlantis"],
        "maps": maps,
    }


def test_assemble_post_preserves_official_text_and_controls_taxonomy():
    post = synopsis.assemble_post(_plan(), DISCUSSION, "20260817")

    assert post["post_date"] == "20260817"
    assert post["official_text"] == DISCUSSION
    assert post["intro"].startswith("A cold front is focusing")
    assert post["tags"] == [
        "Cold Front", "Flash Flooding", "Thunderstorms", "Heavy Rain",
        "Severe Thunderstorms",
    ]
    assert post["regions"] == ["Ohio Valley", "Central Appalachians"]
    assert post["sections"][0]["map_ids"] == ["overview", "map2"]
    assert post["maps"][0]["recipe"]["time"]["date"] == "2026-08-17"


def test_build_body_md_inserts_map_after_selected_paragraph():
    post = synopsis.assemble_post(_plan(), DISCUSSION, "20260817")
    post["source"] = {"url": "https://example.test/wpc", "issued": "359 AM EDT Mon Aug 17 2026"}

    body = synopsis.build_body_md(post, "us-weather-monday-august-17-2026")

    assert "### 500mb Geopotential Height over the continental United States at 12Z on August 17, 2026" in body
    assert "![500mb Geopotential Height over the continental United States at 12Z on August 17, 2026. The 500mb height field places" in body
    image = body.index("![500mb Geopotential Height")
    trigger = body.index("A cold front is focusing")
    later = body.index("By Tuesday")
    assert trigger < image < later
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


def test_unsupported_words_only_checks_generated_metadata():
    plan = _plan()
    plan["description"] = "A historic setup is highlighted."
    discussion = DISCUSSION + "\n\nHistoric rainfall is possible."
    post = synopsis.assemble_post(plan, discussion, "20260817")
    assert synopsis.unsupported_words(post, discussion) == []

    plan["description"] = "A catastrophic setup is highlighted."
    post = synopsis.assemble_post(plan, DISCUSSION, "20260817")
    assert synopsis.unsupported_words(post, DISCUSSION) == ["catastrophic"]


def test_plan_requires_maps_before_post_assembly():
    plan = _plan()
    plan["maps"] = []

    try:
        synopsis.assemble_post(plan, DISCUSSION, "20260817")
    except ValueError as exc:
        assert "3-7 maps" in str(exc)
    else:
        raise AssertionError("assemble_post accepted a mapless plan")


def test_plan_requires_rewritten_body_before_post_assembly():
    plan = _plan()
    plan["sections"] = []

    try:
        synopsis.assemble_post(plan, DISCUSSION, "20260817")
    except ValueError as exc:
        assert "sections" in str(exc)
    else:
        raise AssertionError("assemble_post accepted a plan without rewritten prose")
