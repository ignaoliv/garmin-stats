"""Convierte una descripción escrita en alimentos con nutrientes.

Complementa a analizar.py, que hace lo mismo desde una foto. Las dos terminan
en `comida.resolver()`, así que "milanesa" da lo mismo por los dos caminos.
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
            cuerpo = json.loads(self.rfile.read(min(largo, 16_384)) or b"{}")
            texto = str(cuerpo.get("texto") or "").strip()
            if not texto:
                return self._json(400, {"error": "falta el texto"})
        except Exception as e:
            return self._json(400, {"error": f"pedido inválido: {str(e)[:80]}"})

        try:
            from comida_texto import desde_texto
            return self._json(200, desde_texto(texto))
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
