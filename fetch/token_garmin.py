#!/usr/bin/env python3
"""
El token de sesión de Garmin, guardado en el blob para que el cron no tenga que
volver a loguearse.

EL PROBLEMA QUE RESUELVE. El login de Garmin pasa por `sso.garmin.com`, que está
detrás de Cloudflare y contesta 429 (`error code 1015`) cuando lo golpeás
seguido. Una función de Vercel tiene el disco vacío en cada arranque, así que si
sincronizara con usuario y contraseña haría login nuevo TODOS los días — y ese
es justo el patrón que dispara el bloqueo. Con el token guardado, la corrida
diaria no toca el SSO: refresca el token contra la API y sigue de largo.

DÓNDE VIVE. En el mismo blob privado que el resto —`datos/garmin_token.json`—
porque ahí ya están las rutas de GPS y el sueño: no tiene sentido proteger menos
el token que los datos a los que da acceso. Nunca en una variable `VITE_*`, que
termina horneada en el bundle del navegador.

LO QUE NO HACE. No guarda la contraseña en ningún lado. La contraseña se usa una
sola vez, acá, desde tu máquina, y lo que viaja al blob es la sesión resultante.

Uso:
    python3 fetch/token_garmin.py --crear      # login con .env y subirlo
    python3 fetch/token_garmin.py --verificar  # bajarlo y probar que sirve
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(Path(__file__).parent))

try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
except ImportError:
    pass

RUTA = "datos/garmin_token.json"


def _cliente_desde_token(token: str):
    """Un cliente logueado usando SÓLO el token, sin usuario ni contraseña.

    Es la prueba que importa: si esto anda, el cron anda. Si sólo probáramos el
    login con contraseña, estaríamos verificando justo lo que el cron no puede
    hacer.
    """
    from garminconnect import Garmin
    api = Garmin()
    # `login()` distingue el token de una ruta de archivo mirando la cadena:
    # 0.3.2 por el largo (>512), 0.3.11 con `_looks_like_json()`. Nuestro token
    # es un JSON de 2 KB, así que pasa por las dos.
    api.login(token)
    return api


def crear() -> None:
    correo = os.getenv("GARMIN_EMAIL")
    clave = os.getenv("GARMIN_PASSWORD")
    if not (correo and clave):
        sys.exit("ERROR: faltan GARMIN_EMAIL y GARMIN_PASSWORD en .env")

    from garminconnect import Garmin

    print(f"Login como {correo}…")
    print("  (un solo intento: reintentar seguido es lo que dispara el 429)")
    api = Garmin(correo, clave)
    api.login()

    token = api.client.dumps()

    # Que sea JSON con los tres campos es la forma de que `login()` lo reconozca
    # como token y no como la ruta de un archivo. Las dos versiones lo deciden
    # distinto —0.3.2 por el largo, 0.3.11 con `_looks_like_json()`— y un JSON
    # de 2 KB pasa por las dos.
    try:
        campos = sorted(json.loads(token).keys())
    except ValueError:
        sys.exit("ERROR: el token no salió como JSON; garminconnect lo tomaría como una ruta.")
    faltan = {"di_token", "di_refresh_token", "di_client_id"} - set(campos)
    if faltan:
        sys.exit(f"ERROR: al token le faltan campos: {', '.join(sorted(faltan))}")
    print(f"  ✔ sesión obtenida · {len(token)} caracteres · campos: {', '.join(campos)}")

    print("Probando el token solo, sin contraseña…")
    prueba = _cliente_desde_token(token)
    nombre = prueba.get_full_name()
    print(f"  ✔ anda: la API contesta como «{nombre}»")

    from blob import escribir
    escribir(RUTA, token.encode())
    print(f"  ✔ guardado en el blob privado como {RUTA}")
    print("\nDesde ahora el cron sincroniza sin tocar el login de Garmin.")


def verificar() -> None:
    from blob import leer
    crudo = leer(RUTA)
    if not crudo:
        sys.exit(f"ERROR: no hay token en {RUTA}. Corré --crear primero.")

    token = crudo.decode()
    print(f"Token encontrado · {len(token)} caracteres")

    api = _cliente_desde_token(token)
    print(f"  ✔ login sin contraseña OK · «{api.get_full_name()}»")

    ultimas = api.get_activities(0, 1)
    if ultimas:
        a = ultimas[0]
        print(f"  ✔ la API responde · última actividad: {a.get('activityName')} "
              f"({(a.get('startTimeLocal') or '')[:10]})")
    else:
        print("  ✔ la API responde, pero no devolvió actividades")

    # Si Garmin renovó la sesión durante estas llamadas, el token de arriba
    # quedó viejo. Guardar el nuevo acá es lo que hace que esto no caduque solo.
    nuevo = api.client.dumps()
    if nuevo != token:
        from blob import escribir
        escribir(RUTA, nuevo.encode())
        print("  ✔ el token se había renovado; se guardó la versión nueva")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--crear", action="store_true", help="login con .env y subir el token")
    ap.add_argument("--verificar", action="store_true", help="bajar el token y probarlo")
    args = ap.parse_args()

    if args.crear:
        crear()
    elif args.verificar:
        verificar()
    else:
        ap.error("hace falta --crear o --verificar")


if __name__ == "__main__":
    main()
