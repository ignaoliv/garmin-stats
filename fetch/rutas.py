"""Dónde se escriben los datos.

Por defecto, `public/data/` del repo, que es lo que espera el panel en local.

`GARMIN_DATA_DIR` lo mueve. Existe por la sincronización en Vercel: ahí no hay
repo ni disco que sobreviva a la corrida, así que el cron baja los archivos que
necesita a un directorio temporal, deja que estos mismos módulos trabajen contra
él sin enterarse, y sube al blob lo que quedó escrito.

Una variable de entorno y no un parámetro en cada función: son seis módulos que
resuelven la ruta al importarse, y pasarla por argumento obligaba a tocar todas
sus firmas —y las de quien las llama— para un caso que sólo le importa al cron.
"""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).parent.parent

DATA = Path(os.getenv("GARMIN_DATA_DIR") or (ROOT / "public" / "data"))
