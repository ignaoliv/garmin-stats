#!/usr/bin/env python3
"""
Training analysis via Cloudflare Workers AI (Llama).

Reads the synced activity data, builds a compact digest of it, asks the model
for an analysis, and writes public/data/insights.json for the frontend.

Runs server-side on purpose: the Cloudflare token grants account access, so it
must never reach the browser bundle the way the map key does.

Usage:
    python3 fetch/insights.py
    python3 fetch/insights.py --model @cf/meta/llama-3.1-8b-instruct
    python3 fetch/insights.py --list-models     # what your account can run
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")

DATA = ROOT / "public" / "data"
DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
API = "https://api.cloudflare.com/client/v4"

SPORT_LABELS = {
    "cycling": "ciclismo", "running": "running", "swimming": "natación",
    "strength": "fuerza", "cardio": "cardio", "walking": "caminata", "other": "otro",
}


# ─── Credentials ──────────────────────────────────────────────────────────────

def credentials() -> tuple[str, str]:
    account = os.getenv("CLOUDFLARE_ACCOUNT_ID")
    token = os.getenv("CLOUDFLARE_API_TOKEN")
    if not account or not token:
        print(
            "ERROR: faltan credenciales de Cloudflare en .env\n"
            "  CLOUDFLARE_ACCOUNT_ID=  (dash.cloudflare.com → home de la cuenta)\n"
            "  CLOUDFLARE_API_TOKEN=   (dash.cloudflare.com/profile/api-tokens,\n"
            "                           permiso 'Workers AI: Read')",
            file=sys.stderr,
        )
        sys.exit(1)
    return account, token


def call_api(path: str, token: str, payload: dict | None = None) -> dict:
    req = urllib.request.Request(
        f"{API}{path}",
        data=json.dumps(payload).encode() if payload else None,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST" if payload else "GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")[:400]
        print(f"ERROR HTTP {e.code} de Cloudflare: {body}", file=sys.stderr)
        sys.exit(1)


# ─── Digest ───────────────────────────────────────────────────────────────────

def _sport(a: dict) -> str:
    return a.get("sport") or "other"


def sincronizado_en() -> str | None:
    """Cuándo se bajaron los datos que estamos leyendo."""
    try:
        return json.loads((DATA / "stats.json").read_text()).get("syncedAt")
    except (OSError, ValueError):
        return None


def build_digest(acts: list[dict]) -> dict:
    """
    Condense ~1000 activities into the handful of numbers an analysis needs.

    Sending raw activities would blow the context window and bury the signal;
    the model reasons better over pre-computed aggregates than over a data dump.
    """
    now = datetime.now()
    parse = lambda a: datetime.fromisoformat(a["startTime"])

    def window(days_from: int, days_to: int = 0) -> list[dict]:
        lo, hi = now - timedelta(days=days_from), now - timedelta(days=days_to)
        return [a for a in acts if lo <= parse(a) < hi]

    def totals(rows: list[dict]) -> dict:
        return {
            "sesiones": len(rows),
            "horas": round(sum(a["duration"] for a in rows) / 3600, 1),
            "km": round(sum(a["distance"] for a in rows), 1),
            "desnivel_m": round(sum(a.get("elevationGain") or 0 for a in rows)),
        }

    def mix(rows: list[dict]) -> dict:
        h: dict[str, float] = defaultdict(float)
        for a in rows:
            h[SPORT_LABELS.get(_sport(a), "otro")] += a["duration"] / 3600
        return {k: round(v, 1) for k, v in sorted(h.items(), key=lambda x: -x[1])}

    year = now.year
    same_period = lambda y: [
        a for a in acts
        if parse(a).year == y and (parse(a).month, parse(a).day) <= (now.month, now.day)
    ]

    # Weekly load for the last 12 weeks, oldest first.
    weekly = []
    for i in range(11, -1, -1):
        start = now - timedelta(days=now.weekday() + i * 7)
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        rows = [a for a in acts if start <= parse(a) < start + timedelta(days=7)]
        weekly.append({
            "semana": start.strftime("%d/%m"),
            "sesiones": len(rows),
            "horas": round(sum(a["duration"] for a in rows) / 3600, 1),
        })

    pasos = build_steps_digest(now)
    recuperacion = build_recovery_digest(now)
    sueño = build_sleep_digest(now)

    strength = [a for a in acts if _sport(a) == "strength"]
    recent = sorted(acts, key=lambda a: a["startTime"], reverse=True)[:12]

    # ── Pre-computed signals ─────────────────────────────────────────────────
    # The model is asked to interpret, not to do arithmetic: leaving it to work
    # out year-over-year percentages or gap lengths from raw totals is where the
    # first version buried the most important facts under trivia.
    ytd, ytd_prev = totals(same_period(year)), totals(same_period(year - 1))
    last30, prev30 = totals(window(30)), totals(window(60, 30))
    dates = sorted({parse(a).date() for a in acts})
    dias_sin_entrenar = (now.date() - dates[-1]).days if dates else None

    # Longest gap inside the last year.
    hueco_max, hueco_desde = 0, None
    recientes = [d for d in dates if d >= (now - timedelta(days=365)).date()]
    for a1, b1 in zip(recientes, recientes[1:]):
        if (b1 - a1).days > hueco_max:
            hueco_max, hueco_desde = (b1 - a1).days, a1

    pct = lambda a, b: round((a - b) / b * 100) if b else None
    semanas_vacias = sum(1 for w in weekly if w["sesiones"] == 0)

    # Cuándo TERMINÓ el hueco más largo, no sólo cuándo empezó. Un parate de 45
    # días que se cortó hace una semana es una vuelta al entrenamiento, y el
    # modelo lo leía como un parate en curso porque sólo veía la fecha de inicio.
    hueco_termino = None
    if hueco_desde is not None:
        posteriores = [d for d in dates if d > hueco_desde]
        hueco_termino = posteriores[0] if posteriores else None
    volvio_hace = (now.date() - hueco_termino).days if hueco_termino else None

    # Semanas seguidas entrenando, contadas desde la más reciente hacia atrás.
    racha_semanas = 0
    for w in reversed(weekly):
        if w["sesiones"] == 0:
            break
        racha_semanas += 1

    señales = {
        "vs_año_pasado_horas_pct": pct(ytd["horas"], ytd_prev["horas"]),
        "vs_año_pasado_km_pct": pct(ytd["km"], ytd_prev["km"]),
        "vs_mes_anterior_horas_pct": pct(last30["horas"], prev30["horas"]),
        "dias_desde_ultima_actividad": dias_sin_entrenar,
        "hueco_mas_largo_dias_ultimo_año": hueco_max,
        "hueco_mas_largo_empezo": str(hueco_desde) if hueco_desde else None,
        "hueco_mas_largo_termino": str(hueco_termino) if hueco_termino else None,
        "dias_desde_que_volvio_a_entrenar": volvio_hace,
        "semanas_seguidas_entrenando_hasta_hoy": racha_semanas,
        "sesiones_ultimos_7_dias": window(7) and len(window(7)),
        "semanas_sin_actividad_dentro_de_las_ultimas_12_semanas": semanas_vacias,
        "año_con_mas_volumen": max(
            ((y, round(sum(a["duration"] for a in acts if a["startTime"][:4] == y) / 3600))
             for y in {a["startTime"][:4] for a in acts}),
            key=lambda x: x[1],
        ),
    }

    return {
        "señales_clave": señales,
        "generado": now.strftime("%Y-%m-%d"),
        # Marca de qué sincronización leyó este análisis. Sin esto, uno hecho a
        # las 14:39 sobrevivía a una sincronización de las 15:23 y seguía
        # diciendo "llevás 2 días sin entrenar" con la sesión de ayer ya bajada.
        "datos_hasta": sincronizado_en(),
        "historial": {
            "total_actividades": len(acts),
            "desde": min(a["startTime"][:10] for a in acts),
            "por_año": dict(sorted(Counter(a["startTime"][:4] for a in acts).items())),
        },
        "ultimos_7_dias": totals(window(7)),
        "ultimos_30_dias": totals(window(30)) | {"mezcla_horas": mix(window(30))},
        "30_dias_previos": totals(window(60, 30)),
        "este_año_hasta_hoy": totals(same_period(year)) | {"mezcla_horas": mix(same_period(year))},
        "año_pasado_mismo_periodo": totals(same_period(year - 1)),
        "carga_semanal_12_semanas": weekly,
        "fuerza": {
            "sesiones_totales": len(strength),
            "horas_totales": round(sum(a["duration"] for a in strength) / 3600),
            "ultimos_30_dias": len([a for a in strength if parse(a) >= now - timedelta(days=30)]),
        },
        "pasos_diarios": pasos,
        "recuperacion": recuperacion,
        "sueño": sueño,
        "ultimas_actividades": [
            {
                "fecha": a["startTime"][:10],
                "titulo": a["title"],
                "deporte": SPORT_LABELS.get(_sport(a), "otro"),
                "km": a["distance"],
                "minutos": round(a["duration"] / 60),
                "fc_media": a["avgHR"] or None,
            }
            for a in recent
        ],
    }


def build_steps_digest(now: datetime) -> dict | None:
    """
    Daily step counts, summarised.

    Steps measure everything the athlete does OUTSIDE structured training, so a
    quiet training block reads very differently depending on whether the rest of
    the day is active or sedentary.
    """
    f = DATA / "steps.json"
    if not f.exists():
        return None
    dias = json.loads(f.read_text()).get("dias", [])
    con_datos = [d for d in dias if d.get("pasos", 0) > 0]
    if not con_datos:
        return None

    by_date = {d["fecha"]: d for d in dias}
    # El más RECIENTE, no el primero: la lista viene de más vieja a más nueva y
    # Garmin sube el objetivo con el tiempo. Tomando el primero, el análisis
    # seguía midiendo contra los 8.000 de julio del año pasado.
    objetivo = next(
        (d["objetivo"] for d in reversed(con_datos) if d.get("objetivo")), 10000
    )

    def window(days_from: int, days_to: int = 0) -> list[dict]:
        out = []
        for i in range(days_from, days_to, -1):
            key = (now - timedelta(days=i - 1)).strftime("%Y-%m-%d")
            out.append(by_date.get(key, {"fecha": key, "pasos": 0, "objetivo": objetivo}))
        return out

    def media(rows: list[dict]) -> int:
        return round(sum(r["pasos"] for r in rows) / len(rows)) if rows else 0

    ult30, prev30 = window(30), window(60, 30)
    por_año: dict[str, list[int]] = {}
    for d in con_datos:
        por_año.setdefault(d["fecha"][:4], []).append(d["pasos"])

    mejor = max(con_datos, key=lambda d: d["pasos"])
    return {
        "objetivo_diario": objetivo,
        "media_ultimos_30_dias": media(ult30),
        "media_30_dias_previos": media(prev30),
        "dias_que_alcanzaste_el_objetivo_de_30": sum(1 for d in ult30 if d["pasos"] >= objetivo),
        "dias_bajo_5000_de_30": sum(1 for d in ult30 if d["pasos"] < 5000),
        "mejor_dia": {"fecha": mejor["fecha"], "pasos": mejor["pasos"]},
        "media_por_año": {y: round(sum(v) / len(v)) for y, v in sorted(por_año.items())},
        "dias_con_registro": len(con_datos),
    }


def build_sleep_digest(now: datetime) -> dict | None:
    """
    Sleep, with its coverage stated up front.

    Detailed nights are rare here, so the digest says how many exist rather than
    handing over averages that look like a series. Without that the model would
    happily describe a "sleep pattern" built on a handful of nights.
    """
    f = DATA / "sleep.json"
    if not f.exists():
        return None
    noches = json.loads(f.read_text()).get("noches", [])
    if not noches:
        return None

    def media(k: str) -> float | None:
        v = [n[k] for n in noches if n.get(k)]
        return round(sum(v) / len(v), 1) if v else None

    ultima = noches[-1]
    dias_desde = (now.date() - datetime.fromisoformat(ultima["fecha"]).date()).days
    total = ultima["total_s"] or 1
    barridos = (now.date() - datetime.fromisoformat(noches[0]["fecha"]).date()).days or 1

    return {
        "noches_registradas": len(noches),
        "dias_del_periodo": barridos,
        "cobertura": f"{round(len(noches) / barridos * 100)}%",
        "aviso_cobertura": (
            "Muy pocas noches medidas: no hay serie para hablar de patrones ni de tendencias de sueño."
            if len(noches) / barridos < 0.3 else None
        ),
        "ultima_noche": {
            "hace_dias": dias_desde,
            "horas": round(ultima["total_s"] / 3600, 1),
            "profundo_pct": round(ultima["profundo_s"] / total * 100),
            "rem_pct": round(ultima["rem_s"] / total * 100),
            "despierto_min": round(ultima["despierto_s"] / 60),
            "spo2_medio": ultima.get("spo2_medio"),
            "respiracion": ultima.get("respiracion_media"),
        },
        "media_de_las_noches_medidas": {
            "horas": round((media("total_s") or 0) / 3600, 1),
            "spo2": media("spo2_medio"),
            "respiracion": media("respiracion_media"),
        },
    }


def build_recovery_digest(now: datetime) -> dict | None:
    """
    Recovery signals, with an explicit note about what is missing.

    Resting heart rate is the one that matters here: a rising baseline over
    weeks is the classic marker of accumulated fatigue, and it is independent
    of how much was trained. Sleep is reported only when actually measured —
    this athlete rarely wears the watch overnight, and a digest full of zeros
    would invite the model to invent a sleep problem.
    """
    f = DATA / "wellness.json"
    if not f.exists():
        return None
    dias = json.loads(f.read_text()).get("dias", [])
    if not dias:
        return None

    def ventana(desde: int, hasta: int = 0) -> list[dict]:
        lo = (now - timedelta(days=desde)).strftime("%Y-%m-%d")
        hi = (now - timedelta(days=hasta)).strftime("%Y-%m-%d")
        return [r for r in dias if lo <= r["fecha"] < hi]

    def media(rows: list[dict], k: str) -> float | None:
        vals = [r[k] for r in rows if r.get(k) is not None]
        return round(sum(vals) / len(vals), 1) if vals else None

    u30, p30 = ventana(30), ventana(60, 30)
    con_sueño = [r for r in dias if r.get("sueñoSegundos")]

    out = {
        "fc_reposo_media_30d": media(u30, "fcReposo"),
        "fc_reposo_media_30d_previos": media(p30, "fcReposo"),
        "estres_medio_30d": media(u30, "estresMedio"),
        "bateria_corporal_minima_media_30d": media(u30, "bateriaMin"),
        "bateria_corporal_maxima_media_30d": media(u30, "bateriaMax"),
        "dias_con_registro": len(dias),
    }
    out["datos_de_sueño"] = (
        f"solo {len(con_sueño)} noches medidas de {len(dias)} — insuficiente para analizar el sueño"
        if len(con_sueño) < len(dias) * 0.3
        else f"{len(con_sueño)} noches medidas"
    )
    return out


# ─── Prompt ───────────────────────────────────────────────────────────────────

SYSTEM = """Sos un entrenador deportivo analizando los datos de un atleta amateur.

IDIOMA: español rioplatense, hablándole DIRECTAMENTE al atleta de vos.
Escribís "llevás", "venís", "tenés", "entrenaste". NUNCA digas "el atleta"
ni hables en tercera persona. Los imperativos también van en voseo, con el
acento en la última sílaba: "mantené", "sumá", "subí", "bajá", "aumentá",
"descansá", "asegurate", "dormí". NUNCA "mantén", "suma", "sube", "asegúrate",
"duerme", que son de España. Pasado simple ("fue", "bajó"), nunca pretérito
compuesto ("ha sido", "ha bajado"). Directo, sin relleno.

FORMATO: escribís para una persona, no para un programador. Los números van
en prosa natural ("67% menos horas que el año pasado"). NUNCA menciones nombres
de campos del JSON ni uses paréntesis con claves tipo "señales_clave.xxx: -67".
Las fechas en castellano ("26 de junio"), no en formato ISO.

QUÉ PRIORIZAR — el campo "señales_clave" ya trae lo importante calculado.
Empezá por ahí y ordená por magnitud:
1. Qué está pasando AHORA: los últimos 7 días y las semanas seguidas entrenando.
2. Caídas o subidas grandes de volumen contra el año pasado o el mes anterior.
3. Huecos largos sin entrenar y semanas vacías.
4. Cambios en la mezcla de deportes.
Un dato chico (desnivel de una salida, calorías) NO va en las observaciones
salvo que sea lo único relevante que haya. Y ninguna observación repite el
titular con otras palabras: el titular ya se lee arriba, las observaciones
agregan algo distinto.

EL PRESENTE PESA MÁS QUE EL PROMEDIO ANUAL. La comparación contra el año
pasado describe doce meses; la última semana describe hoy, y es sobre hoy que
se decide qué hacer mañana.
- Si "dias_desde_que_volvio_a_entrenar" es chico, el hueco YA TERMINÓ: es una
  VUELTA al entrenamiento y se cuenta como tal ("volviste a entrenar hace X
  días"), nunca como un parate en curso.
- Si "semanas_seguidas_entrenando_hasta_hoy" es 2 o más, hay una racha en
  marcha. Nombrala antes que la caída anual: es lo que el atleta está
  sosteniendo ahora.
- Un arranque después de un parate se sostiene subiendo de a poco. NUNCA
  recomiendes saltar a sesiones largas ni duplicar el volumen en la primera
  semana de vuelta: la lesión aparece justamente ahí.
- El promedio anual se puede seguir mencionando, pero como contexto de dónde
  viene, no como el titular de lo que está pasando.

PASOS DIARIOS ("pasos_diarios"): miden todo lo que se mueve FUERA del
entrenamiento. Son una dimensión distinta del volumen de entrenamiento y hay que
leerlos junto con él:
- Poco entrenamiento + pocos pasos = vida sedentaria, es la señal más preocupante.
- Poco entrenamiento + muchos pasos = se mantiene activo aunque no entrene formal.
- Referencias habituales: menos de 5.000 pasos por día se considera sedentario,
  7.000-8.000 ya trae beneficios de salud. El objetivo que tiene puesto en el
  reloj viene en "objetivo_diario": usá ese número, no uno de memoria.
Si el campo "pasos_diarios" no está o es null, no hables de pasos: decí en el
bloque correspondiente que todavía no hay datos.

RECUPERACIÓN ("recuperacion"): es la otra mitad de la ecuación. La carga de
entrenamiento sólo es sostenible si el cuerpo la asimila.
- La FC EN REPOSO es la señal principal, y su DIRECCIÓN se lee así:
  · BAJÓ respecto a los 30 días previos → MEJORA. El corazón está más eficiente
    y descansado. Es una buena noticia, decilo como tal.
  · SUBIÓ → EMPEORA. Es el marcador clásico de fatiga acumulada, estrés o
    enfermedad incubándose.
  · Ojo: menos pulsaciones = mejor. No confundas "bajó la FC en reposo" con
    "bajó la recuperación": son cosas opuestas.
  Como referencia, por debajo de 50 ppm es una FC en reposo de persona bien
  entrenada.
- Body battery: cuánto carga (máxima) y cuánto se drena (mínima) en el día.
SUEÑO ("sueño"): mirá primero "aviso_cobertura".
- Si trae un aviso, NO hables de patrones ni de tendencias de sueño. Podés
  comentar la última noche si es reciente, y decir que faltan noches medidas.
- La última noche sólo es relevante si "hace_dias" es 0 o 1. Más vieja que eso,
  mencionala como dato aislado, no como estado actual.
- Referencias: 13-23% de sueño profundo y 20-25% de REM sobre el total.
  SpO2 medio por debajo de 90% de forma repetida merece consulta médica, pero
  NO diagnostiques: sugerí consultarlo y nada más.

Reglas:
- Basate SOLO en los números que te doy. No inventes nada.
- CADA observación cita un número concreto del digest.
- CADA recomendación es accionable y cuantificada: "subí a 3 sesiones por semana",
  no "aumentá la frecuencia". Si no podés cuantificarla, no la incluyas.
- Prohibido el relleno tipo "incluí más variedad" o "incrementá la intensidad".
- No des consejo médico. Si ves sobrecarga, sugerí bajar carga, no diagnostiques.

Devolvés JSON válido y NADA más, con esta forma exacta:
{
  "titular": "una frase de 10 palabras máximo que resuma el momento actual",
  "estado": "bien" | "atencion" | "alerta",
  "resumen": "2-3 oraciones sobre cómo viene entrenando",
  "observaciones": ["3 a 5 observaciones concretas, cada una citando un número"],
  "recomendaciones": ["2 a 3 sugerencias accionables para las próximas semanas"],
  "recuperacion": {
    "estado": "bien" | "atencion" | "alerta",
    "titular": "una frase corta sobre cómo viene tu recuperación",
    "detalle": "2-3 oraciones citando la FC EN REPOSO y su dirección, y el sueño de anoche si es de hoy o ayer, relacionándolo con la carga de entrenamiento. Si la cobertura de sueño es baja, decilo en vez de inventar un patrón."
  },
  "pasos": {
    "estado": "bien" | "atencion" | "alerta",
    "titular": "una frase corta sobre tu actividad diaria fuera del entrenamiento",
    "detalle": "2-3 oraciones citando la media diaria y cómo se compara con el objetivo y con el mes anterior. Relacionalo con el volumen de entrenamiento."
  }
}"""


def build_prompt(digest: dict) -> str:
    return (
        "Analizá estos datos de entrenamiento y devolvé el JSON pedido.\n\n"
        + json.dumps(digest, ensure_ascii=False, indent=1)
    )


def extract_json(text: object) -> dict | None:
    """
    Salvage the JSON object from the model's reply.

    Workers AI sometimes returns `response` already parsed as an object and
    sometimes as a string wrapped in prose or code fences, so handle both.
    """
    if isinstance(text, dict):
        return text
    if not isinstance(text, str):
        return None
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        return None
    try:
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return None


# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--list-models", action="store_true", help="Listar los modelos de texto disponibles y salir")
    ap.add_argument("--dry-run", action="store_true", help="Mostrar el digest sin llamar al modelo")
    ap.add_argument("--json", action="store_true", help="Emitir sólo el JSON resultante (para el endpoint)")
    args = ap.parse_args()

    acts_path = DATA / "activities.json"
    if not acts_path.exists():
        print("ERROR: falta public/data/activities.json — corré primero fetch/sync.py", file=sys.stderr)
        sys.exit(1)
    acts = json.loads(acts_path.read_text())

    if args.dry_run:
        print(json.dumps(build_digest(acts), ensure_ascii=False, indent=2))
        return

    account, token = credentials()

    if args.list_models:
        res = call_api(f"/accounts/{account}/ai/models/search?search=llama&per_page=50", token)
        for m in res.get("result", []):
            print(f"  {m.get('name')}")
        return

    digest = build_digest(acts)
    print(f"Analizando {digest['historial']['total_actividades']} actividades con {args.model}…")

    res = call_api(
        f"/accounts/{account}/ai/run/{args.model}",
        token,
        {
            "messages": [
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": build_prompt(digest)},
            ],
            "max_tokens": 1200,
            "temperature": 0.3,
        },
    )

    raw = (res.get("result") or {}).get("response", "")
    parsed = extract_json(raw)
    if not parsed:
        print("ERROR: el modelo no devolvió JSON válido. Respuesta cruda:\n", raw[:600], file=sys.stderr)
        sys.exit(1)

    out = parsed | {
        "generado": digest["generado"],
        "datos_hasta": digest["datos_hasta"],
        "modelo": args.model,
    }
    (DATA / "insights.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
    if args.json:
        print(json.dumps(out, ensure_ascii=False))
        return
    print(f"\n✔ Guardado en public/data/insights.json\n")
    print(f"  {out.get('titular')}")
    print(f"  estado: {out.get('estado')}")


if __name__ == "__main__":
    main()
