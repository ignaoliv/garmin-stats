"""La misma sesión que valida el resto de la API, del lado de Python.

Espeja lib/api/sesion.ts: una cookie con un vencimiento firmado con HMAC sobre
SITE_PASSWORD. Sin esto, la ruta de comida sería la única puerta abierta del
sitio — y la que manda fotos a un modelo que se paga por uso.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import time
from base64 import urlsafe_b64encode

COOKIE = "gs_sesion"


def _firmar(dato: str, clave: str) -> str:
    firma = hmac.new(clave.encode(), dato.encode(), hashlib.sha256).digest()
    # base64url sin relleno, igual que el `base64url` de Node.
    return urlsafe_b64encode(firma).decode().rstrip("=")


def hay_sesion(cabecera: str | None) -> bool:
    clave = os.getenv("SITE_PASSWORD")
    if not clave or not cabecera:
        return False
    cruda = next(
        (c.strip()[len(COOKIE) + 1:] for c in cabecera.split(";")
         if c.strip().startswith(COOKIE + "=")),
        None,
    )
    if not cruda or "." not in cruda:
        return False
    vence, firma = cruda.split(".", 1)
    # compare_digest y no ==: comparar secretos filtra información por cuánto
    # tarda en fallar.
    if not hmac.compare_digest(firma, _firmar(vence, clave)):
        return False
    try:
        return int(vence) > time.time() * 1000
    except ValueError:
        return False
