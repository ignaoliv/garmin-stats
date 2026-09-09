"""Un alimento suelto: el que agregás a mano o el que renombraste.

No pasa por ningún modelo — vos ya dijiste qué es y cuánto. Sólo busca los
nutrientes en la tabla, con las mismas reglas de emparejado que el resto.
"""
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
            c = json.loads(self.rfile.read(min(largo, 8192)) or b"{}")
            nombre = str(c.get("nombre") or "").strip()[:80]
            gramos = float(c.get("gramos") or 0)
            if not nombre:
                return self._json(400, {"error": "falta el nombre"})
            if not 0 < gramos <= 5000:
                return self._json(400, {"error": "los gramos tienen que estar entre 1 y 5000"})
        except Exception as e:
            return self._json(400, {"error": f"pedido inválido: {str(e)[:80]}"})

        try:
            from comida import buscar_uno
            return self._json(200, buscar_uno(nombre, gramos, str(c.get("nombre_en") or "")))
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
