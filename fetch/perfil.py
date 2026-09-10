#!/usr/bin/env python3
"""
El perfil fisiológico de quien usa el panel.

POR QUÉ EXISTE. La frecuencia cardíaca máxima y el umbral estaban escritos a
mano en enrich.py —185 y 165— y venían del repositorio original, o sea de otra
persona. Con eso se calcula el TSS de CADA actividad, y de ahí salen el fitness,
la fatiga, el estado de forma, el ACWR y la carga acumulada de Preparación.

Cuánto importa: el mismo esfuerzo a 150 ppm puntúa 0,68 si se asume una máxima
de 185 y 0,92 si se asume 170. Para alguien de 50 años, todas sus sesiones
quedaban subestimadas un tercio, y no había forma de arreglarlo sin editar el
código.

DÓNDE VIVE. En `perfil.json`, al lado del resto de los datos, para que lo lean
igual la sincronización y el panel. La pantalla de Ajustes lo edita.

Uso:
    python3 fetch/perfil.py            # mostrar el perfil y lo que sugieren los datos
    python3 fetch/perfil.py --sugerir  # sólo la sugerencia, en JSON
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import rutas

ARCHIVO = "perfil.json"

# Valores de arranque si todavía no hay perfil. No son "los correctos": son un
# punto de partida razonable para un adulto, y la pantalla pide confirmarlos.
POR_DEFECTO = {"maxHR": 185, "lthr": 165, "ftp": 200}

LIMITES = {"maxHR": (120, 230), "lthr": (100, 210), "ftp": (50, 600)}


def leer() -> dict:
    f = rutas.DATA / ARCHIVO
    if f.exists():
        try:
            guardado = json.loads(f.read_text())
            return POR_DEFECTO | {k: v for k, v in guardado.items() if k in POR_DEFECTO}
        except (ValueError, OSError):
            pass
    return dict(POR_DEFECTO)


def validar(entrada: dict) -> dict:
    """Recorta a lo posible. Una máxima de 400 no es un dato, es un dedazo."""
    salida = dict(POR_DEFECTO)
    for clave, (bajo, alto) in LIMITES.items():
        v = entrada.get(clave)
        if isinstance(v, (int, float)) and not isinstance(v, bool) and bajo <= v <= alto:
            salida[clave] = int(v)
    # El umbral por encima de la máxima no tiene sentido físico y rompe la
    # fórmula: el denominador del TRIMP se vuelve mayor que 1.
    if salida["lthr"] >= salida["maxHR"]:
        salida["lthr"] = int(salida["maxHR"] * 0.9)
    return salida


def guardar(entrada: dict) -> dict:
    perfil = validar(entrada)
    rutas.DATA.mkdir(parents=True, exist_ok=True)
    (rutas.DATA / ARCHIVO).write_text(json.dumps(perfil, ensure_ascii=False, indent=1))
    return perfil


def sugerir() -> dict:
    """Lo que dicen las actividades, para no arrancar de un número inventado.

    La máxima observada es mejor estimación que cualquier fórmula por edad: es
    un pulso que el corazón de esta persona efectivamente alcanzó. Se mira sólo
    el último par de años porque la máxima baja con el tiempo.
    """
    f = rutas.DATA / "activities.json"
    if not f.exists():
        return {}
    try:
        acts = json.loads(f.read_text())
    except (ValueError, OSError):
        return {}

    recientes = sorted(a for a in
                       (x.get("maxHR") for x in acts
                        if (x.get("startTime") or "") >= "2024-01-01"
                        and isinstance(x.get("maxHR"), (int, float)) and x["maxHR"] > 120))
    if not recientes:
        return {}
    # El máximo absoluto puede ser un artefacto del sensor. El percentil 99 de
    # los máximos por sesión es más estable y sigue siendo un pulso real.
    p99 = recientes[min(len(recientes) - 1, int(len(recientes) * 0.99))]
    return {
        "maxHR": p99,
        # El umbral de carrera ronda el 90% de la máxima. Es una regla gruesa y
        # la pantalla lo dice: lo bueno sería una prueba de campo.
        "lthr": round(p99 * 0.9),
        "observaciones": len(recientes),
        "maximoAbsoluto": recientes[-1],
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sugerir", action="store_true")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    if args.sugerir:
        print(json.dumps(sugerir(), ensure_ascii=False))
        return

    perfil, sug = leer(), sugerir()
    if args.json:
        print(json.dumps({"perfil": perfil, "sugerido": sug}, ensure_ascii=False))
        return

    print(f"  perfil actual: FC máx {perfil['maxHR']} · umbral {perfil['lthr']} · FTP {perfil['ftp']}")
    if sug:
        print(f"  según tus datos: máxima observada {sug['maximoAbsoluto']} ppm "
              f"en {sug['observaciones']} sesiones desde 2024")
        print(f"  sugerido: FC máx {sug['maxHR']} · umbral {sug['lthr']}")


if __name__ == "__main__":
    main()
