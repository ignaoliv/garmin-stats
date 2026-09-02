#!/usr/bin/env python3
"""
Daily step count → public/data/steps.json

Steps are wellness data, not activities: they live on a separate Garmin
endpoint and exist for days with no workout at all, so they are synced and
stored apart from activities.json.

Usage:
    python3 fetch/steps.py               # último año
    python3 fetch/steps.py --days 1095   # tres años
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")
DATA = ROOT / "public" / "data"

# Garmin rejects long spans on this endpoint, so ask month by month.
CHUNK_DAYS = 28


def archive_steps(api, days: int = 365) -> int:
    end = date.today()
    start = end - timedelta(days=days)

    rows: dict[str, dict] = {}
    cursor = start
    while cursor <= end:
        chunk_end = min(cursor + timedelta(days=CHUNK_DAYS), end)
        try:
            for r in api.get_daily_steps(cursor.isoformat(), chunk_end.isoformat()):
                d = r.get("calendarDate")
                if not d:
                    continue
                rows[d] = {
                    "fecha": d,
                    "pasos": r.get("totalSteps") or 0,
                    "distancia_m": r.get("totalDistance") or 0,
                    "objetivo": r.get("stepGoal") or 0,
                }
        except Exception as e:
            print(f"  {cursor} → {chunk_end}: error {str(e)[:60]}")
        cursor = chunk_end + timedelta(days=1)

    # Merge: Garmin trims wellness history, so keep whatever was captured before.
    DATA.mkdir(parents=True, exist_ok=True)
    out_file = DATA / "steps.json"
    archive: dict[str, dict] = {}
    if out_file.exists():
        try:
            for r in json.loads(out_file.read_text()).get("dias", []):
                archive[r["fecha"]] = r
        except Exception:
            pass

    nuevos = sum(1 for d in rows if d not in archive)
    archive |= rows

    dias = sorted(archive.values(), key=lambda r: r["fecha"])
    out_file.write_text(json.dumps({
        "descargado": date.today().isoformat(),
        "dias": dias,
    }, ensure_ascii=False))

    con_datos = [d for d in dias if d["pasos"] > 0]
    print(f"  Pasos archivados: {len(dias)} días ({nuevos} nuevos, {len(con_datos)} con registro)")
    return nuevos


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=365)
    args = ap.parse_args()

    import garminconnect

    email, password = os.getenv("GARMIN_EMAIL"), os.getenv("GARMIN_PASSWORD")
    if not email or not password:
        print("ERROR: faltan GARMIN_EMAIL / GARMIN_PASSWORD en .env", file=sys.stderr)
        sys.exit(1)

    api = garminconnect.Garmin(email, password)
    api.login()
    print(f"Logged in as {email}")
    archive_steps(api, args.days)
    print("   → public/data/steps.json")


if __name__ == "__main__":
    main()
