"""La sincronización con Garmin, corriendo en Vercel.

Es la respuesta a un problema concreto: el botón "Sincronizar" vivía en el
plugin del servidor de desarrollo, o sea que sólo existía mientras alguien
tuviera `npm run dev` levantado en su máquina. Trabajando sólo sobre la web, eso
significaba que los datos se congelaban en la última sincronización a mano.

DOS PUERTAS, a propósito:
  · el cron de Vercel, que se identifica con CRON_SECRET;
  · vos desde el panel, con la cookie de sesión.
La segunda es la que devuelve el botón "Sincronizar" a la versión desplegada.
Van separadas para que rotar una no obligue a rotar la otra, y para que el
secreto de una tarea automática no sea la contraseña que escribís en el teléfono.

El trabajo en sí está en fetch/sincronizar.py, que es el mismo código que corre
desde la línea de comandos. Acá sólo se decide quién puede pedirlo.
"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "fetch"))

from sesion_api import hay_sesion  # noqa: E402


def _es_el_cron(cabecera: str | None) -> bool:
    """Vercel manda `Authorization: Bearer $CRON_SECRET` en las tareas cron."""
    import hmac
    secreto = os.getenv("CRON_SECRET")
    return bool(secreto and cabecera and hmac.compare_digest(cabecera, f"Bearer {secreto}"))


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self._correr()

    def do_POST(self):
        self._correr()

    def _correr(self):
        autorizado = (_es_el_cron(self.headers.get("Authorization"))
                      or hay_sesion(self.headers.get("Cookie")))
        if not autorizado:
            return self._json(401, {"error": "sin sesión"})

        try:
            # Se importa acá y no arriba para que un error de credenciales o de
            # dependencias llegue como respuesta y no como función que no arranca.
            from sincronizar import correr
            return self._json(200, correr(usar_blob=True, callado=True))
        except Exception as e:
            return self._json(500, {"ok": False, "error": f"{type(e).__name__}: {str(e)[:300]}"})

    def _json(self, codigo: int, cuerpo: dict):
        datos = json.dumps(cuerpo, ensure_ascii=False).encode()
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)
