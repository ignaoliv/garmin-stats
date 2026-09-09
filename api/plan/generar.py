"""Genera el plan de entrenamiento. Versión desplegada de fetch/plan_ai.py.

Esta pantalla nunca funcionó publicada: la generación vivía dentro del `main()`
del script, así que la única forma de usarla desde un servidor era lanzar un
proceso y leerle la salida — que es lo que hace el plugin de desarrollo. Ahora
`plan_ai.generar()` es una función y acá se la llama directo.

LOS DATOS. El plan se arma mirando la carga real, la recuperación y el
historial de fuerza, o sea que necesita activities.json, wellness.json y
sleep.json. En Vercel esos archivos no viajan con el despliegue —están
excluidos a propósito, son datos personales— así que se bajan del blob a /tmp
y los mismos módulos de siempre trabajan contra esa carpeta sin enterarse.
"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "fetch"))

from sesion_api import hay_sesion  # noqa: E402

CARPETA = "/tmp/gs-plan"
NECESARIOS = ["activities.json", "wellness.json", "sleep.json", "stats.json"]


def _preparar_datos() -> None:
    """Baja lo que el plan necesita, una vez por arranque en frío."""
    import blob
    destino = Path(CARPETA)
    destino.mkdir(parents=True, exist_ok=True)
    for nombre in NECESARIOS:
        f = destino / nombre
        if f.exists() and f.stat().st_size > 0:
            continue
        datos = blob.leer(f"datos/{nombre}")
        if datos:
            f.write_bytes(datos)


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if not hay_sesion(self.headers.get("Cookie")):
            return self._json(401, {"error": "sin sesión"})

        try:
            largo = int(self.headers.get("Content-Length") or 0)
            c = json.loads(self.rfile.read(min(largo, 65_536)) or b"{}")
            semanas = max(1, min(12, int(c.get("weeks") or 4)))
            dias = max(1, min(7, int(c.get("days") or 3)))
        except Exception as e:
            return self._json(400, {"error": f"pedido inválido: {str(e)[:80]}"})

        try:
            # GARMIN_DATA_DIR antes de importar: los módulos resuelven la ruta
            # al cargarse.
            os.environ["GARMIN_DATA_DIR"] = CARPETA
            _preparar_datos()
            if not (Path(CARPETA) / "activities.json").exists():
                return self._json(503, {"error": "todavía no hay actividades sincronizadas"})

            from plan_ai import generar
            plan = generar(
                weeks=semanas, days=dias,
                objetivo=str(c.get("objetivo") or "")[:200],
                evento=c.get("evento") or None,
                contexto=c.get("contexto") or None,
            )
            return self._json(200, plan)
        except SystemExit as e:
            return self._json(500, {"error": str(e)[:200]})
        except Exception as e:
            return self._json(500, {"error": f"{type(e).__name__}: {str(e)[:250]}"})

    def _json(self, codigo: int, cuerpo: dict):
        datos = json.dumps(cuerpo, ensure_ascii=False).encode()
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)
