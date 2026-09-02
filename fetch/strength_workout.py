#!/usr/bin/env python3
"""
Builds and uploads strength workouts to Garmin Connect.

The python-garminconnect builders cover cycling, running, swimming, walking and
hiking — there is none for strength, and its SportType table does not even list
strength_training. So the payload is assembled here against Garmin's private
workout-service schema.

Schema and the three gotchas below come from the unofficial documentation at
github.com/n1t3k/garmin-strength-api, cross-checked against a real strength
workout read back from this account.

Usage:
    python3 fetch/strength_workout.py --test        # sube "PRUEBA - borrar"
    python3 fetch/strength_workout.py --delete ID
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")

# Garmin's exercise taxonomy (FIT SDK Profile v20.8): 33 categories.
CATEGORIES = [
    "BENCH_PRESS", "CALF_RAISE", "CARDIO", "CARRY", "CHOP", "CORE", "CRUNCH",
    "CURL", "DEADLIFT", "FLYE", "HIP_RAISE", "HIP_STABILITY", "HIP_SWING",
    "HYPEREXTENSION", "LATERAL_RAISE", "LEG_CURL", "LEG_RAISE", "LUNGE",
    "OLYMPIC_LIFT", "PLANK", "PLYO", "PULL_UP", "PUSH_UP", "ROW",
    "SHOULDER_PRESS", "SHOULDER_STABILITY", "SHRUG", "SIT_UP", "SQUAT",
    "TOTAL_BODY", "TRICEPS_EXTENSION", "WARM_UP", "RUN",
]

KILOGRAM = {"unitId": 8, "unitKey": "kilogram", "factor": 1000.0}

# category → valid exerciseName keys. Only a subset of the FIT profile is
# documented publicly, so an unknown name is dropped rather than sent: Garmin
# accepts anything here and then stores it blank, which looks like a silent
# bug. Without a name the watch still shows the category, which is enough.
# Reference data, not personal downloads: lives in src/data/ so it is
# versioned with the code (public/data/ is gitignored).
_CATALOG_FILE = ROOT / "src" / "data" / "exercise_catalog.json"
CATALOG: dict[str, list[str]] = (
    json.loads(_CATALOG_FILE.read_text()) if _CATALOG_FILE.exists() else {}
)


def valid_exercise(category: str, name: str | None) -> str | None:
    if not name:
        return None
    known = CATALOG.get(category)
    if known and name not in known:
        print(f"  aviso: '{name}' no es un ejercicio válido de {category}; "
              f"se envía sólo la categoría", file=sys.stderr)
        return None
    return name

# --- The three easy ways to get this wrong -----------------------------------
# 1. Exercise goes in flat `category` + `exerciseName` fields, NOT a nested
#    exerciseCategoryDTO.
# 2. Reps end-condition is conditionTypeId 10; id 7 is "iterations", which
#    belongs to the repeat group, not to a set.
# 3. Rest between sets is stepType 5 ("rest"); a "recovery" step renders wrong.
REPS = {"conditionTypeId": 10, "conditionTypeKey": "reps", "displayOrder": 10, "displayable": True}
TIME = {"conditionTypeId": 2, "conditionTypeKey": "time", "displayOrder": 2, "displayable": True}
ITERATIONS = {"conditionTypeId": 7, "conditionTypeKey": "iterations", "displayOrder": 7, "displayable": False}

STEP_INTERVAL = {"stepTypeId": 3, "stepTypeKey": "interval", "displayOrder": 3}
STEP_REST = {"stepTypeId": 5, "stepTypeKey": "rest", "displayOrder": 5}
STEP_REPEAT = {"stepTypeId": 6, "stepTypeKey": "repeat", "displayOrder": 6}
NO_TARGET = {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target", "displayOrder": 1}


# Isometric and loaded-carry work is held for time, not counted in reps.
# Prescribing "32 repetitions of plank" is the giveaway that a plan was written
# without knowing the difference.
POR_TIEMPO = {"PLANK", "CARRY", "HIP_STABILITY", "SHOULDER_STABILITY", "WARM_UP", "CARDIO", "RUN"}


def _set_step(order: int, category: str, exercise: str | None,
              reps: int, weight_kg: float | None, duracion_s: int | None = None) -> dict:
    if category not in CATEGORIES:
        raise ValueError(f"categoría inválida: {category!r} (Garmin rechaza con 400)")
    por_tiempo = duracion_s is not None
    return {
        "type": "ExecutableStepDTO",
        "stepOrder": order,
        "stepType": STEP_INTERVAL,
        "endCondition": TIME if por_tiempo else REPS,
        "endConditionValue": float(duracion_s if por_tiempo else reps),
        "targetType": NO_TARGET,
        "category": category,
        # Garmin keeps exerciseName only when it matches one of its own keys;
        # anything else is accepted and then silently stored empty.
        "exerciseName": valid_exercise(category, exercise),
        "weightValue": float(weight_kg) if weight_kg else 0.0,
        "weightUnit": KILOGRAM,
    }


def _rest_step(order: int, seconds: int) -> dict:
    return {
        "type": "ExecutableStepDTO",
        "stepOrder": order,
        "stepType": STEP_REST,
        "endCondition": TIME,
        "endConditionValue": float(seconds),
        "targetType": NO_TARGET,
    }


def build(name: str, bloques: list[dict], description: str | None = None) -> dict:
    """
    bloques: [{category, exercise, sets, reps, weight_kg, rest_s}, ...]
    Each block becomes a repeat group of (set + rest).
    """
    steps: list[dict] = []
    order = 1
    for b in bloques:
        grupo_order = order
        order += 1
        hijos = [_set_step(order, b["category"], b.get("exercise"),
                           b.get("reps") or 0, b.get("weight_kg"), b.get("duracion_s"))]
        order += 1
        if b.get("rest_s"):
            hijos.append(_rest_step(order, b["rest_s"]))
            order += 1
        steps.append({
            "type": "RepeatGroupDTO",
            "stepOrder": grupo_order,
            "stepType": STEP_REPEAT,
            "numberOfIterations": b["sets"],
            "endCondition": ITERATIONS,
            "endConditionValue": float(b["sets"]),
            "skipLastRestStep": True,
            "smartRepeat": False,
            "workoutSteps": hijos,
        })

    return {
        "sportType": {"sportTypeId": 5, "sportTypeKey": "strength_training", "displayOrder": 5},
        "workoutName": name,
        "description": description,
        "workoutSegments": [{
            "segmentOrder": 1,
            "sportType": {"sportTypeId": 5, "sportTypeKey": "strength_training", "displayOrder": 5},
            "workoutSteps": steps,
        }],
    }


def connect():
    import garminconnect
    email, password = os.getenv("GARMIN_EMAIL"), os.getenv("GARMIN_PASSWORD")
    if not email or not password:
        print("ERROR: faltan GARMIN_EMAIL / GARMIN_PASSWORD en .env", file=sys.stderr)
        sys.exit(1)
    api = garminconnect.Garmin(email, password)
    api.login()
    return api


TEST = [
    {"category": "BENCH_PRESS", "exercise": "DUMBBELL_BENCH_PRESS", "sets": 3, "reps": 10, "weight_kg": 20, "rest_s": 90},
    {"category": "ROW",         "exercise": "DUMBBELL_ROW",         "sets": 3, "reps": 12, "weight_kg": 18, "rest_s": 90},
    {"category": "LATERAL_RAISE","exercise": "DUMBBELL_LATERAL_RAISE", "sets": 3, "reps": 15, "weight_kg": 8, "rest_s": 60},
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--test", action="store_true", help='Sube un workout "PRUEBA - borrar"')
    ap.add_argument("--delete", type=int, help="Borra un workout por id")
    ap.add_argument("--dry-run", action="store_true", help="Muestra el JSON sin subir nada")
    ap.add_argument("--from-stdin", action="store_true",
                    help='Lee {"name","description","date","bloques":[...]} de stdin, sube y programa')
    args = ap.parse_args()

    if args.dry_run:
        print(json.dumps(build("PRUEBA - borrar", TEST), ensure_ascii=False, indent=1))
        return

    if args.from_stdin:
        req = json.load(sys.stdin)
        payload = build(req["name"], req["bloques"], req.get("description"))
        api = connect()
        res = api.upload_workout(payload)
        wid = res.get("workoutId")
        out = {"workoutId": wid, "programado": None}
        # Uploading only puts it in the library; the calendar (and therefore the
        # watch and the phone app) needs the separate schedule call.
        if req.get("date"):
            api.schedule_workout(wid, req["date"])
            out["programado"] = req["date"]
        print(json.dumps(out, ensure_ascii=False))
        return

    api = connect()

    if args.delete:
        api.delete_workout(args.delete)
        print(f"✔ workout {args.delete} borrado")
        return

    if args.test:
        payload = build("PRUEBA - borrar", TEST, "Prueba de subida desde garmin-stats. Se puede borrar.")
        res = api.upload_workout(payload)
        wid = res.get("workoutId")
        print(f"✔ subido · workoutId={wid}")

        # Read it back: the point is to confirm Garmin kept the exercise names
        # rather than accepting them and storing blanks.
        d = api.get_workout_by_id(wid)
        print(f"  nombre: {d.get('workoutName')} · deporte: {(d.get('sportType') or {}).get('sportTypeKey')}")
        for seg in d.get("workoutSegments") or []:
            for g in seg.get("workoutSteps") or []:
                if g.get("numberOfIterations"):
                    for st in g.get("workoutSteps") or []:
                        if st.get("category"):
                            print(f"    {g['numberOfIterations']}x {st['category']}/{st.get('exerciseName')} "
                                  f"· {int(st.get('endConditionValue') or 0)} reps · {st.get('weightValue')} kg")
        print(f"\n  Para borrarlo:  python3 fetch/strength_workout.py --delete {wid}")


if __name__ == "__main__":
    main()
