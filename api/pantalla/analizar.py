"""Lee una captura de Tiempo en pantalla. Versión desplegada de fetch/pantalla.py.

Importa el mismo módulo que usa la línea de comandos: el prompt tiene reglas
afinadas contra una captura real —no leer las barras del gráfico, saltear lo
tapado, mirar qué pestaña está seleccionada— y tenerlas escritas dos veces es
tenerlas mal en una de las dos.
"""
import base64
import json
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "fetch"))

from sesion_api import hay_sesion  # noqa: E402

# Tres capturas achicadas a 1024 px rondan los 900 KB en base64. Más que esto
# no es un informe de tiempo en pantalla.
LIMITE = 8 * 1024 * 1024


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if not hay_sesion(self.headers.get("Cookie")):
            return self._json(401, {"error": "sin sesión"})

        try:
            largo = int(self.headers.get("Content-Length") or 0)
            if largo > LIMITE:
                return self._json(413, {"error": "las capturas pesan demasiado"})
            cuerpo = json.loads(self.rfile.read(largo) or b"{}")
            crudas = cuerpo.get("imagenes_b64") or (
                [cuerpo["imagen_b64"]] if cuerpo.get("imagen_b64") else [])
            if not crudas:
                return self._json(400, {"error": "falta la captura"})
            imagenes = [base64.b64decode(b) for b in crudas[:3]]
        except Exception as e:
            return self._json(400, {"error": f"pedido inválido: {str(e)[:80]}"})

        try:
            from pantalla import leer
            return self._json(200, leer(imagenes))
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
