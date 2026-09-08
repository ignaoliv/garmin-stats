"""El brief del objetivo. Versión desplegada de fetch/objetivo.py.

Importa el mismo módulo que usa la línea de comandos: el prompt tiene reglas
afinadas —el voseo, el orden de las palancas, qué no decir cuando falta un
dato— y tenerlas escritas dos veces es tenerlas mal en una de las dos.

A diferencia del resto de la API, esta función no lee ningún archivo: el
digest ya viene armado desde el navegador, que es donde se calculó el puntaje.
Acá sólo se guarda el token de Cloudflare, que es la única razón por la que
esto no puede pasar en el cliente.
"""
import json
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "fetch"))

from sesion_api import hay_sesion  # noqa: E402

# El digest son unos pocos kilobytes de números. Un cuerpo más grande que esto
# no es un objetivo: es alguien probando cuánto le puede hacer pagar al modelo.
LIMITE = 64 * 1024


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if not hay_sesion(self.headers.get("Cookie")):
            return self._json(401, {"error": "sin sesión"})

        try:
            largo = int(self.headers.get("Content-Length") or 0)
            if largo > LIMITE:
                return self._json(413, {"error": "el pedido es demasiado grande"})
            digest = json.loads(self.rfile.read(largo) or b"{}")
            if not isinstance(digest, dict) or not digest.get("objetivo"):
                return self._json(400, {"error": "falta el objetivo"})
        except Exception as e:
            return self._json(400, {"error": f"pedido inválido: {str(e)[:80]}"})

        try:
            # Se importa acá y no arriba para que un error de credenciales
            # llegue como respuesta y no como función que no arranca.
            from objetivo import brief
            return self._json(200, brief(digest))
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
