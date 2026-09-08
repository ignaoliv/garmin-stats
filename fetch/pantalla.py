#!/usr/bin/env python3
"""
De una captura de Tiempo en pantalla, a los minutos que dice.

LA DIFERENCIA CON LA COMIDA. Allá el modelo tiene que ESTIMAR gramos de una foto
plana, que es el eslabón débil de todo aquel sistema. Acá no estima nada: los
números ya están escritos en la pantalla y la tarea es leerlos. Es mucho más
fácil y mucho más confiable, y el prompt está escrito para que no se le ocurra
inventar lo que no ve.

LO QUE NO HAY QUE HACER, y por eso está dicho tres veces abajo: deducir valores
de la altura de las barras del gráfico. Esas barras son por día y no tienen los
números encima; leerlas sería inventar con cara de dato.

DE DÓNDE SALE EL TITULAR. Del renglón de categorías que iOS ya calcula
("Redes sociales 4 h 13 min"). Sumar las apps a mano da menos: la lista de "Más
usadas" está recortada y siempre queda alguna afuera.

Uso:
    python3 fetch/pantalla.py --foto captura.png
    python3 fetch/pantalla.py --from-stdin      # {"imagenes_b64": ["..."]}
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parent.parent

try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
except ImportError:
    pass

MODELO = "@cf/meta/llama-4-scout-17b-16e-instruct"

SISTEMA = """Estás leyendo una captura de la pantalla "Tiempo en pantalla" de un
iPhone, en castellano. Tu tarea es TRANSCRIBIR los números que están escritos.
No estimás, no deducís, no completás: leés.

QUÉ HAY EN LA PANTALLA, de arriba abajo:
- Arriba, el nombre del dispositivo ("Nacho's iPhone").
- Dos pestañas, "Semana" y "Día". La que está SELECCIONADA —la que tiene el
  fondo claro relleno, no la que está sobre el fondo oscuro— dice de qué
  período habla todo lo demás. Miralo con cuidado: confundirlas cambia el
  significado de todos los números.
- "Promedio diario" con un tiempo grande, y al lado un porcentaje de cambio
  contra el período anterior, con una flecha hacia arriba o hacia abajo.
- Un gráfico de barras por día.
- Debajo del gráfico, un renglón de CATEGORÍAS con su tiempo cada una:
  "Redes sociales", "Otras", "Viajes", "Productividad", "Entretenimiento"…
- "Tiempo en pantalla total" con el total del período.
- "Más usadas": la lista de apps, cada una con su tiempo.

REGLAS DURAS:
1. NUNCA leas valores del gráfico de barras. Las barras no tienen números
   encima y calcular su altura es inventar. Los únicos números válidos son los
   que están ESCRITOS en texto.
2. Si algo está tapado, borroneado o cortado por el borde de la captura, NO lo
   incluyas y decilo en "nota". Una app tachada es una app que no viste.
3. Si un número no se lee con claridad, dejalo afuera antes que arriesgar.
4. No traduzcas ni normalices los nombres de las apps: si dice "X", es "X".

LOS TIEMPOS van SIEMPRE convertidos a minutos enteros:
  "4 h 3 min" → 243     "1 h 16 min" → 76     "57 min" → 57     "2 h" → 120

EL CAMBIO PORCENTUAL lleva signo: flecha hacia abajo es negativo (bajaste),
flecha hacia arriba es positivo. "↓ 28% desde la semana pasada" → -28.

Devolvés JSON válido y NADA más:
{
  "dispositivo": "el nombre de arriba, o null",
  "periodo": "semana" | "dia",
  "promedio_diario_min": 243,
  "total_min": 486,
  "cambio_pct": -28,
  "actualizado": "lo que dice el renglón 'Actualizado', tal cual, o null",
  "categorias": [{"nombre": "Redes sociales", "min": 253}],
  "apps": [{"nombre": "X", "min": 152}],
  "activaciones": null,
  "nota": "una frase sobre lo que la captura no permite saber: apps tapadas, la lista cortada abajo, números dudosos"
}
Si la captura muestra la sección de Activaciones (cuántas veces levantaste el
teléfono), poné ese número en "activaciones". Si no aparece, va null: no lo
inventes ni lo deduzcas de otra cosa."""


def credenciales() -> tuple[str, str]:
    cuenta = os.getenv("CLOUDFLARE_ACCOUNT_ID")
    token = os.getenv("CLOUDFLARE_API_TOKEN")
    if not (cuenta and token):
        sys.exit("ERROR: faltan CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_API_TOKEN en .env")
    return cuenta, token


def extraer_json(texto: object) -> dict | None:
    if isinstance(texto, dict):
        return texto
    if not isinstance(texto, str):
        return None
    t = texto.strip()
    if "```" in t:
        t = t.split("```")[1]
        if t.startswith("json"):
            t = t[4:]
    ini, fin = t.find("{"), t.rfind("}")
    if ini == -1 or fin == -1:
        return None
    try:
        return json.loads(t[ini:fin + 1])
    except ValueError:
        return None


def _entero(v: object) -> int | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return int(v)
    return None


def _lista(bruta: object, tope: int) -> list[dict]:
    salida = []
    for x in (bruta or [])[:tope] if isinstance(bruta, list) else []:
        if not isinstance(x, dict):
            continue
        nombre = str(x.get("nombre") or "").strip()[:40]
        minutos = _entero(x.get("min"))
        # Un día tiene 1440 minutos y una semana 10080; cualquier cosa por
        # encima es una lectura mal hecha, no un récord.
        if nombre and minutos is not None and 0 <= minutos <= 10080:
            salida.append({"nombre": nombre, "min": minutos})
    return salida


def validar(d: dict) -> dict:
    """Recorta a la forma que la pantalla sabe dibujar y descarta lo imposible."""
    periodo = d.get("periodo")
    total = _entero(d.get("total_min"))
    promedio = _entero(d.get("promedio_diario_min"))

    # Los días transcurridos NO se le preguntan al modelo: se calculan. Importa
    # porque la vista semanal es acumulativa —un martes muestra dos días, no
    # siete— y comparar dos días contra siete no es un hallazgo, es un error de
    # cuentas. Ya nos pasó con la comparación semanal de los insights.
    dias = None
    if total and promedio and promedio > 0:
        dias = max(1, min(7, round(total / promedio)))

    # El período se DEDUCE de la cuenta, no se le cree al modelo: en la prueba
    # con una captura real leyó "día" cuando la pestaña marcada era "Semana",
    # y ese error cambia el significado de todos los números de golpe.
    # Si el total son varios días de promedio, la vista es acumulativa y por lo
    # tanto semanal, sin importar qué pestaña le pareció ver. Con un solo día la
    # cuenta no distingue —un lunes se ve igual en las dos vistas— y ahí sí vale
    # lo que leyó.
    if dias is not None and dias >= 2:
        periodo = "semana"

    cambio = d.get("cambio_pct")
    cambio = cambio if isinstance(cambio, (int, float)) and -100 <= cambio <= 500 else None

    return {
        "dispositivo": (str(d["dispositivo"])[:40] if d.get("dispositivo") else None),
        "periodo": periodo if periodo in ("semana", "dia") else "semana",
        "promedio_diario_min": promedio,
        "total_min": total,
        "dias_transcurridos": dias,
        "cambio_pct": cambio,
        "actualizado": (str(d["actualizado"])[:40] if d.get("actualizado") else None),
        "categorias": _lista(d.get("categorias"), 8),
        "apps": _lista(d.get("apps"), 20),
        "activaciones": _entero(d.get("activaciones")),
        "nota": str(d.get("nota") or "")[:300],
        "modelo": MODELO,
    }


def leer(imagenes: list[bytes]) -> dict:
    """Una o varias capturas del mismo período, leídas juntas.

    Varias porque la lista de apps no entra en una pantalla y las Activaciones
    están más abajo todavía. Van en el mismo pedido para que el modelo las vea
    como partes de un mismo informe y no como dos informes distintos.
    """
    cuenta, token = credenciales()
    contenido: list[dict] = []
    for img in imagenes[:3]:
        b64 = base64.b64encode(img).decode()
        contenido.append({"type": "image_url",
                          "image_url": {"url": f"data:image/jpeg;base64,{b64}"}})
    contenido.append({"type": "text", "text":
                      "Transcribí los números de esta pantalla de Tiempo en pantalla."
                      + (" Son varias capturas del MISMO período, desplazadas hacia abajo:"
                         " juntá todo en un solo informe y no repitas apps."
                         if len(imagenes) > 1 else "")})

    crudo = ""
    for temperatura in (0.1, 0.0):
        cuerpo = json.dumps({
            "messages": [
                {"role": "system", "content": SISTEMA},
                {"role": "user", "content": contenido},
            ],
            "max_tokens": 1200,
            "temperature": temperatura,
        }).encode()
        req = urllib.request.Request(
            f"https://api.cloudflare.com/client/v4/accounts/{cuenta}/ai/run/{MODELO}",
            data=cuerpo,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                d = json.load(r)
        except urllib.error.HTTPError as e:
            sys.exit(f"ERROR de Cloudflare: {e.code} {e.read().decode(errors='replace')[:200]}")
        crudo = (d.get("result") or {}).get("response", "")
        parsed = extraer_json(crudo)
        if parsed and (parsed.get("total_min") or parsed.get("apps")):
            return validar(parsed)

    sys.exit(f"ERROR: el modelo no devolvió JSON válido.\n{str(crudo)[:400]}")


def imprimir(r: dict) -> None:
    print(f"\n  {r['dispositivo'] or 'dispositivo desconocido'} · vista por {r['periodo']}")
    if r["actualizado"]:
        print(f"  actualizado: {r['actualizado']}")
    h = lambda m: f"{m // 60} h {m % 60:02d}" if m and m >= 60 else f"{m} min"
    if r["total_min"]:
        print(f"\n  total {h(r['total_min'])}" + (
            f" en {r['dias_transcurridos']} días" if r["dias_transcurridos"] else ""))
    if r["promedio_diario_min"]:
        print(f"  promedio diario {h(r['promedio_diario_min'])}"
              + (f"  ({r['cambio_pct']:+}% vs el período anterior)" if r["cambio_pct"] is not None else ""))
    if r["activaciones"] is not None:
        print(f"  activaciones: {r['activaciones']}")

    if r["categorias"]:
        print("\n  categorías:")
        for c in r["categorias"]:
            print(f"    {c['nombre'][:24]:<26} {h(c['min']):>10}")
    if r["apps"]:
        print("\n  apps:")
        for a in r["apps"]:
            print(f"    {a['nombre'][:24]:<26} {h(a['min']):>10}")
    if r["nota"]:
        print(f"\n  {r['nota']}")
    print()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--foto", nargs="+", help="una o más capturas del mismo período")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--from-stdin", action="store_true")
    args = ap.parse_args()

    if args.from_stdin:
        pedido = json.load(sys.stdin)
        imagenes = [base64.b64decode(b) for b in (pedido.get("imagenes_b64") or [])]
        if not imagenes and pedido.get("imagen_b64"):
            imagenes = [base64.b64decode(pedido["imagen_b64"])]
    elif args.foto:
        imagenes = [Path(f).read_bytes() for f in args.foto]
    else:
        ap.error("hace falta --foto o --from-stdin")

    if not imagenes:
        sys.exit("ERROR: no llegó ninguna imagen")

    r = leer(imagenes)
    if args.json or args.from_stdin:
        print(json.dumps(r, ensure_ascii=False))
    else:
        imprimir(r)


if __name__ == "__main__":
    main()
