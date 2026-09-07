#!/usr/bin/env python3
"""
El registro de comidas: public/data/comidas.json.

Archivo acumulativo, como el resto de los de este proyecto. Guarda lo que el
usuario CONFIRMÓ, no lo que el modelo estimó: entre una cosa y otra están las
correcciones de gramos, que es donde se arregla el eslabón débil de la foto.

Uso:
    python3 fetch/comidas.py --from-stdin       # guarda una comida
    python3 fetch/comidas.py --dia 2026-09-07   # el resumen de un día
"""
from __future__ import annotations

import argparse
import json
import sys
import uuid
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).parent.parent
DATA = ROOT / "public" / "data"
ARCHIVO = DATA / "comidas.json"

MOMENTOS = ("desayuno", "almuerzo", "merienda", "cena", "colación")


def cargar() -> list[dict]:
    if not ARCHIVO.exists():
        return []
    try:
        return json.loads(ARCHIVO.read_text()).get("comidas", [])
    except (ValueError, OSError):
        return []


def guardar(comidas: list[dict]) -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    comidas.sort(key=lambda c: (c.get("fecha", ""), c.get("hora", "")))
    ARCHIVO.write_text(json.dumps(
        {"actualizado": date.today().isoformat(), "comidas": comidas},
        ensure_ascii=False, indent=1,
    ))


def agregar(entrada: dict) -> dict:
    """Suma una comida al archivo y devuelve la que quedó guardada."""
    ahora = datetime.now()
    comida = {
        "id": entrada.get("id") or uuid.uuid4().hex[:12],
        "fecha": entrada.get("fecha") or ahora.strftime("%Y-%m-%d"),
        "hora": entrada.get("hora") or ahora.strftime("%H:%M"),
        "momento": entrada.get("momento") if entrada.get("momento") in MOMENTOS else None,
        "nombre": (entrada.get("nombre") or "").strip() or "Comida",
        "alimentos": entrada.get("alimentos") or [],
        "total": entrada.get("total") or {},
        "nota": entrada.get("nota") or "",
        # De dónde salió: sirve para saber después cuánto confiar en el número.
        "origen": entrada.get("origen") or "foto",
        "corregido": bool(entrada.get("corregido")),
    }

    comidas = cargar()
    # Reemplaza si ya existía ese id, para poder editar una comida guardada.
    comidas = [c for c in comidas if c.get("id") != comida["id"]]
    comidas.append(comida)
    guardar(comidas)
    return comida


def resumen_dia(dia: str) -> dict:
    comidas = [c for c in cargar() if c.get("fecha") == dia]
    total: dict[str, float] = {}
    for c in comidas:
        for k, v in (c.get("total") or {}).items():
            if isinstance(v, (int, float)):
                total[k] = total.get(k, 0.0) + v
    return {
        "fecha": dia,
        "comidas": len(comidas),
        "total": {k: round(v, 1) for k, v in total.items()},
        "detalle": comidas,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-stdin", action="store_true")
    ap.add_argument("--dia", help="resumen de un día (YYYY-MM-DD)")
    ap.add_argument("--borrar", help="id de la comida a borrar")
    args = ap.parse_args()

    if args.borrar:
        comidas = cargar()
        quedan = [c for c in comidas if c.get("id") != args.borrar]
        guardar(quedan)
        print(json.dumps({"borradas": len(comidas) - len(quedan)}, ensure_ascii=False))
        return

    if args.dia:
        print(json.dumps(resumen_dia(args.dia), ensure_ascii=False, indent=1))
        return

    if args.from_stdin:
        print(json.dumps(agregar(json.load(sys.stdin)), ensure_ascii=False))
        return

    r = resumen_dia(date.today().isoformat())
    print(f"Hoy: {r['comidas']} comidas · {r['total'].get('calorias', 0):.0f} kcal")


if __name__ == "__main__":
    main()
