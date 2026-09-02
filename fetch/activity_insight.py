#!/usr/bin/env python3
"""
Per-activity analysis via Cloudflare Workers AI.

Builds a digest of ONE session — splits, heart-rate zones, the shape of the
effort over time — cross-references the training calendar to see whether it
was a prescribed workout, and asks the model how well it was executed.

Writes public/data/insight_<id>.json so it is generated once and then served
as a static file like the rest of the data.

Usage:
    python3 fetch/activity_insight.py 22552342157
    python3 fetch/activity_insight.py 22552342157 --force
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from insights import DATA, DEFAULT_MODEL, call_api, credentials, extract_json  # noqa: E402

SPORT_LABELS = {
    "cycling": "ciclismo", "running": "running", "swimming": "natación",
    "strength": "fuerza", "cardio": "cardio", "walking": "caminata", "other": "otro",
}
ZONE_NAMES = ["Z1 suave", "Z2 aeróbico", "Z3 tempo", "Z4 umbral", "Z5 máximo"]


def fmt_dur(sec: float) -> str:
    m, s = divmod(int(sec), 60)
    h, m = divmod(m, 60)
    return f"{h}h {m:02d}m" if h else f"{m}:{s:02d}"


def summarise_streams(streams: list[dict], buckets: int = 10) -> list[dict]:
    """
    Compress the second-by-second series into a handful of blocks.

    The model needs the SHAPE of the session — where the hard bits were — not
    300 raw samples, which would dominate the context and be read as noise.
    """
    if not streams:
        return []
    step = max(1, len(streams) // buckets)
    out = []
    for i in range(0, len(streams), step):
        chunk = streams[i:i + step]
        def avg(k: str):
            vals = [c[k] for c in chunk if c.get(k) is not None]
            return round(statistics.fmean(vals), 1) if vals else None
        out.append({
            "bloque": f"{len(out) + 1}/{min(buckets, (len(streams) + step - 1) // step)}",
            "minuto": round(chunk[0].get("seconds", 0) / 60),
            "km": chunk[0].get("km"),
            "fc": avg("hr"),
            "velocidad": avg("speed"),
            "cadencia": avg("cadence"),
            "potencia": avg("power"),
        })
    return out[:buckets]


def find_planned(act: dict) -> dict | None:
    """
    Match the session against the archived training calendar.

    Preference order: Garmin's own activity↔workout association, then same-day,
    then the bare workoutId link. Only the first two can carry the prescribed
    steps; the last one just tells us something was prescribed.
    """
    plan_file = DATA / "plan.json"
    plan = json.loads(plan_file.read_text()) if plan_file.exists() else {"programados": []}
    day = act["startTime"][:10]
    programados = plan.get("programados", [])

    hit, how = None, None
    for w in programados:
        if w.get("actividadAsociada") and int(w["actividadAsociada"]) == int(act["id"]):
            hit, how = w, "asociación de Garmin"
            break
    if not hit:
        same_day = [w for w in programados if w.get("fecha") == day]
        if same_day:
            hit, how = same_day[0], "misma fecha"

    if hit:
        out = {
            "encontrado_por": how,
            "titulo_planificado": hit["titulo"],
            "fecha_planificada": hit.get("fecha"),
        }
        if hit.get("pasos"):
            out["estructura_prescrita"] = hit["pasos"]
            out["duracion_planificada_min"] = round((hit.get("duracion_planificada_s") or 0) / 60)
        return out

    if act.get("workoutId"):
        return {
            "encontrado_por": "vínculo sin estructura",
            "titulo_planificado": act["title"],
            "nota": "La actividad ejecutó un entrenamiento planificado, pero Garmin ya borró su "
                    "estructura detallada. Sólo queda el nombre, que codifica la prescripción.",
        }
    return None


def build_digest(act: dict, detail: dict, peers: list[dict]) -> dict:
    sport = act.get("sport") or "other"
    zones = detail.get("hrZones") or []
    ztotal = sum(z["seconds"] for z in zones) or 1
    laps = detail.get("laps") or []

    same_sport = [a for a in peers if (a.get("sport") or "other") == sport and a["id"] != act["id"]]
    recent = sorted(same_sport, key=lambda a: a["startTime"], reverse=True)[:30]

    def mean(rows, key):
        vals = [r[key] for r in rows if r.get(key)]
        return round(statistics.fmean(vals), 1) if vals else None

    digest = {
        "actividad": {
            "titulo": act["title"],
            "fecha": act["startTime"][:10],
            "hora_inicio": act["startTime"][11:16],
            "deporte": SPORT_LABELS.get(sport, sport),
            "duracion": fmt_dur(act["duration"]),
            "distancia_km": act["distance"] or None,
            "velocidad_media_kmh": act.get("avgSpeed"),
            "fc_media": act["avgHR"] or None,
            "fc_maxima": act["maxHR"] or None,
            "cadencia_media": act.get("avgCadence"),
            "potencia_media": act.get("avgPower"),
            "desnivel_m": act.get("elevationGain") or None,
            "calorias": act.get("calories") or None,
            "carga_tss": round(act["tss"]) if act.get("tss") else None,
        },
        "tiempo_por_zona_fc": {
            ZONE_NAMES[i] if i < len(ZONE_NAMES) else f"Z{i+1}": f"{round(z['seconds']/ztotal*100)}%"
            for i, z in enumerate(zones) if z["seconds"] > 0
        },
        "evolucion_por_bloques": summarise_streams(detail.get("streams") or []),
        "parciales": [
            {
                "tramo": l["index"],
                "km": l["distance"],
                "duracion": fmt_dur(l["duration"]),
                "fc": l.get("avgHR"),
                "velocidad": l.get("avgSpeed"),
            }
            for l in laps[:20]
        ],
        "referencia_personal": {
            "descripcion": f"promedios de tus últimas {len(recent)} sesiones de {SPORT_LABELS.get(sport, sport)}",
            "distancia_km": mean(recent, "distance"),
            "duracion_min": round(statistics.fmean([r["duration"] for r in recent]) / 60) if recent else None,
            "velocidad_kmh": mean(recent, "avgSpeed"),
            "fc_media": mean(recent, "avgHR"),
        },
    }

    planned = find_planned(act)
    if planned:
        digest["entrenamiento_planificado"] = planned
    return digest


SYSTEM = """Sos un entrenador de ciclismo y resistencia analizando UNA sesión puntual.

IDIOMA: español rioplatense, hablándole DIRECTAMENTE al atleta de vos ("hiciste",
"tenés", "mantuviste"). Nunca "el atleta" ni tercera persona. Pasado simple,
nunca pretérito compuesto ("hiciste", no "has hecho").

FORMATO: escribís para una persona. Números en prosa natural. NUNCA menciones
nombres de campos del JSON ni claves entre paréntesis.

QUÉ MIRAR:
- La forma del esfuerzo en "evolucion_por_bloques": dónde apretaste, dónde aflojaste,
  si la FC derivó hacia el final (fatiga) o se mantuvo.
- El reparto por zonas: si fue rodaje suave, trabajo de umbral o intervalos.
- Cómo se compara contra "referencia_personal" (tus propias sesiones similares).

SOBRE EL PLAN — regla dura:
- "hubo_plan" es true SOLO si el input trae el campo "entrenamiento_planificado".
  Si ese campo NO está, "hubo_plan" es false y "veredicto" es "indeterminable",
  por más que el título de la actividad parezca describir un entrenamiento.
  Un nombre sugerente NO es evidencia de que hubo un plan cargado.

SI HAY "entrenamiento_planificado":
- Cuando trae "estructura_prescrita", esa es la prescripción EXACTA: cada paso con
  su duración en segundos y su rango de pulsaciones objetivo ("fc_objetivo": [min, max]),
  y los bloques que se repiten bajo "repetir". Compará contra la realidad:
  · ¿La duración total se acerca a "duracion_planificada_min"?
  · ¿En los bloques y parciales se ven los intervalos duros prescritos?
  · ¿Las pulsaciones cayeron dentro de los rangos objetivo o se quedaron cortas/pasadas?
  Citá números concretos de ambos lados al juzgar.
- Cuando NO trae estructura, sólo tenés el nombre, que codifica la prescripción:
  2x5(20"x4') x5' = 2 series de 5 repeticiones de 20 segundos fuerte con 4 minutos
  suaves, 5 minutos entre series. "Fza resist 3 x 7' x 4'" = 3 bloques de 7 minutos
  con 4 de recuperación. "FONDO 100 km" = salida larga continua. "HIIT" = intervalos
  cortos intensos. Con sólo el nombre, el veredicto casi nunca puede ser mejor que
  "parcial" — decí explícitamente qué no pudiste verificar.
- Si no podés determinarlo, DECILO. No inventes que se cumplió ni que no.

Devolvés JSON válido y NADA más:
{
  "titular": "una frase de 10 palabras máximo sobre esta sesión",
  "tipo_sesion": "qué tipo de entrenamiento fue, en 3-5 palabras",
  "resumen": "2-3 oraciones sobre cómo salió la sesión",
  "observaciones": ["3 a 4 observaciones concretas, cada una citando un número"],
  "cumplimiento": {
    "hubo_plan": true | false,
    "veredicto": "cumplido" | "parcial" | "no_cumplido" | "indeterminable",
    "detalle": "una o dos oraciones. Si no hubo plan, string vacío."
  }
}"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("activity_id", type=int)
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--force", action="store_true", help="Regenerar aunque ya exista")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    out_path = DATA / f"insight_{args.activity_id}.json"
    if out_path.exists() and not args.force and not args.dry_run:
        print(json.dumps(json.loads(out_path.read_text()), ensure_ascii=False))
        return

    acts = json.loads((DATA / "activities.json").read_text())
    act = next((a for a in acts if a["id"] == args.activity_id), None)
    if not act:
        print(f"ERROR: no existe la actividad {args.activity_id}", file=sys.stderr)
        sys.exit(1)

    detail_path = DATA / f"activity_{args.activity_id}.json"
    detail = json.loads(detail_path.read_text()) if detail_path.exists() else {}

    digest = build_digest(act, detail, acts)
    if args.dry_run:
        print(json.dumps(digest, ensure_ascii=False, indent=2))
        return

    account, token = credentials()
    user_msg = "Analizá esta sesión:\n\n" + json.dumps(digest, ensure_ascii=False, indent=1)

    # The model occasionally emits malformed JSON; a single deterministic retry
    # turns an intermittent hard failure into a rare one.
    parsed, raw = None, ""
    for attempt, temperature in enumerate((0.3, 0.0)):
        res = call_api(
            f"/accounts/{account}/ai/run/{args.model}",
            token,
            {
                "messages": [
                    {"role": "system", "content": SYSTEM},
                    {"role": "user", "content": user_msg},
                ],
                "max_tokens": 1100,
                "temperature": temperature,
            },
        )
        raw = (res.get("result") or {}).get("response", "")
        parsed = extract_json(raw)
        if parsed:
            break
        print(f"  intento {attempt + 1}: JSON inválido, reintentando…", file=sys.stderr)

    if not parsed:
        print(f"ERROR: el modelo no devolvió JSON válido tras 2 intentos.\nRespuesta cruda:\n{str(raw)[:900]}", file=sys.stderr)
        sys.exit(1)

    parsed |= {"generado": datetime.now().strftime("%Y-%m-%d"), "modelo": args.model}
    out_path.write_text(json.dumps(parsed, ensure_ascii=False, indent=1))
    print(json.dumps(parsed, ensure_ascii=False))


if __name__ == "__main__":
    main()
