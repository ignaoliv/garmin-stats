#!/usr/bin/env python3
"""
La sincronización diaria: lo que cambió desde ayer, y nada más.

POR QUÉ NO ES sync.py. `sync.py` es la carga inicial: recorre las 1047
actividades, baja el detalle de cada una y tarda lo que tarda. Eso está bien
para arrancar desde cero en tu máquina, pero una función de Vercel tiene minutos
—no horas— y todos los días hay entre cero y tres actividades nuevas. Esto mira
las últimas, baja el detalle de las que faltan y refresca los archivos de
bienestar, que son chicos y se sobrescriben enteros.

DÓNDE ESCRIBE. Contra `public/data/` cuando corrés local, y contra el blob
privado cuando corre en Vercel. La diferencia se resuelve en los bordes: con
`--blob` se bajan los archivos a un directorio temporal, los mismos módulos de
siempre trabajan ahí sin enterarse, y al final sube lo que cambió. En el medio
no hay dos caminos que puedan divergir.

CÓMO SE AUTENTICA. Con el token guardado en el blob (ver token_garmin.py), nunca
con usuario y contraseña: el login pasa por Cloudflare y hacerlo todos los días
es la forma segura de comerse un 429. Si Garmin renueva la sesión durante la
corrida, el token nuevo se guarda antes de salir.

Uso:
    python3 fetch/sincronizar.py                 # local, contra public/data
    python3 fetch/sincronizar.py --blob          # lo que hace el cron
    python3 fetch/sincronizar.py --blob --seco   # sin escribir nada
    python3 fetch/sincronizar.py --blob --json   # salida JSON, para el endpoint
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

# Los archivos chicos que se sobrescriben enteros en cada corrida. Hay que
# bajarlos ANTES de trabajar: cada archivador lee el suyo y le hace merge, así
# que empezar sin ellos borraría el historial en vez de ampliarlo.
BASE = ["activities.json", "stats.json", "steps.json", "sleep.json",
        "wellness.json", "peso.json", "plan.json"]

PREFIJO = "datos/"
TOKEN = "datos/garmin_token.json"

# Cuántas actividades recientes mirar. Con una por día sobra de lejos; el número
# está alto para que una semana sin correr el cron se recupere sola.
LIMITE = 25


def _log(mensajes: list[str], texto: str, callado: bool) -> None:
    mensajes.append(texto)
    if not callado:
        print(texto)


def cliente(callado: bool = False):
    """Un cliente de Garmin logueado con el token del blob."""
    from garminconnect import Garmin
    import blob

    crudo = blob.leer(TOKEN)
    if not crudo:
        raise RuntimeError(
            f"no hay token de Garmin en {TOKEN}; "
            "corré `python3 fetch/token_garmin.py --crear` desde tu máquina"
        )
    api = Garmin()
    api.login(crudo.decode())
    if not callado:
        print("  ✔ sesión de Garmin recuperada del token (sin login)")
    return api, crudo.decode()


def _hashes(carpeta: Path) -> dict[str, str]:
    return {
        f.name: hashlib.sha256(f.read_bytes()).hexdigest()
        for f in carpeta.glob("*.json")
    }


def bajar_base(carpeta: Path, callado: bool) -> None:
    import blob
    carpeta.mkdir(parents=True, exist_ok=True)
    for nombre in BASE:
        datos = blob.leer(PREFIJO + nombre)
        if datos:
            (carpeta / nombre).write_bytes(datos)
        elif not callado:
            print(f"  aviso: {nombre} no está en el blob todavía")


def subir_cambios(carpeta: Path, antes: dict[str, str], callado: bool) -> list[str]:
    import blob
    despues = _hashes(carpeta)
    cambiados = [n for n, h in despues.items() if antes.get(n) != h]
    for nombre in cambiados:
        blob.escribir(PREFIJO + nombre, (carpeta / nombre).read_bytes())
        if not callado:
            print(f"  ↑ {nombre}")
    return cambiados


def sincronizar(api, carpeta: Path, limite: int, callado: bool) -> dict:
    """El trabajo en sí, siempre contra un directorio en disco."""
    from normalizer import normalize_summary, normalize_detail
    import sync  # se reusan sus descargas: son las mismas llamadas a Garmin

    mensajes: list[str] = []
    log = lambda t: _log(mensajes, t, callado)  # noqa: E731

    # ── 1. Las actividades recientes, mezcladas con las que ya había ─────────
    ruta_acts = carpeta / "activities.json"
    previas = json.loads(ruta_acts.read_text()) if ruta_acts.exists() else []
    por_id = {a["id"]: a for a in previas if a.get("id")}
    antes_de_todo = len(por_id)

    crudas = api.get_activities(0, limite)
    nuevas_ids = []
    for cruda in crudas:
        try:
            s = normalize_summary(cruda)
        except Exception as e:
            log(f"  aviso: no se pudo normalizar {cruda.get('activityId')}: {str(e)[:80]}")
            continue
        if not s.get("id"):
            continue
        if s["id"] not in por_id:
            nuevas_ids.append(s["id"])
        # El resumen nuevo NO pisa lo enriquecido: `zonasFC` y el TSS del stream
        # se calculan después, a partir del detalle, y volver a escribir el
        # resumen crudo encima los borraría en cada corrida.
        anterior = por_id.get(s["id"], {})
        for clave in ("zonasFC", "tssOrigen"):
            if clave in anterior:
                s[clave] = anterior[clave]
        if anterior.get("tss") is not None and s.get("tss") is None:
            s["tss"] = anterior["tss"]
        por_id[s["id"]] = s

    actividades = sorted(por_id.values(), key=lambda a: a.get("startTime") or "", reverse=True)
    log(f"  {len(crudas)} actividades miradas · {len(nuevas_ids)} nuevas "
        f"· {len(actividades)} en total (antes {antes_de_todo})")

    # ── 2. El detalle, sólo de las que no tenían ────────────────────────────
    detalles = 0
    for act_id in nuevas_ids:
        resumen = por_id[act_id]
        destino = carpeta / f"activity_{act_id}.json"
        if destino.exists():
            continue
        detalle = sync.fetch_activity_details(api, act_id)
        zonas = sync.fetch_activity_hr_zones(api, act_id)
        splits = sync.fetch_activity_splits(api, act_id)
        gpx = sync.fetch_gpx_coords(api, act_id)
        series = (sync.fetch_activity_exercise_sets(api, act_id)
                  if resumen.get("sport") == "strength" else {})
        try:
            completo = normalize_detail(resumen, detalle, zonas, splits, gpx, series)
            destino.write_text(json.dumps(completo, ensure_ascii=False, separators=(",", ":")))
            detalles += 1
            log(f"  ✔ detalle de {act_id} · {resumen.get('title', '')[:40]}")
        except Exception as e:
            log(f"  aviso: falló el detalle de {act_id}: {str(e)[:80]}")
        time.sleep(0.5)   # el mismo respiro que usa la carga inicial

    ruta_acts.write_text(json.dumps(actividades, ensure_ascii=False, separators=(",", ":")))

    # ── 3. Los archivos de bienestar ────────────────────────────────────────
    # Cada uno es chico y se reescribe entero. Van en try por separado a
    # propósito: que Garmin no conteste el sueño no es motivo para perder los
    # pasos que ya se habían bajado bien.
    tareas = [
        ("plan", lambda: __import__("plan").archive_plan(api, months_back=2)),
        ("pasos", lambda: __import__("steps").archive_steps(api, days=120)),
        ("sueño", lambda: __import__("sleep").archive_sleep(api, days=21)),
        ("recuperación", lambda: __import__("wellness").archive_wellness(api, days=30)),
        ("peso", lambda: __import__("peso").archive_peso(api, dias=730)),
    ]
    fallos = []
    for nombre, tarea in tareas:
        try:
            tarea()
            log(f"  ✔ {nombre}")
        except Exception as e:
            fallos.append(nombre)
            log(f"  ✗ {nombre}: {str(e)[:100]}")

    # ── 4. Zonas reales y TSS del stream, sobre las nuevas ──────────────────
    if detalles:
        try:
            import enrich
            acts = json.loads(ruta_acts.read_text())
            for a in acts:
                f = carpeta / f"activity_{a['id']}.json"
                if not f.exists():
                    continue
                d = json.loads(f.read_text())
                segundos = [int(z.get("seconds") or 0) for z in (d.get("hrZones") or [])]
                if sum(segundos) > 0:
                    a["zonasFC"] = segundos
                if a.get("tss") is None:
                    t = enrich.trimp_from_stream(
                        d.get("streams") or [], a["duration"],
                        enrich.DEFAULT_MAX_HR, enrich.DEFAULT_LTHR)
                    if t is not None:
                        a["tss"], a["tssOrigen"] = t, "trimp-stream"
            ruta_acts.write_text(json.dumps(acts, ensure_ascii=False, separators=(",", ":")))
            actividades = acts
            log("  ✔ zonas de FC y TSS recalculados")
        except Exception as e:
            log(f"  aviso: no se pudo enriquecer: {str(e)[:100]}")

    # ── 5. Las estadísticas globales ────────────────────────────────────────
    (carpeta / "stats.json").write_text(
        json.dumps(sync.compute_stats(actividades), ensure_ascii=False, separators=(",", ":")))

    return {
        "actividades": len(actividades),
        "nuevas": len(nuevas_ids),
        "detalles": detalles,
        "fallos": fallos,
        "mensajes": mensajes,
    }


def correr(usar_blob: bool, limite: int = LIMITE, seco: bool = False,
           callado: bool = False) -> dict:
    """Una corrida completa, con los bordes puestos según dónde viva la data."""
    comienzo = time.time()

    if usar_blob:
        # /tmp es lo único escribible en una función de Vercel, y se evapora
        # cuando termina. Es exactamente lo que hace falta acá.
        carpeta = Path(os.getenv("GARMIN_DATA_DIR") or "/tmp/gs-datos")
        os.environ["GARMIN_DATA_DIR"] = str(carpeta)
        if not callado:
            print(f"Bajando los archivos base del blob a {carpeta}…")
        bajar_base(carpeta, callado)
    else:
        import rutas
        carpeta = rutas.DATA
        carpeta.mkdir(parents=True, exist_ok=True)

    antes = _hashes(carpeta)
    api, token_previo = cliente(callado)

    resultado = sincronizar(api, carpeta, limite, callado)

    subidos: list[str] = []
    if usar_blob and not seco:
        subidos = subir_cambios(carpeta, antes, callado)
    elif seco:
        despues = _hashes(carpeta)
        subidos = [n for n, h in despues.items() if antes.get(n) != h]
        if not callado:
            print(f"  [seco] se habrían subido {len(subidos)}: {', '.join(subidos[:8])}")

    # Si Garmin renovó la sesión mientras trabajábamos, el token de arriba quedó
    # viejo. Guardarlo ahora es lo que hace que esto no caduque en unas semanas.
    if not seco:
        try:
            nuevo = api.client.dumps()
            if nuevo != token_previo:
                import blob
                blob.escribir(TOKEN, nuevo.encode())
                resultado["mensajes"].append("  ✔ token de Garmin renovado")
                if not callado:
                    print("  ✔ token de Garmin renovado")
        except Exception as e:
            resultado["mensajes"].append(f"  aviso: no se pudo guardar el token: {str(e)[:80]}")

    resultado |= {
        "ok": not resultado["fallos"],
        "archivos_subidos": len(subidos),
        "segundos": round(time.time() - comienzo, 1),
        "cuando": datetime.now().astimezone().isoformat(timespec="seconds"),
    }
    return resultado


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--blob", action="store_true", help="trabajar contra el blob (lo que hace el cron)")
    ap.add_argument("--seco", action="store_true", help="no escribir nada arriba")
    ap.add_argument("--limite", type=int, default=LIMITE, help="cuántas actividades recientes mirar")
    ap.add_argument("--json", action="store_true", help="sólo el JSON, para el endpoint")
    args = ap.parse_args()

    try:
        from dotenv import load_dotenv
        load_dotenv(Path(__file__).parent.parent / ".env")
    except ImportError:
        pass

    r = correr(args.blob, args.limite, args.seco, callado=args.json)
    if args.json:
        print(json.dumps(r, ensure_ascii=False))
        return

    print(f"\n{'✔' if r['ok'] else '⚠'} {r['nuevas']} nuevas · {r['detalles']} detalles "
          f"· {r['archivos_subidos']} archivos · {r['segundos']}s")
    if r["fallos"]:
        print(f"  fallaron: {', '.join(r['fallos'])}")


if __name__ == "__main__":
    main()
