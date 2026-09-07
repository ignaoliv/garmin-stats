"""Analiza la foto de un plato. Versión desplegada de fetch/comida.py.

Importa el mismo módulo que usa la línea de comandos en vez de reimplementar
nada: el emparejado con la tabla de nutrientes tiene reglas afinadas contra
casos reales —salsas enlatadas que le ganan al tomate, fiambres que le ganan a
la pechuga— y tenerlas escritas dos veces es tenerlas mal en una de las dos.
"""
import base64
import json
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "fetch"))

from sesion_api import hay_sesion  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if not hay_sesion(self.headers.get("Cookie")):
            return self._json(401, {"error": "sin sesión"})

        try:
            largo = int(self.headers.get("Content-Length") or 0)
            cuerpo = json.loads(self.rfile.read(largo) or b"{}")
            b64 = cuerpo.get("imagen_b64")
            if not b64:
                return self._json(400, {"error": "falta la foto"})
            imagen = base64.b64decode(b64)
        except Exception as e:
            return self._json(400, {"error": f"pedido inválido: {str(e)[:80]}"})

        try:
            # Se importa acá y no arriba para que un error de credenciales
            # llegue como respuesta y no como función que no arranca.
            from comida import analizar
            return self._json(200, analizar(imagen, cuerpo.get("nota", "")))
        except SystemExit as e:
            return self._json(500, {"error": str(e)[:200]})
        except Exception as e:
            return self._json(500, {"error": f"{type(e).__name__}: {str(e)[:200]}"})

    def _json(self, codigo: int, cuerpo: dict):
        datos = json.dumps(cuerpo, ensure_ascii=False).encode()
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)
