#!/usr/bin/env python3
"""
De una descripción escrita a los alimentos con sus gramos.

Es la hermana de comida.py: aquella mira una foto, ésta lee una frase. De ahí
para abajo el camino es el mismo — `comida.resolver()` busca los nutrientes en
la tabla — para que "milanesa" dé lo mismo hayas sacado la foto o escrito.

CUÁNDO GANA CADA UNA. La foto es mejor para saber QUÉ hay en el plato; el texto
es mejor para saber CUÁNTO, porque vos sabés que eran dos milanesas y la foto
tiene que adivinarlo del tamaño aparente. Por eso las dos entradas conviven en
la pantalla en vez de competir: si mandás foto y texto juntos, el texto viaja
como nota y guía la identificación.

Uso:
    python3 fetch/comida_texto.py --texto "dos milanesas con puré y una ensalada"
    python3 fetch/comida_texto.py --from-stdin      # {"texto": "..."}
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(Path(__file__).parent))

try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
except ImportError:
    pass

MODELO = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"

SISTEMA = """Sos un nutricionista leyendo lo que alguien escribió que comió, en
castellano rioplatense. Tu tarea es convertir esa frase en una lista de
alimentos con sus gramos. No calculás calorías ni nutrientes: de eso se encarga
una tabla de composición de alimentos.

PORCIONES. Si la persona dice una cantidad ("dos milanesas", "un plato de
fideos", "150 g de pollo"), usala. Si no dice nada, aplicá la porción habitual
de acá:
  · milanesa de carne o pollo: 150 g cada una
  · plato de fideos o arroz ya cocidos: 220 g
  · bife o pechuga: 180 g
  · huevo: 55 g          · pan, rodaja: 30 g       · medialuna: 45 g
  · ensalada de guarnición: 120 g                  · papas fritas: 150 g
  · taza de leche: 200 g · yogur, pote: 190 g      · fruta mediana: 150 g
  · pizza, porción: 110 g                          · empanada: 100 g
  · mate o café: no lo agregues si no lleva leche ni azúcar

CONFIANZA:
- "alta" sólo si la persona dio la cantidad o el peso.
- "media" si la cantidad se deduce de una porción habitual.
- "baja" si no queda claro qué es o cuánto había.

NOMBRES. Son dos y van a lugares distintos:

"nombre" en castellano rioplatense, como lo diría alguien acá: "milanesa",
"puré", "budín de pan".

"nombre_en" se usa para buscar en una tabla de composición de alimentos, así
que va escrito COMO SE LLAMA EL ALIMENTO EN ESA TABLA, no como se llama el
plato. La forma es "alimento, corte o variedad, cocción":
  · "beef, ground, cooked"        y no "burger"
  · "chicken, breast, roasted"    y no "grilled chicken"
  · "potato, boiled"              y no "mashed potatoes side"
  · "pasta, cooked"               y no "spaghetti dish"
La diferencia importa: buscar "burger" devuelve una hamburguesa de cadena de
comida rápida y buscar "beef, ground, cooked" devuelve la carne.

QUÉ NO HACER:
- No agregues alimentos que no se nombraron. Si dice "milanesa con puré", son
  dos cosas, no tres: no le sumes una ensalada porque suele venir con eso.
- Separá lo que la tabla busca por separado: "fideos con tuco" son fideos y
  salsa de tomate en dos renglones.
- Si la frase no habla de comida, devolvé la lista vacía y decilo en la nota.

Devolvés JSON válido y NADA más:
{
  "alimentos": [
    {"nombre": "Milanesa de carne", "nombre_en": "beef cutlet breaded fried",
     "gramos": 300, "confianza": "alta"}
  ],
  "nota": "una frase sobre lo que la descripción no permite saber: cómo estaba
           cocinado, si llevaba aceite o aderezos, porciones supuestas"
}"""


def credenciales() -> tuple[str, str]:
    cuenta = os.getenv("CLOUDFLARE_ACCOUNT_ID")
    token = os.getenv("CLOUDFLARE_API_TOKEN")
    if not (cuenta and token):
        sys.exit("ERROR: faltan CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_API_TOKEN en .env")
    return cuenta, token


def interpretar(texto: str) -> dict:
    """Paso 1: de la frase a los alimentos con gramos."""
    from comida import extraer_json
    cuenta, token = credenciales()

    crudo = ""
    for temperatura in (0.2, 0.0):
        cuerpo = json.dumps({
            "messages": [
                {"role": "system", "content": SISTEMA},
                {"role": "user", "content": f"Comí: {texto.strip()[:600]}"},
            ],
            "max_tokens": 800,
            "temperature": temperatura,
        }).encode()
        req = urllib.request.Request(
            f"https://api.cloudflare.com/client/v4/accounts/{cuenta}/ai/run/{MODELO}",
            data=cuerpo,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                d = json.load(r)
        except urllib.error.HTTPError as e:
            sys.exit(f"ERROR de Cloudflare: {e.code} {e.read().decode(errors='replace')[:200]}")
        crudo = (d.get("result") or {}).get("response", "")
        parsed = extraer_json(crudo)
        if parsed and isinstance(parsed.get("alimentos"), list):
            return parsed
    sys.exit(f"ERROR: el modelo no devolvió JSON válido.\n{str(crudo)[:400]}")


def desde_texto(texto: str) -> dict:
    """Los dos pasos: interpretar la frase y buscar los nutrientes."""
    from comida import resolver
    visto = interpretar(texto)
    return resolver(visto.get("alimentos", []), visto.get("nota", ""), origen=MODELO)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--texto", help="lo que comiste, en una frase")
    ap.add_argument("--from-stdin", action="store_true")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    if args.from_stdin:
        texto = json.load(sys.stdin).get("texto", "")
    elif args.texto:
        texto = args.texto
    else:
        ap.error("hace falta --texto o --from-stdin")

    r = desde_texto(texto)
    if args.json or args.from_stdin:
        print(json.dumps(r, ensure_ascii=False))
        return

    from comida import imprimir
    imprimir(r)


if __name__ == "__main__":
    main()
