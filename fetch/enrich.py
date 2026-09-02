#!/usr/bin/env python3
"""
Enriches activities.json from the already-downloaded detail files.

Two numbers the app was approximating badly:

  · Heart-rate zones. Garmin reports the real seconds-per-zone for every
    activity, but the summary did not carry them, so the app estimated the
    distribution by dropping the WHOLE session into one zone based on average
    heart rate. A ride through Z2, Z4 and Z5 counted entirely as Z3.

  · Training load (TSS). Derived from average heart rate with the same flaw.
    With the per-second stream we can integrate TRIMP sample by sample, which
    is what the metric actually calls for.

No network access: everything comes from public/data/activity_*.json.

Usage:
    python3 fetch/enrich.py
    python3 fetch/enrich.py --max-hr 185 --lthr 165
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

ROOT = Path(__file__).parent.parent
DATA = ROOT / "public" / "data"

# Mirrors DEFAULT_SETTINGS in src/types/garmin.ts.
DEFAULT_MAX_HR = 185
DEFAULT_LTHR = 165


def trimp_from_stream(streams: list[dict], duration: int, max_hr: int, lthr: int) -> float | None:
    """
    TRIMP integrated over the heart-rate stream, normalised so ~100 = one hour
    at threshold. Weighting every sample by its own intensity is the whole point
    of the metric: a session's average hides the intervals that create the load.
    """
    hrs = [(i, p["hr"]) for i, p in enumerate(streams) if p.get("hr")]
    if not hrs or duration <= 0:
        return None

    seconds_per_sample = duration / len(streams)
    total = 0.0
    for _, hr in hrs:
        reserve = (hr - 60) / (max_hr - 60)
        if reserve <= 0:
            continue
        reserve = min(reserve, 1.4)  # guard against bogus spikes
        total += (seconds_per_sample / 60) * reserve * 0.64 * math.exp(1.92 * reserve)

    th = (lthr - 60) / (max_hr - 60)
    threshold_trimp = 60 * th * 0.64 * math.exp(1.92 * th)
    return round(total / threshold_trimp * 100, 1) if threshold_trimp else None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-hr", type=int, default=DEFAULT_MAX_HR)
    ap.add_argument("--lthr", type=int, default=DEFAULT_LTHR)
    args = ap.parse_args()

    path = DATA / "activities.json"
    acts = json.loads(path.read_text())

    con_zonas = con_tss = sin_detalle = 0
    for a in acts:
        f = DATA / f"activity_{a['id']}.json"
        if not f.exists():
            sin_detalle += 1
            continue
        try:
            d = json.loads(f.read_text())
        except json.JSONDecodeError:
            sin_detalle += 1
            continue

        zonas = d.get("hrZones") or []
        segundos = [int(z.get("seconds") or 0) for z in zonas]
        if sum(segundos) > 0:
            a["zonasFC"] = segundos          # [z1..z5] en segundos, dato real de Garmin
            con_zonas += 1

        # Garmin's own trainingStressScore wins when it exists.
        if a.get("tss") is None:
            t = trimp_from_stream(d.get("streams") or [], a["duration"], args.max_hr, args.lthr)
            if t is not None:
                a["tss"] = t
                a["tssOrigen"] = "trimp-stream"
                con_tss += 1

    path.write_text(json.dumps(acts, ensure_ascii=False, separators=(",", ":")))
    print(f"  Enriquecidas {len(acts)} actividades:")
    print(f"    zonas de FC reales:  {con_zonas}")
    print(f"    TSS desde el stream: {con_tss}")
    if sin_detalle:
        print(f"    sin archivo de detalle: {sin_detalle}")


if __name__ == "__main__":
    main()
