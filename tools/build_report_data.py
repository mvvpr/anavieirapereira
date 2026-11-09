#!/usr/bin/env python3
"""Build relatorio-4c277093/data.json from two Meta Ads (ads_get_ad_entities) answers.

Usage:
  python3 tools/build_report_data.py ads.json daily.json

ads.json   -> level=ad, time_range 2026-11-08..2026-12-06 (one row per ad)
daily.json -> level=ad_account, time_increment=1 (one row per day)
Each file is the raw tool answer: {"ad_entities": "<JSON text>"} or the list itself.
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "relatorio-4c277093" / "data.json"


def rows(path):
    raw = json.loads(Path(path).read_text())
    if isinstance(raw, dict):
        raw = raw.get("ad_entities", raw)
    if isinstance(raw, str):
        raw = json.loads(raw)
    return raw


def num(v):
    if v is None:
        return 0
    if isinstance(v, dict):
        v = v.get("value")
    try:
        return float(v) if "." in str(v) else int(v)
    except (TypeError, ValueError):
        return 0


def main(ads_path, daily_path):
    ads = [{
        "ad_id": str(r["id"]), "anuncio": r["name"], "campanha": r["campaign_name"], "status": r["effective_status"],
        "investimento": num(r.get("amount_spent")), "impressoes": num(r.get("impressions")),
        "cliques": num(r.get("link_click")), "visitas": num(r.get("landing_page_view")), "leads": num(r.get("lead")),
    } for r in rows(ads_path)]
    daily = [{
        "data": r["date_start"], "investimento": num(r.get("amount_spent")), "impressoes": num(r.get("impressions")),
        "cliques": num(r.get("link_click")), "visitas": num(r.get("landing_page_view")), "leads": num(r.get("lead")),
    } for r in rows(daily_path)]
    out = {"atualizado_em": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "conta": "GTM 1", "moeda": "EUR",
           "anuncios": ads, "diario": daily}
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
    print(f"wrote {OUT} ({len(ads)} ads, {len(daily)} days)")


if __name__ == "__main__":
    main(*sys.argv[1:3])
