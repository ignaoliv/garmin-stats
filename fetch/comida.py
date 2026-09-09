#!/usr/bin/env python3
"""
De una foto de un plato, a los nutrientes que tiene.

Dos pasos, y el reparto entre ellos es la decisión de diseño importante:

1. El modelo IDENTIFICA los alimentos y estima cuántos gramos hay de cada uno.
   Eso es lo que un modelo de visión hace razonablemente.
2. Los NÚMEROS salen de una tabla de composición (ver nutrientes.py). Pedirle
   los miligramos de potasio al modelo sería inventarlos con formato de dato.

Lo honesto de decir: identificar anda bien; la porción es el eslabón débil.
De una foto plana no se saca el volumen, y ahí las apps comerciales se van
entre 20% y 40%. Por eso cada alimento viene con su nivel de confianza y la
idea es corregir los gramos antes de guardar, no confiar de taquito.

Uso:
    python3 fetch/comida.py --foto plato.jpg
    python3 fetch/comida.py --foto plato.jpg --json
    python3 fetch/comida.py --from-stdin      # {"imagen_b64": "...", "nota": "..."}
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from nutrientes import nutrientes_de, sumar  # noqa: E402

ROOT = Path(__file__).parent.parent
DATA = ROOT / "public" / "data"

try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
except ImportError:
    pass

# Llama 4 Scout: multimodal nativo y sin licencia que aceptar. El
# llama-3.2-11b-vision exige mandar 'agree' una vez antes de poder usarlo.
MODELO = "@cf/meta/llama-4-scout-17b-16e-instruct"

# Más de esto y la foto de un teléfono infla el pedido sin agregar nada que el
# modelo pueda ver.
LADO_MAX = 1024

SISTEMA = """Sos un nutricionista mirando la foto de un plato.

Tu ÚNICA tarea es identificar los alimentos y estimar cuántos gramos hay de
cada uno. NO calcules calorías ni nutrientes: de eso se encarga una base de
datos de composición de alimentos.

PARA ESTIMAR LA PORCIÓN usá referencias visibles: un plato playo estándar mide
26 cm, un tenedor 19, una lata 12 de alto. Si no hay ninguna referencia, decilo
en la nota y bajá la confianza.

CONFIANZA, con criterio:
- "alta" sólo si el alimento se identifica sin dudas Y hay una referencia de
  tamaño clara.
- "media" si reconocés el alimento pero la porción es una estimación.
- "baja" si dudás de qué es, o si está tapado por otra cosa, o si es una salsa
  o un aderezo cuya cantidad no se ve.

NOMBRES. Son dos y tienen destinos distintos:

"nombre" va en castellano rioplatense, como lo diría alguien acá: "milanesa",
"budín de pan", "puré".

"nombre_en" se usa para buscar en una tabla de composición de alimentos, así
que va escrito COMO SE LLAMA EL ALIMENTO EN ESA TABLA, no como se llama el
plato. La forma es "alimento, corte o variedad, cocción":
  · "beef, ground, cooked"        y no "burger"
  · "chicken, breast, roasted"    y no "grilled chicken"
  · "potato, boiled"              y no "mashed potatoes side"
  · "bread, white"                y no "bread roll"
La diferencia importa: buscar "burger" devuelve una hamburguesa de cadena de
comida rápida, y buscar "beef, ground, cooked" devuelve la carne.

Para un producto envasado de marca argentino, la marca va en "nombre" y el
genérico en "nombre_en".

QUÉ NO HACER:
- No inventes alimentos que no se ven. Si hay una salsa que no podés
  identificar, ponela como "salsa" con confianza baja, no como "salsa de
  tomate" con confianza alta.
- No cuentes el plato, los cubiertos ni el vaso vacío.
- Si en la foto no hay comida, devolvé la lista vacía y decilo en la nota.

Devolvés JSON válido y NADA más:
{
  "alimentos": [
    {"nombre": "Milanesa de carne", "nombre_en": "breaded beef cutlet fried",
     "gramos": 180, "confianza": "media"}
  ],
  "nota": "una frase sobre lo que la foto no permite saber: porciones tapadas,
           aceite de cocción, salsas, falta de referencia de tamaño"
}"""


def credenciales() -> tuple[str, str]:
    cuenta = os.getenv("CLOUDFLARE_ACCOUNT_ID")
    token = os.getenv("CLOUDFLARE_API_TOKEN")
    if not (cuenta and token):
        sys.exit(
            "ERROR: faltan credenciales de Cloudflare en .env\n"
            "  CLOUDFLARE_ACCOUNT_ID=  (dash.cloudflare.com → home de la cuenta)\n"
            "  CLOUDFLARE_API_TOKEN=   (permiso 'Workers AI: Read')"
        )
    return cuenta, token


def achicar(datos: bytes) -> bytes:
    """Una foto de teléfono son 3 MB; el modelo no ve más por eso.

    Sin esto el pedido va en base64 y se infla un tercio más, que es la forma
    más tonta de comerse un tiempo de espera.
    """
    try:
        from PIL import Image
    except ImportError:
        return datos
    try:
        im = Image.open(io.BytesIO(datos))
        im = im.convert("RGB")
        if max(im.size) > LADO_MAX:
            escala = LADO_MAX / max(im.size)
            im = im.resize((round(im.width * escala), round(im.height * escala)))
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=85)
        return buf.getvalue()
    except Exception:
        return datos


def extraer_json(texto: str) -> dict | None:
    """Rescata el objeto JSON de la respuesta.

    El modelo suele envolverlo en ```json … ``` o anteponer una frase.
    """
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


def identificar(imagen: bytes, nota: str = "") -> dict:
    """Paso 1: qué hay en el plato y cuánto."""
    cuenta, token = credenciales()
    b64 = base64.b64encode(achicar(imagen)).decode()
    pedido = "Analizá este plato."
    if nota:
        pedido += f"\n\nEl usuario aclara: {nota}"

    for temperatura in (0.2, 0.0):
        cuerpo = json.dumps({
            "messages": [
                {"role": "system", "content": SISTEMA},
                {"role": "user", "content": [
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                    {"type": "text", "text": pedido},
                ]},
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
            with urllib.request.urlopen(req, timeout=120) as r:
                d = json.load(r)
        except urllib.error.HTTPError as e:
            sys.exit(f"ERROR de Cloudflare: {e.code} {e.read().decode(errors='replace')[:200]}")
        crudo = (d.get("result") or {}).get("response", "")
        parsed = extraer_json(crudo)
        if parsed and isinstance(parsed.get("alimentos"), list):
            return parsed
    sys.exit(f"ERROR: el modelo no devolvió JSON válido.\n{crudo[:400]}")


def resolver(alimentos: list[dict], nota: str = "", origen: str = MODELO) -> dict:
    """Paso 2: de una lista de alimentos con gramos, a los nutrientes.

    Está separado de `identificar` a propósito. De acá para abajo el trabajo es
    el mismo venga la lista de una foto, de una descripción escrita o de un
    alimento suelto que agregaste a mano — y las reglas de emparejado con la
    tabla son justo las que costó afinar. Tenerlas en un solo lugar es lo que
    evita que el mismo "milanesa" resuelva distinto según por dónde entró.
    """
    items = []
    for a in alimentos:
        gramos = a.get("gramos")
        if not isinstance(gramos, (int, float)) or gramos <= 0:
            continue
        consulta = a.get("nombre_en") or a.get("nombre") or ""
        encontrado = nutrientes_de(consulta, float(gramos)) if consulta else None
        items.append({
            "nombre": a.get("nombre") or consulta,
            "consulta": consulta,
            "gramos": round(float(gramos)),
            "confianza": a.get("confianza", "media"),
            # Sin match no se inventa: el alimento queda listado con sus gramos
            # y sin nutrientes, y el total dice cuántos quedaron afuera.
            "encontrado": bool(encontrado),
            "fuente": encontrado.get("fuente") if encontrado else None,
            "coincidencia": encontrado.get("descripcion") if encontrado else None,
            "nutrientes": encontrado.get("nutrientes") if encontrado else None,
            # Los otros candidatos, para poder cambiar de alimento sin volver a
            # buscar. Salen de la misma consulta, así que son gratis.
            "alternativas": (encontrado.get("alternativas") or []) if encontrado else [],
        })

    sin_resolver = [i["nombre"] for i in items if not i["encontrado"]]
    return {
        "alimentos": items,
        "total": sumar(items),
        "sin_resolver": sin_resolver,
        "nota": nota,
        "modelo": origen,
    }


def analizar(imagen: bytes, nota: str = "") -> dict:
    """Los dos pasos juntos: identificar en la foto y buscar los nutrientes."""
    visto = identificar(imagen, nota)
    return resolver(visto.get("alimentos", []), visto.get("nota", ""))


def buscar_uno(nombre: str, gramos: float, nombre_en: str = "") -> dict:
    """Un alimento suelto: el que agregás o el que renombrás a mano.

    EL MODELO SE USA SÓLO PARA TRADUCIR, no para decidir qué comiste ni cuánto.
    Eso lo pusiste vos y se respeta tal cual: tus gramos y tu nombre en la
    pantalla. Lo único que se le pide es la forma que entiende la tabla.

    Hace falta porque la tabla está en inglés y la pantalla en castellano, y
    buscar el nombre en castellano no falla en silencio: devuelve basura de
    productos de marca. Medido antes de agregar esto — "milanesa de carne" daba
    *TILAPIA MILANESA* (pescado), "arroz blanco" daba un pan dulce y "tuco"
    daba un condimento. Renombrar habría dado PEOR resultado que no tocar nada,
    que es la peor forma posible de estrenar una función.
    """
    consulta = nombre_en.strip()
    if not consulta:
        try:
            # Se importa acá y no arriba: comida_texto importa este módulo y
            # arriba sería una importación circular.
            from comida_texto import interpretar
            visto = interpretar(f"{gramos:.0f} g de {nombre}")
            primero = (visto.get("alimentos") or [{}])[0]
            consulta = str(primero.get("nombre_en") or "").strip()
        except Exception:
            # Si el modelo no contesta, se busca con el nombre tal cual. Puede
            # no encontrar nada, y eso la pantalla lo dice.
            consulta = ""

    return resolver([{
        "nombre": nombre,
        "nombre_en": consulta or nombre,
        "gramos": gramos,
        # A mano no hay porción que dudar: el número lo pusiste vos.
        "confianza": "alta",
    }], origen="manual")


def imprimir(r: dict) -> None:
    print()
    for a in r["alimentos"]:
        kcal = (a["nutrientes"] or {}).get("calorias")
        marca = {"alta": "●", "media": "◐", "baja": "○"}.get(a["confianza"], "·")
        linea = f"  {marca} {a['nombre'][:32]:<32} {a['gramos']:>4} g"
        linea += f"  {kcal:>6.0f} kcal" if kcal is not None else "   (sin datos)"
        print(linea)
        if a["coincidencia"]:
            print(f"      ↳ {a['fuente']}: {a['coincidencia'][:56]}")

    t = r["total"]
    if t:
        print(f"\n  Total: {t.get('calorias', 0):.0f} kcal · "
              f"{t.get('proteinas', 0):.0f} g proteína · "
              f"{t.get('carbohidratos', 0):.0f} g carbohidratos · "
              f"{t.get('grasas', 0):.0f} g grasa")
    if r["sin_resolver"]:
        print(f"\n  ⚠ sin datos nutricionales: {', '.join(r['sin_resolver'])}")
    if r["nota"]:
        print(f"\n  {r['nota']}")
    print("\n  ● alta confianza  ◐ media  ○ baja — revisá los gramos antes de guardar.\n")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--foto", help="ruta de la imagen")
    ap.add_argument("--nota", default="", help="aclaración para el modelo")
    ap.add_argument("--json", action="store_true", help="sólo el JSON, para el endpoint")
    ap.add_argument("--from-stdin", action="store_true")
    args = ap.parse_args()

    if args.from_stdin:
        req = json.load(sys.stdin)
        # El mismo script atiende dos pedidos distintos: una foto para
        # identificar, o un alimento suelto que ya viene nombrado.
        if req.get("nombre") and not req.get("imagen_b64"):
            print(json.dumps(buscar_uno(req["nombre"], float(req.get("gramos") or 0),
                                        req.get("nombre_en", "")), ensure_ascii=False))
            return
        imagen = base64.b64decode(req["imagen_b64"])
        nota = req.get("nota", "")
    elif args.foto:
        imagen = Path(args.foto).read_bytes()
        nota = args.nota
    else:
        ap.error("hace falta --foto o --from-stdin")

    r = analizar(imagen, nota)
    if args.json or args.from_stdin:
        print(json.dumps(r, ensure_ascii=False))
    else:
        imprimir(r)


if __name__ == "__main__":
    main()
