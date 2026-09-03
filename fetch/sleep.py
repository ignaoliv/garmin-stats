#!/usr/bin/env python3
"""
Detailed sleep → public/data/sleep.json

Garmin's daily summary barely reports sleep, but the dedicated endpoint returns
the full night: stages, SpO2, respiration and the overnight heart-rate and body
battery curves. One call per day, so the window is bounded and the file is an
archive that accumulates.

Usage:
    python3 fetch/sleep.py --days 120
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")
DATA = ROOT / "public" / "data"


def noche(api, d: str) -> dict | None:
    """One night, reduced to what a dashboard actually plots."""
    try:
        s = api.get_sleep_data(d) or {}
    except Exception:
        return None
    dto = s.get("dailySleepDTO") or {}
    total = dto.get("sleepTimeSeconds")
    if not total:
        return None

    ini = dto.get("sleepStartTimestampLocal")
    fin = dto.get("sleepEndTimestampLocal")
    # Time in bed is the confirmed window; efficiency is asleep over that.
    en_cama = round((fin - ini) / 1000) if ini and fin else None

    return {
        "fecha": d,
        "total_s": total,
        "profundo_s": dto.get("deepSleepSeconds") or 0,
        "ligero_s": dto.get("lightSleepSeconds") or 0,
        "rem_s": dto.get("remSleepSeconds") or 0,
        "despierto_s": dto.get("awakeSleepSeconds") or 0,
        "en_cama_s": en_cama,
        "inicio_local": ini,
        "fin_local": fin,
        "spo2_medio": dto.get("averageSpO2Value"),
        "spo2_minimo": dto.get("lowestSpO2Value"),
        "respiracion_media": dto.get("averageRespirationValue"),
        "fc_media": (s.get("restingHeartRate") or dto.get("averageSpO2HRSleep")),
        # Overnight body battery: how much the night actually recharged.
        "bateria_inicio": (s.get("sleepBodyBattery") or [{}])[0].get("value") if s.get("sleepBodyBattery") else None,
        "bateria_fin": (s.get("sleepBodyBattery") or [{}])[-1].get("value") if s.get("sleepBodyBattery") else None,
    }


def archive_sleep(api, days: int = 120) -> int:
    hoy = date.today()
    filas: dict[str, dict] = {}
    for i in range(days, -1, -1):
        d = (hoy - timedelta(days=i)).isoformat()
        n = noche(api, d)
        if n:
            filas[d] = n
        time.sleep(0.3)

    DATA.mkdir(parents=True, exist_ok=True)
    f = DATA / "sleep.json"
    archivo: dict[str, dict] = {}
    if f.exists():
        try:
            for r in json.loads(f.read_text()).get("noches", []):
                archivo[r["fecha"]] = r
        except Exception:
            pass
    nuevas = sum(1 for d in filas if d not in archivo)
    archivo |= filas
    noches = sorted(archivo.values(), key=lambda r: r["fecha"])
    f.write_text(json.dumps({"descargado": hoy.isoformat(), "noches": noches}, ensure_ascii=False))

    print(f"  Sueño archivado: {len(noches)} noches ({nuevas} nuevas) de {days} días barridos")
    return nuevas


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=120)
    args = ap.parse_args()
    import garminconnect
    email, password = os.getenv("GARMIN_EMAIL"), os.getenv("GARMIN_PASSWORD")
    if not email or not password:
        print("ERROR: faltan GARMIN_EMAIL / GARMIN_PASSWORD en .env", file=sys.stderr)
        sys.exit(1)
    api = garminconnect.Garmin(email, password)
    api.login()
    print(f"Logged in as {email}")
    archive_sleep(api, args.days)
    print("   → public/data/sleep.json")


if __name__ == "__main__":
    main()
