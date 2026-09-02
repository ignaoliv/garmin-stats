#!/usr/bin/env python3
"""
Downloads the Garmin training calendar into public/data/plan.json.

Scheduled workouts (from a training plan, or pushed by TrainingPeaks) live on
the calendar, not on the activity. Each executed activity carries a workoutId,
but Garmin deletes one-off pushed workouts once they are consumed — so the
calendar is the only durable record of what was prescribed.

Usage:
    python3 fetch/plan.py                # últimos 6 meses + el próximo
    python3 fetch/plan.py --months 12
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")
DATA = ROOT / "public" / "data"


def month_range(back: int, forward: int = 1) -> list[tuple[int, int]]:
    today = date.today()
    out = []
    for i in range(-back, forward + 1):
        m = today.month + i
        y = today.year + (m - 1) // 12
        out.append((y, (m - 1) % 12 + 1))
    return out


STEP_LABELS = {
    "warmup": "calentamiento", "interval": "intervalo", "rest": "recuperación",
    "cooldown": "vuelta a la calma", "recovery": "recuperación", "repeat": "repetir",
    "other": "bloque",
}


def normalize_step(step: dict) -> dict | None:
    """Flatten one workout step (or repeat group) into something readable."""
    if step.get("type") == "RepeatGroupDTO" or step.get("numberOfIterations"):
        hijos = [normalize_step(c) for c in step.get("workoutSteps") or []]
        hijos = [h for h in hijos if h]
        if not hijos:
            return None
        return {"repetir": step.get("numberOfIterations"), "pasos": hijos}

    cond = (step.get("endCondition") or {}).get("conditionTypeKey")
    val = step.get("endConditionValue")
    target = (step.get("targetType") or {}).get("workoutTargetTypeKey")

    out: dict = {"tipo": STEP_LABELS.get((step.get("stepType") or {}).get("stepTypeKey", ""), "bloque")}
    if cond == "time" and val:
        out["duracion_s"] = int(val)
    elif cond == "distance" and val:
        out["distancia_m"] = int(val)
    elif cond:
        out["fin"] = cond

    lo, hi = step.get("targetValueOne"), step.get("targetValueTwo")
    if target == "heart.rate.zone" and lo and hi:
        out["fc_objetivo"] = [int(lo), int(hi)]
    elif target == "power.zone" and lo and hi:
        out["potencia_objetivo"] = [int(lo), int(hi)]
    elif target == "cadence" and lo and hi:
        out["cadencia_objetivo"] = [int(lo), int(hi)]
    return out


def normalize_workout(workout: dict) -> dict:
    pasos = []
    for seg in workout.get("workoutSegments") or []:
        for st in seg.get("workoutSteps") or []:
            n = normalize_step(st)
            if n:
                pasos.append(n)

    def total(items) -> int:
        s = 0
        for it in items:
            if "repetir" in it:
                s += (it["repetir"] or 1) * total(it["pasos"])
            else:
                s += it.get("duracion_s", 0)
        return s

    return {"pasos": pasos, "duracion_planificada_s": total(pasos)}


def archive_plan(api, months_back: int = 6) -> int:
    """Download the calendar and merge it into the plan archive. Returns new count."""
    # Library workouts keep their full structure; the calendar only names them.
    library = {}
    try:
        for w in api.get_workouts(0, 100):
            library[w["workoutName"].strip()] = {
                "workoutId": w["workoutId"],
                "sport": (w.get("sportType") or {}).get("sportTypeKey"),
            }
        print(f"Biblioteca de workouts: {len(library)}")
    except Exception as e:
        print(f"  aviso: no se pudo leer la biblioteca ({str(e)[:80]})")

    scheduled, activities_on_calendar = [], []
    for year, month in month_range(months_back):
        try:
            cal = api.get_scheduled_workouts(year, month)
        except Exception as e:
            print(f"  {year}-{month:02d}: error {str(e)[:60]}")
            continue
        items = cal.get("calendarItems") or []
        for it in items:
            if it.get("itemType") == "workout":
                name = (it.get("title") or "").strip()
                entry = {
                    "id": it.get("id"),
                    "fecha": it.get("date"),
                    "titulo": name,
                    "workoutIdBiblioteca": library.get(name, {}).get("workoutId"),
                    "deporte": library.get(name, {}).get("sport"),
                }
                # Grab the structure NOW: Garmin drops one-off workouts once they
                # are executed, so a plan not captured today is gone forever.
                try:
                    sched = api.get_scheduled_workout_by_id(it["id"])
                    entry["actividadAsociada"] = sched.get("associatedActivityId")
                    entry |= normalize_workout(sched.get("workout") or {})
                except Exception as e:
                    entry["error_estructura"] = str(e)[:80]
                scheduled.append(entry)
            elif it.get("itemType") == "activity":
                activities_on_calendar.append({"id": it.get("id"), "fecha": it.get("date")})
        print(f"  {year}-{month:02d}: {len(items)} items")

    # A workout near a month boundary shows up in both months' calendars.
    seen, unique = set(), []
    for w in scheduled:
        if w["id"] in seen:
            continue
        seen.add(w["id"])
        unique.append(w)
    scheduled = sorted(unique, key=lambda x: x["fecha"] or "")
    # Merge with whatever was captured before — old plans vanish from Garmin,
    # so the file is an archive, not a snapshot.
    DATA.mkdir(parents=True, exist_ok=True)
    existing = {}
    plan_file = DATA / "plan.json"
    if plan_file.exists():
        try:
            for w in json.loads(plan_file.read_text()).get("programados", []):
                existing[w["id"]] = w
        except Exception:
            pass

    nuevos = 0
    for w in scheduled:
        if w["id"] not in existing:
            nuevos += 1
        # A freshly fetched entry with structure wins; otherwise keep the archive.
        if w.get("pasos") or w["id"] not in existing:
            existing[w["id"]] = {**existing.get(w["id"], {}), **w}

    scheduled = sorted(existing.values(), key=lambda x: x.get("fecha") or "")
    out = {
        "descargado": date.today().isoformat(),
        "programados": scheduled,
        "actividades_en_calendario": len(activities_on_calendar),
    }
    (DATA / "plan.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
    plan_file.write_text(json.dumps(out, ensure_ascii=False, indent=1))
    con_pasos = sum(1 for w in scheduled if w.get("pasos"))
    print(f"  Plan archivado: {len(scheduled)} workouts ({nuevos} nuevos, {con_pasos} con estructura)")
    return nuevos


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--months", type=int, default=6, help="Meses hacia atrás a descargar")
    args = ap.parse_args()

    import garminconnect

    email, password = os.getenv("GARMIN_EMAIL"), os.getenv("GARMIN_PASSWORD")
    if not email or not password:
        print("ERROR: faltan GARMIN_EMAIL / GARMIN_PASSWORD en .env", file=sys.stderr)
        sys.exit(1)

    api = garminconnect.Garmin(email, password)
    api.login()
    print(f"Logged in as {email}")
    archive_plan(api, args.months)
    print("   → public/data/plan.json")


if __name__ == "__main__":
    main()
