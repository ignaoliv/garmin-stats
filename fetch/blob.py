#!/usr/bin/env python3
"""
Cliente mínimo de Vercel Blob para Python.

Existe porque el SDK oficial es de JavaScript y la sincronización con Garmin
tiene que ser Python: `garminconnect` no tiene equivalente en Node que valga la
pena. Dentro de una función de Vercel no hay forma de llamar al SDK de Node, así
que estas son las tres operaciones que hacen falta, escritas contra la misma API
HTTP que usa el SDK.

Las rutas salieron de leer `@vercel/blob` (dist/chunk-*.js), no de adivinar:

  · escribir  → PUT https://vercel.com/api/blob/?pathname=…
                cabeceras x-api-version, x-vercel-blob-access, x-content-type,
                x-add-random-suffix, x-allow-overwrite
  · leer      → GET https://<store>.private.blob.vercel-storage.com/<ruta>
  · listar    → GET https://vercel.com/api/blob?prefix=…&limit=…

El `<store>` sale del propio token: `vercel_blob_rw_<store>_<secreto>`.

Todo es privado. Estos archivos son rutas de GPS, frecuencia cardíaca y sueño;
con acceso público cualquiera con la URL los lee, y las URLs de Blob no son
secretas.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request

API = "https://vercel.com/api/blob"
VERSION = "12"


class BlobError(RuntimeError):
    pass


def _token() -> str:
    t = os.getenv("BLOB_READ_WRITE_TOKEN")
    if not t:
        raise BlobError("falta BLOB_READ_WRITE_TOKEN")
    return t


def _store(token: str) -> str:
    partes = token.split("_")
    if len(partes) < 5:
        raise BlobError("BLOB_READ_WRITE_TOKEN con formato inesperado")
    return partes[3]


def _pedir(req: urllib.request.Request, timeout: int = 60) -> bytes:
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        cuerpo = e.read().decode(errors="replace")[:200]
        raise BlobError(f"HTTP {e.code} de Blob: {cuerpo}") from None


def leer(ruta: str, timeout: int = 60, cache: bool = False) -> bytes | None:
    """El contenido de un blob privado, o None si no existe.

    `cache=False` por defecto, y no es un detalle: la lectura privada pasa por
    una caché de borde que puede devolver la versión anterior durante un rato.
    En la sincronización eso sería silencioso y grave — bajaríamos los archivos
    de ayer, les haríamos merge y subiríamos encima, perdiendo un día entero.
    El SDK de JavaScript hace lo mismo con `useCache: false`.
    """
    token = _token()
    url = f"https://{_store(token)}.private.blob.vercel-storage.com/{urllib.parse.quote(ruta)}"
    if not cache:
        url += "?cache=0"
    req = urllib.request.Request(url, headers={"authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        if e.code in (403, 404):
            return None
        raise BlobError(f"HTTP {e.code} leyendo {ruta}") from None


def leer_json(ruta: str, por_defecto=None):
    crudo = leer(ruta)
    if crudo is None:
        return por_defecto
    try:
        return json.loads(crudo)
    except ValueError:
        # Un archivo corrupto arriba no debería tirar abajo la sincronización
        # entera: se trata como si no estuviera y se vuelve a escribir.
        return por_defecto


def escribir(ruta: str, datos: bytes, content_type: str = "application/json",
             timeout: int = 120) -> str:
    """Sube (o pisa) un blob privado. Devuelve la URL."""
    token = _token()
    url = f"{API}/?{urllib.parse.urlencode({'pathname': ruta})}"
    req = urllib.request.Request(url, data=datos, method="PUT", headers={
        "authorization": f"Bearer {token}",
        "x-api-version": VERSION,
        "x-vercel-blob-access": "private",
        "x-content-type": content_type,
        # Sin sufijo al azar: la app pide `datos/steps.json` por nombre, no una
        # URL que le devolvieron.
        "x-add-random-suffix": "0",
        "x-allow-overwrite": "1",
        "content-type": "application/octet-stream",
    })
    return json.loads(_pedir(req, timeout)).get("url", "")


def escribir_json(ruta: str, valor, compacto: bool = True) -> str:
    sep = (",", ":") if compacto else None
    return escribir(ruta, json.dumps(valor, ensure_ascii=False, separators=sep).encode())


def listar(prefijo: str, limite: int = 1000) -> list[dict]:
    """Los blobs bajo un prefijo: pathname, size, uploadedAt."""
    token = _token()
    salida: list[dict] = []
    cursor = None
    while True:
        params = {"prefix": prefijo, "limit": str(limite)}
        if cursor:
            params["cursor"] = cursor
        req = urllib.request.Request(
            f"{API}?{urllib.parse.urlencode(params)}",
            headers={"authorization": f"Bearer {token}", "x-api-version": VERSION},
        )
        d = json.loads(_pedir(req))
        salida.extend(d.get("blobs") or [])
        if not d.get("hasMore"):
            return salida
        cursor = d.get("cursor")


def _prueba() -> None:
    """Ida y vuelta contra el store real, sin tocar ningún archivo de datos."""
    import time
    ruta = f"pruebas/blob_py_{int(time.time())}.json"
    valor = {"hola": "mundo", "cuando": time.time()}

    print(f"escribiendo {ruta}…")
    escribir_json(ruta, valor)
    print("  ✔ escrito")

    vuelta = leer_json(ruta)
    assert vuelta == valor, f"lo que volvió no es lo que subí: {vuelta}"
    print("  ✔ leído y coincide")

    assert leer("pruebas/no_existe_nunca.json") is None
    print("  ✔ un archivo que no existe devuelve None (y no revienta)")

    n = len(listar("datos/"))
    print(f"  ✔ listar: {n} archivos en datos/")
    print(f"\nQuedó {ruta} en el store; se puede borrar desde el panel.")


if __name__ == "__main__":
    from pathlib import Path
    try:
        from dotenv import load_dotenv
        load_dotenv(Path(__file__).parent.parent / ".env")
    except ImportError:
        pass
    _prueba()
