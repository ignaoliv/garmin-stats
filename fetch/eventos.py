#!/usr/bin/env python3
"""
Baja el calendario de carreras de la región a public/data/eventos.json.

No hay API pública de eventos de resistencia en Argentina: los agregadores
grandes (Ahotu, Battistrada, Finishers) no publican una, y varios devuelven 403
a cualquier cosa que no sea un navegador. calendariodecarreras.ar es la
excepción útil: publica cada carrera como schema.org/SportsEvent en JSON-LD, o
sea datos estructurados pensados para ser leídos por máquinas, y su robots.txt
permite el paso a `User-agent: *`. Bloquea por nombre a los rastreadores de
entrenamiento de modelos (ClaudeBot, GPTBot, CCBot y compañía); esto no es uno:
baja unas pocas páginas por día para un calendario personal y se identifica
como lo que es.

El archivo es acumulativo. Una carrera que ya pasó desaparece del sitio pero se
conserva acá, porque el historial sirve para saber a qué corriste el año pasado.

Uso:
    python3 fetch/eventos.py                      # todas las disciplinas, año actual y el próximo
    python3 fetch/eventos.py --disciplinas ciclismo,running
    python3 fetch/eventos.py --regiones centro,sur
    python3 fetch/eventos.py --dry-run            # muestra lo que traería, sin escribir
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).parent.parent
DATA = ROOT / "public" / "data"
SALIDA = DATA / "eventos.json"

BASE = "https://calendariodecarreras.ar"

# Cómo nos presentamos. Un agente honesto y rastreable es la diferencia entre
# leer datos abiertos y hacerse pasar por un navegador para esquivar un bloqueo.
AGENTE = "garmin-stats/1.0 (calendario de entrenamiento personal; 1 req/s)"

# El sitio parte el país en tres ediciones regionales. Buenos Aires vive en
# "centro"; "sur" cubre la Patagonia y "norte" el NOA/NEA.
REGIONES = ("centro", "sur", "norte")

DISCIPLINAS = (
    "ciclismo", "running", "triatlon", "duatlon", "trekking", "caminata",
    "aguas-abiertas", "natacion", "carrera-con-obstaculos",
    "disciplinas-combinadas", "canicross", "dogrun", "tetratlon",
)

# Entre pedido y pedido. El sitio es de un proyecto chico y nos deja pasar.
PAUSA_S = 1.0


def bajar(url: str, timeout: int = 25) -> str | None:
    req = urllib.request.Request(url, headers={"User-Agent": AGENTE})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read().decode("utf-8", "replace")
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
        print(f"  ⚠ {url}: {e}", file=sys.stderr)
        return None


_LD = re.compile(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', re.S)


def extraer_eventos(html: str) -> list[dict]:
    """Saca los SportsEvent del JSON-LD.

    Vienen anidados dentro de un ItemList, así que hay que recorrer el árbol
    entero: buscar sólo en la raíz devuelve cero.
    """
    encontrados: list[dict] = []

    def hurgar(nodo) -> None:
        if isinstance(nodo, dict):
            if nodo.get("@type") in ("SportsEvent", "Event"):
                encontrados.append(nodo)
            for v in nodo.values():
                hurgar(v)
        elif isinstance(nodo, list):
            for v in nodo:
                hurgar(v)

    for bloque in _LD.findall(html):
        try:
            hurgar(json.loads(bloque))
        except ValueError:
            continue
    return sin_destacados(encontrados)


def sin_destacados(eventos: list[dict]) -> list[dict]:
    """Descarta la carrera promocionada que va clavada arriba de todo.

    El listado viene en orden cronológico estricto, salvo por una carrera
    destacada que el sitio fija en la primera posición de TODAS las páginas de
    disciplina — la misma aparece en ciclismo, en running y en natación. Si se
    la toma como una más, una carrera de 5K termina etiquetada como ciclismo.

    Se la reconoce porque rompe el orden: se descartan las primeras entradas
    hasta que lo que queda vuelve a estar ordenado por fecha. Si el desorden es
    más profundo no es una destacada sino otra cosa, y entonces no se toca nada.
    """
    fechas = [e.get("startDate") or "" for e in eventos]
    for corte in range(0, min(3, len(fechas))):
        if fechas[corte:] == sorted(fechas[corte:]):
            return eventos[corte:]
    return eventos


def normalizar(ev: dict, disciplina: str) -> dict | None:
    url = ev.get("url") or ev.get("mainEntityOfPage")
    fecha = (ev.get("startDate") or "")[:10]
    if not url or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", fecha):
        return None

    lugar = ev.get("location") or {}
    dom = lugar.get("address") or {}
    desc = (ev.get("description") or "").strip()

    return {
        "id": url.rstrip("/").rsplit("/", 2)[-2] + "-" + fecha[:4],
        "nombre": (ev.get("name") or "").strip(),
        "fecha": fecha,
        "disciplina": disciplina,
        "localidad": dom.get("addressLocality") or lugar.get("name") or "",
        "provincia": dom.get("addressRegion") or "",
        "url": url,
        "imagen": ev.get("image") or None,
        # El texto completo es propaganda de varios párrafos; alcanza con el
        # primer tramo para saber de qué se trata.
        "resumen": (desc[:280].rsplit(" ", 1)[0] + "…") if len(desc) > 280 else desc,
    }


# A partir de cuántas disciplinas distintas una carrera deja de ser una carrera
# y pasa a ser publicidad. Un triatlón puede figurar legítimamente en dos
# (triatlón y natación); en tres o más ya es la destacada del sitio.
LIMITE_DISCIPLINAS = 3


def recolectar(disciplinas: list[str], regiones: list[str], años: list[int]) -> dict[str, dict]:
    hallados: dict[str, dict] = {}
    apariciones: dict[str, set[str]] = {}

    for region in regiones:
        for disc in disciplinas:
            for año in años:
                url = f"{BASE}/{region}/disciplina/{disc}/{año}/"
                html = bajar(url)
                time.sleep(PAUSA_S)
                if not html:
                    continue
                nuevos = 0
                for crudo in extraer_eventos(html):
                    ev = normalizar(crudo, disc)
                    if not ev:
                        continue
                    apariciones.setdefault(ev["id"], set()).add(disc)
                    if ev["id"] not in hallados:
                        hallados[ev["id"]] = ev
                        nuevos += 1
                print(f"  {region}/{disc}/{año}: {nuevos}")

    # Segunda red para las destacadas. El filtro por orden las agarra en las
    # páginas con varias carreras, pero no en las del año que viene, donde a
    # veces hay una sola y la promo queda cronológicamente antes: ahí la lista
    # parece ordenada y pasa igual. Aparecer bajo media docena de disciplinas
    # distintas, en cambio, no le pasa a ninguna carrera de verdad.
    promos = {i for i, discs in apariciones.items() if len(discs) >= LIMITE_DISCIPLINAS}
    for i in promos:
        print(f"  ↓ descartada por figurar en {len(apariciones[i])} disciplinas: {hallados[i]['nombre']}")
        del hallados[i]

    return hallados


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--disciplinas", default=",".join(DISCIPLINAS))
    ap.add_argument("--regiones", default="centro")
    ap.add_argument("--años", default="")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    disciplinas = [d.strip() for d in args.disciplinas.split(",") if d.strip()]
    regiones = [r.strip() for r in args.regiones.split(",") if r.strip()]
    if desconocidas := set(regiones) - set(REGIONES):
        sys.exit(f"regiones desconocidas: {', '.join(sorted(desconocidas))}")

    hoy = date.today()
    años = ([int(a) for a in args.años.split(",")] if args.años
            else [hoy.year, hoy.year + 1])

    print(f"Bajando {len(disciplinas)} disciplinas × {len(regiones)} regiones × {len(años)} años")
    hallados = recolectar(disciplinas, regiones, años)

    # Archivo acumulativo: lo que ya pasó desaparece del sitio y acá se queda.
    previos: dict[str, dict] = {}
    if SALIDA.exists():
        try:
            previos = {e["id"]: e for e in json.loads(SALIDA.read_text())["eventos"]}
        except (ValueError, KeyError, TypeError):
            previos = {}

    fusionado = previos | hallados
    eventos = sorted(fusionado.values(), key=lambda e: (e["fecha"], e["nombre"]))

    proximos = [e for e in eventos if e["fecha"] >= hoy.isoformat()]
    print(f"\n{len(eventos)} eventos en el archivo · {len(proximos)} por venir "
          f"({len(hallados) - len(set(hallados) & set(previos))} nuevos)")

    if args.dry_run:
        for e in proximos[:15]:
            print(f"  {e['fecha']}  {e['disciplina']:<12} {e['nombre'][:44]:<46} {e['localidad']}")
        return

    SALIDA.write_text(json.dumps(
        {"actualizado": hoy.isoformat(), "fuente": BASE, "eventos": eventos},
        ensure_ascii=False, indent=1,
    ))
    print(f"✔ Guardado en public/data/eventos.json")


if __name__ == "__main__":
    main()
