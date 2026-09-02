#!/usr/bin/env python3
"""
Recovery data → public/data/wellness.json

Training load is only half the picture: whether it is sustainable depends on
sleep, resting heart rate and stress. Those live on Garmin's wellness
endpoints, which are day-by-day (only body battery takes a range), so this
pulls a bounded recent window rather than the whole history.

Usage:
    python3 fetch/wellness.py              # últimos 90 días
    python3 fetch/wellness.py --days 180
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

# Field names Garmin uses in the daily summary. Kept as candidate lists because
# the payload varies with device and account.
FIELDS = {
    "fcReposo":      ["restingHeartRate"],
    "sueñoSegundos": ["sleepingSeconds", "measurableAsleepDuration"],
    "estresMedio":   ["averageStressLevel"],
    "estresMaximo":  ["maxStressLevel"],
    "bateriaMin":    ["bodyBatteryLowestValue"],
    "bateriaMax":    ["bodyBatteryHighestValue"],
    "minutosIntensos": ["vigorousIntensityMinutes"],
    "minutosModerados": ["moderateIntensityMinutes"],
}


def pick(summary: dict, names: list[str]):
    for n in names:
        v = summary.get(n)
        if v is not None:
            return v
    return None


def archive_wellness(api, days: int = 90) -> int:
    hoy = date.today()
    filas: dict[str, dict] = {}
    claves_vistas: set[str] = set()

    for i in range(days, -1, -1):
        d = (hoy - timedelta(days=i)).isoformat()
        try:
            s = api.get_stats(d) or {}
        except Exception as e:
            print(f"  {d}: error {str(e)[:60]}")
            continue
        if not claves_vistas:
            claves_vistas = set(s.keys())

        fila = {"fecha": d}
        for destino, nombres in FIELDS.items():
            v = pick(s, nombres)
            # Garmin uses sentinels for "not measured": -1 for stress, 0 for a
            # night the watch was not worn. Storing them as real values would
            # drag every average toward nonsense.
            if v is None:
                continue
            if destino == "estresMedio" and v < 0:
                continue
            if destino == "sueñoSegundos" and v < 3600:
                continue
            fila[destino] = v
        if len(fila) > 1:
            filas[d] = fila
        time.sleep(0.35)  # same courtesy pacing as the activity sync

    # Merge with the archive: Garmin trims wellness history over time.
    DATA.mkdir(parents=True, exist_ok=True)
    out_file = DATA / "wellness.json"
    archivo: dict[str, dict] = {}
    if out_file.exists():
        try:
            for r in json.loads(out_file.read_text()).get("dias", []):
                archivo[r["fecha"]] = r
        except Exception:
            pass

    nuevos = sum(1 for d in filas if d not in archivo)
    archivo |= filas
    dias = sorted(archivo.values(), key=lambda r: r["fecha"])
    out_file.write_text(json.dumps({"descargado": hoy.isoformat(), "dias": dias}, ensure_ascii=False))

    con_fc = sum(1 for r in dias if r.get("fcReposo"))
    con_sueño = sum(1 for r in dias if r.get("sueñoSegundos"))
    print(f"  Recuperación archivada: {len(dias)} días ({nuevos} nuevos)")
    print(f"    con FC en reposo: {con_fc} · con sueño: {con_sueño}")
    if claves_vistas:
        interes = sorted(k for k in claves_vistas if any(w in k.lower() for w in ("sleep", "rest", "stress", "battery", "hrv")))
        print(f"    campos disponibles en el resumen: {', '.join(interes[:10]) or '(ninguno reconocido)'}")
    return nuevos


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=90)
    args = ap.parse_args()

    import garminconnect

    email, password = os.getenv("GARMIN_EMAIL"), os.getenv("GARMIN_PASSWORD")
    if not email or not password:
        print("ERROR: faltan GARMIN_EMAIL / GARMIN_PASSWORD en .env", file=sys.stderr)
        sys.exit(1)

    api = garminconnect.Garmin(email, password)
    api.login()
    print(f"Logged in as {email}")
    archive_wellness(api, args.days)
    print("   → public/data/wellness.json")


if __name__ == "__main__":
    main()
