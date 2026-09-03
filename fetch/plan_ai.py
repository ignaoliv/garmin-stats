#!/usr/bin/env python3
"""
Multi-week strength plan, designed by Llama on Cloudflare Workers AI.

Reads the athlete's real state — training load, recovery, strength history,
what they already did this year — and returns a structured plan the app can
turn into Garmin workouts.

Usage:
    python3 fetch/plan_ai.py --weeks 4 --days 3
    python3 fetch/plan_ai.py --from-stdin      # {"weeks":4,"days":3,"objetivo":"..."}
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from insights import (  # noqa: E402
    DATA, DEFAULT_MODEL, build_recovery_digest, call_api, credentials, extract_json,
)

CATALOGO = json.loads((Path(__file__).parent.parent / "src/data/exercise_catalog.json").read_text())
MUSCULOS = json.loads((Path(__file__).parent.parent / "src/data/exercise_meta.json").read_text())["musculosPorCategoria"]


def estado_del_atleta() -> dict:
    """
    The numbers that should shape a plan: how much they are training now, how
    they are recovering, and what their strength history actually looks like.
    """
    now = datetime.now()
    acts = json.loads((DATA / "activities.json").read_text())
    parse = lambda a: datetime.fromisoformat(a["startTime"])

    def ventana(dias: int) -> list[dict]:
        return [a for a in acts if parse(a) >= now - timedelta(days=dias)]

    fuerza = [a for a in acts if a.get("sport") == "strength"]
    f30 = [a for a in fuerza if parse(a) >= now - timedelta(days=30)]
    u30 = ventana(30)

    # Weekly load over the last 8 weeks: the plan has to start from where the
    # athlete is, not from where a textbook says a plan should start.
    semanas = []
    for i in range(7, -1, -1):
        ini = now - timedelta(days=now.weekday() + i * 7)
        ini = ini.replace(hour=0, minute=0, second=0, microsecond=0)
        rows = [a for a in acts if ini <= parse(a) < ini + timedelta(days=7)]
        semanas.append({
            "semana": ini.strftime("%d/%m"),
            "sesiones": len(rows),
            "de_fuerza": sum(1 for a in rows if a.get("sport") == "strength"),
            "horas": round(sum(a["duration"] for a in rows) / 3600, 1),
        })

    dur = [a["duration"] / 60 for a in f30]
    return {
        "hoy": now.strftime("%Y-%m-%d"),
        "ultimos_30_dias": {
            "sesiones_totales": len(u30),
            "sesiones_de_fuerza": len(f30),
            "horas": round(sum(a["duration"] for a in u30) / 3600, 1),
            "duracion_media_fuerza_min": round(sum(dur) / len(dur)) if dur else None,
        },
        "historial_de_fuerza": {
            "sesiones_totales": len(fuerza),
            "horas_totales": round(sum(a["duration"] for a in fuerza) / 3600),
            "primera": min((a["startTime"][:10] for a in fuerza), default=None),
            "fc_media_tipica": round(sum(a["avgHR"] for a in f30 if a["avgHR"]) / max(sum(1 for a in f30 if a["avgHR"]), 1)) or None,
        },
        "carga_semanal_8_semanas": semanas,
        "recuperacion": build_recovery_digest(now),
        # Weights were never recorded, so the plan cannot progress from a known
        # baseline. Stated explicitly so the model does not invent one.
        "datos_de_carga": "no hay registro histórico de kilos ni repeticiones por ejercicio",
    }


SYSTEM = """Sos un entrenador de fuerza diseñando un plan para un atleta amateur
que además hace ciclismo.

IDIOMA: español rioplatense, hablándole DIRECTAMENTE de vos ("venís", "vas a
hacer", "tenés"). NUNCA escribas "el atleta" ni hables en tercera persona: le
estás hablando a él, no describiéndolo a otra persona.

REGLAS DURAS:
- Usá SOLO categorías de esta lista para "category": {categorias}
- Partí del estado real que te doy. Si viene entrenando 2 veces por mes, un plan
  de 5 días por semana no lo va a hacer. Progresá desde donde está.
- Si "datos_de_carga" dice que no hay registro de kilos, NO prescribas pesos
  absolutos: prescribí repeticiones y una pauta de esfuerzo (por ejemplo "dejando
  2 repeticiones en reserva"), y decí que en la primera semana hay que calibrar.

AJUSTE DE CARGA — usá el estado real para decidir la dirección:
- FC en reposo bajando y carga estable → hay margen para subir.
- FC en reposo subiendo, o muchas semanas sin entrenar → sostener o bajar; el
  cuerpo no viene asimilando.
- Volver después de un parón NO es momento de subir: es momento de reconstruir
  el hábito con cargas conservadoras.
- Sé concreto con los incrementos (2,5 kg en tren superior, 5 kg en tren
  inferior es lo habitual), pero sólo como regla a futuro, no como peso inicial.
- Cada semana debe progresar de forma explícita respecto a la anterior, y la
  progresión tiene que estar en "progresion".
- Estas categorías se sostienen POR TIEMPO, no por repeticiones: {por_tiempo}.
  Para ellas usá "duracion_s" (segundos) y omití "reps". Progresarlas es sumar
  segundos, nunca repeticiones: "3x32 repeticiones de plancha" no existe.
- Distribuí los grupos musculares: no repitas el mismo patrón dos días seguidos.
- Tené en cuenta el ciclismo: no le pongas piernas pesadas el día antes de una
  salida larga si el historial muestra que sale los fines de semana.

SI VIENE UN "evento_objetivo", el plan se ordena hacia esa fecha:
- La última semana del plan es la de la carrera y va en descarga: mitad del
  volumen, nada de fallo muscular, nada de ejercicio nuevo. Se llega descansado,
  no fundido. Ganar fuerza en los últimos siete días es imposible; perderla por
  llegar cansado, muy fácil.
- La anteúltima semana también baja, aunque menos.
- Nada de piernas pesadas en los últimos diez días: sentadilla y peso muerto
  bajan a la mitad de las series y se quedan lejos del fallo.
- El resto del plan va de más general a más específico a medida que se acerca
  la fecha. Si la carrera es de ciclismo, la fuerza pasa de construir a sostener:
  es sostén del pedaleo, no el objetivo en sí.
- El día de la carrera NO lleva sesión: ese día se corre. La última sesión del
  plan cae como mínimo dos días antes.
- En "resumen" nombrá la carrera y cuántas semanas hay hasta ella.
- Si faltan menos de tres semanas no hay bloque de fuerza que construir: el plan
  es de mantenimiento y descarga, y decilo con todas las letras en "resumen".

Devolvés JSON válido y NADA más:
{{
  "titulo": "nombre corto del plan",
  "resumen": "2-3 oraciones sobre la lógica del plan y por qué encaja con su estado",
  "advertencias": ["cosas a tener en cuenta, incluida la calibración de cargas"],
  "ajustes_de_carga": {{
    "estado": "subir" | "sostener" | "bajar",
    "detalle": "2-3 oraciones sobre si conviene subir cargas, sostener o bajar, citando los números de estado y recuperación que te di. Si no hay historial de kilos, decí cómo calibrar en la primera semana en vez de inventar un peso.",
    "regla": "una regla concreta y accionable para decidir semana a semana, por ejemplo: si completás todas las series con 2 repeticiones en reserva, subí 2,5 kg la próxima"
  }},
  "semanas": [
    {{
      "numero": 1,
      "foco": "en 3-6 palabras",
      "progresion": "qué cambia respecto a la semana anterior",
      "sesiones": [
        {{
          "nombre": "Empuje A",
          "dia_offset": 0,
          "bloques": [
            {{"category": "BENCH_PRESS", "sets": 3, "reps": 10, "rest_s": 90, "nota": "2 repeticiones en reserva"}},
            {{"category": "PLANK", "sets": 3, "duracion_s": 40, "rest_s": 60, "nota": "sin dejar caer la cadera"}}
          ]
        }}
      ]
    }}
  ]
}}

"dia_offset" son días desde el inicio del plan (0 = primer día)."""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--weeks", type=int, default=4)
    ap.add_argument("--days", type=int, default=3)
    ap.add_argument("--objetivo", type=str, default="ganar fuerza general manteniendo el ciclismo")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--evento", type=str, default="", help='JSON: {"nombre","fecha","disciplina","localidad"}')
    ap.add_argument("--from-stdin", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    evento = None
    if args.from_stdin:
        req = json.load(sys.stdin)
        args.weeks = int(req.get("weeks", args.weeks))
        args.days = int(req.get("days", args.days))
        args.objetivo = req.get("objetivo") or args.objetivo
        evento = req.get("evento") or None
    elif args.evento:
        evento = json.loads(args.evento)

    estado = estado_del_atleta()
    pedido = {
        "objetivo": args.objetivo,
        "semanas": args.weeks,
        "dias_por_semana": args.days,
        "estado_actual": estado,
    }

    if evento and evento.get("fecha"):
        faltan = (date.fromisoformat(evento["fecha"]) - date.today()).days
        # El plan termina el día de la carrera, no una semana después: las
        # semanas se calculan desde la fecha, no se piden aparte.
        # Semanas enteras que entran antes de la fecha. Redondear para arriba
        # daba un plan más largo que el tiempo disponible.
        semanas = max(1, min(12, faltan // 7))
        args.weeks = semanas
        pedido["semanas"] = semanas
        pedido["evento_objetivo"] = {
            "nombre": evento.get("nombre"),
            "fecha": evento["fecha"],
            "disciplina": evento.get("disciplina"),
            "lugar": evento.get("localidad"),
            "dias_hasta_la_carrera": faltan,
            "semanas_hasta_la_carrera": semanas,
        }
    if args.dry_run:
        print(json.dumps(pedido, ensure_ascii=False, indent=2))
        return

    account, token = credentials()
    from strength_workout import POR_TIEMPO
    system = SYSTEM.format(
        categorias=", ".join(sorted(MUSCULOS)),
        por_tiempo=", ".join(sorted(POR_TIEMPO)),
    )

    parsed, raw = None, ""
    for temperature in (0.4, 0.0):
        res = call_api(
            f"/accounts/{account}/ai/run/{args.model}",
            token,
            {
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": "Diseñá el plan:\n\n" + json.dumps(pedido, ensure_ascii=False, indent=1)},
                ],
                "max_tokens": 3000,
                "temperature": temperature,
            },
        )
        raw = (res.get("result") or {}).get("response", "")
        parsed = extract_json(raw)
        if parsed:
            break
        print("  JSON inválido, reintentando…", file=sys.stderr)

    if not parsed:
        print(f"ERROR: el modelo no devolvió JSON válido.\n{str(raw)[:800]}", file=sys.stderr)
        sys.exit(1)

    # Drop categories the model invented rather than letting Garmin reject the
    # upload later with a 400.
    validas = set(MUSCULOS)
    descartados = 0
    for sem in parsed.get("semanas", []):
        for ses in sem.get("sesiones", []):
            antes = len(ses.get("bloques", []))
            ses["bloques"] = [b for b in ses.get("bloques", []) if b.get("category") in validas]
            descartados += antes - len(ses["bloques"])
    if descartados:
        print(f"  aviso: {descartados} bloques descartados por categoría inválida", file=sys.stderr)

    parsed["generado"] = estado["hoy"]
    parsed["modelo"] = args.model
    print(json.dumps(parsed, ensure_ascii=False))


if __name__ == "__main__":
    main()
