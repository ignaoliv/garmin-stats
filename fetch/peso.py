#!/usr/bin/env python3
"""
Baja el historial de peso a public/data/peso.json.

Archivo acumulativo, como el resto: Garmin recorta el historial con el tiempo y
un peso de hace dos años sigue siendo el punto de comparación que importa.

Sobre lo que NO trae: grasa corporal, masa muscular, agua y grasa visceral sólo
existen si hay una balanza inteligente conectada. Con el peso cargado a mano
esos campos vienen vacíos, y se guardan igual como null para que la pantalla
pueda decir "tu balanza no mide esto" en vez de mostrar un cero que parece una
medición.

Uso:
    python3 fetch/peso.py            # los últimos 2 años
    python3 fetch/peso.py --dias 90
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).parent.parent
DATA = ROOT / "public" / "data"

try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
except ImportError:
    pass


def normalizar(r: dict) -> dict | None:
    gramos = r.get("weight")
    if not isinstance(gramos, (int, float)) or gramos <= 0:
        return None

    fecha = r.get("calendarDate")
    if not fecha:
        # `date` viene en milisegundos y es hora local del registro.
        ms = r.get("date")
        if not ms:
            return None
        fecha = datetime.fromtimestamp(ms / 1000).date().isoformat()

    def opcional(clave: str, divisor: float = 1.0):
        v = r.get(clave)
        return round(v / divisor, 1) if isinstance(v, (int, float)) and v else None

    return {
        "fecha": fecha,
        "kg": round(gramos / 1000, 1),
        "imc": opcional("bmi"),
        "grasa_pct": opcional("bodyFat"),
        "musculo_kg": opcional("muscleMass", 1000),
        "agua_pct": opcional("bodyWater"),
        # De dónde salió: MANUAL, INDEX_SCALE, etc. Sirve para saber si el
        # salto de un kilo es la balanza o es el dedo.
        "origen": r.get("sourceType"),
    }


def archive_peso(api, dias: int = 730) -> int:
    hoy = date.today()
    try:
        d = api.get_body_composition((hoy - timedelta(days=dias)).isoformat(), hoy.isoformat())
    except Exception as e:
        print(f"  aviso: no se pudo bajar el peso ({str(e)[:80]})")
        return 0

    nuevos = {}
    for r in (d.get("dateWeightList") or []):
        fila = normalizar(r)
        if fila:
            nuevos[fila["fecha"]] = fila

    DATA.mkdir(parents=True, exist_ok=True)
    salida = DATA / "peso.json"
    archivo: dict[str, dict] = {}
    if salida.exists():
        try:
            archivo = {r["fecha"]: r for r in json.loads(salida.read_text()).get("registros", [])}
        except (ValueError, KeyError, OSError):
            archivo = {}

    agregados = sum(1 for f in nuevos if f not in archivo)
    archivo |= nuevos
    registros = sorted(archivo.values(), key=lambda r: r["fecha"])
    salida.write_text(json.dumps(
        {"descargado": hoy.isoformat(), "registros": registros},
        ensure_ascii=False, indent=1,
    ))

    con_composicion = sum(1 for r in registros if r.get("grasa_pct"))
    print(f"  Peso archivado: {len(registros)} registros ({agregados} nuevos)")
    if registros and not con_composicion:
        print("    sin grasa ni músculo: eso lo mide una balanza inteligente, "
              "y estos vienen cargados a mano")
    return agregados


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dias", type=int, default=730)
    args = ap.parse_args()

    correo, clave = os.getenv("GARMIN_EMAIL"), os.getenv("GARMIN_PASSWORD")
    if not (correo and clave):
        sys.exit("ERROR: faltan GARMIN_EMAIL y GARMIN_PASSWORD en .env")

    from garminconnect import Garmin
    api = Garmin(correo, clave)
    api.login()
    archive_peso(api, args.dias)
    print(f"   → {DATA / 'peso.json'}")


if __name__ == "__main__":
    main()
