#!/usr/bin/env python3
"""
De un alimento y unos gramos, a los nutrientes que tiene.

Los números NO los pone el modelo de lenguaje. Un modelo estimando miligramos
de potasio es ficción con formato de dato: acierta el orden de magnitud a veces
y el resto lo inventa con la misma seguridad. Acá los valores salen de tablas
de composición medidas en laboratorio.

Dos fuentes, en este orden:

1. USDA FoodData Central — la tabla de referencia. Para un alimento entero trae
   entre 89 y 113 nutrientes. Es americana, así que resuelve bien "arroz",
   "pollo" o "lechuga" y mal "alfajor".
2. Open Food Facts — productos envasados, con 16.052 argentinos. Resuelve la
   marca que USDA no conoce, a costa de menos micronutrientes.

Uso:
    python3 fetch/nutrientes.py "white rice cooked" --gramos 150
    python3 fetch/nutrientes.py --buscar "dulce de leche" --local
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parent.parent

USDA = "https://api.nal.usda.gov/fdc/v1"
OFF_BUSQUEDA = "https://search.openfoodfacts.org"

AGENTE = "garmin-stats/1.0 (registro de comidas personal)"

# Los nutrientes que vale la pena mostrar, con el nombre con el que los pide
# USDA y cómo los llamamos nosotros. El resto de los 100 y pico son ruido para
# un panel: aminoácidos sueltos, ácidos grasos individuales, cenizas.
INTERES: dict[str, tuple[str, str]] = {
    # nuestro nombre        (nombre en USDA,                 unidad)
    "calorias":             ("Energy",                       "KCAL"),
    "proteinas":            ("Protein",                      "G"),
    "carbohidratos":        ("Carbohydrate, by difference",  "G"),
    "azucares":             ("Total Sugars",                 "G"),
    "fibra":                ("Fiber, total dietary",         "G"),
    "grasas":               ("Total lipid (fat)",            "G"),
    "grasas_saturadas":     ("Fatty acids, total saturated", "G"),
    "sodio":                ("Sodium, Na",                   "MG"),
    "potasio":              ("Potassium, K",                 "MG"),
    "calcio":              ("Calcium, Ca",                  "MG"),
    "hierro":               ("Iron, Fe",                     "MG"),
    "magnesio":             ("Magnesium, Mg",                "MG"),
    "zinc":                 ("Zinc, Zn",                     "MG"),
    "vitamina_c":           ("Vitamin C, total ascorbic acid", "MG"),
    "vitamina_d":           ("Vitamin D (D2 + D3)",          "UG"),
    "vitamina_b12":         ("Vitamin B-12",                 "UG"),
    "folato":               ("Folate, total",                "UG"),
    "colesterol":           ("Cholesterol",                  "MG"),
}


def clave_usda() -> str:
    # DEMO_KEY funciona pero limita a ~30 pedidos por hora, así que sirve para
    # probar y no para usar. La propia es gratis y tarda un minuto.
    return os.getenv("USDA_API_KEY") or "DEMO_KEY"


def _get(url: str, timeout: int = 20) -> dict | None:
    req = urllib.request.Request(url, headers={"User-Agent": AGENTE})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8", "replace"))
    except Exception as e:
        print(f"  ⚠ {url.split('?')[0]}: {str(e)[:70]}", file=sys.stderr)
        return None


def _valor(nutrientes: list[dict], nombre: str, unidad: str) -> float | None:
    """El valor por 100 g, exigiendo la unidad.

    USDA devuelve la energía DOS veces, en KCAL y en kJ. Quedarse con la última
    que aparezca —que es lo que hace un diccionario por comprensión— multiplica
    todas las calorías por 4,184 sin que nada falle ni avise.
    """
    for n in nutrientes:
        if n.get("nutrientName") == nombre and (n.get("unitName") or "").upper() == unidad:
            v = n.get("value")
            if isinstance(v, (int, float)):
                return float(v)
    return None


# Palabras que no aportan a la identificación del alimento.
_VACIAS = {"a", "of", "with", "and", "the", "in", "raw", "fresh", "sliced", "chopped"}

# Presentaciones que cambian por completo la densidad calórica o la naturaleza
# del alimento. Un tomate son 18 kcal por 100 g; su polvo, 300; su salsa
# enlatada, 32 y con azúcar y sal agregadas.
_CONCENTRADO = ("powder", "dried", "dehydrated", "concentrate", "paste",
                "extract", "syrup", "freeze-dried", "infant formula",
                "canned", "sauce", "juice", "products", "entree", "soup")

# Fiambres y preparados que USDA nombra igual que el alimento entero. "Chicken
# breast, roll, oven-roasted" es un fiambre de 134 kcal; la pechuga de verdad
# ronda 165 y tiene otro perfil de sodio.
_PREPARADO = ("roll", "luncheon", "lunchmeat", "deli", "breaded", "meatless",
              "restaurant", "fast food", "prepared", "frozen meal",
              # "fat-free" y "low fat" son reformulaciones industriales: el
              # alimento entero no viene descremado.
              "fat-free", "low fat", "reduced fat", "nonfat")

# Cadenas cuyos nombres contaminan la búsqueda de alimentos simples.
_MARCAS = ("BURGER KING", "MCDONALD", "WENDY", "KFC", "TACO BELL",
           "DENNY", "PAPA JOHN", "PIZZA HUT", "SUBWAY", "DOMINO")


def puntuar(consulta: str, descripcion: str) -> float:
    """Cuánto se parece un candidato de USDA a lo que buscábamos.

    Hace falta porque el orden que devuelve USDA es engañoso: para "sliced
    tomato" el primero es *Pasta with Sliced Franks in Tomato Sauce* y el
    tomate aparece tercero. La búsqueda premia el solapamiento de palabras, y
    un plato preparado con nombre largo solapa más que el alimento simple.

    Tres señales, en orden de peso:

    1. Que la descripción EMPIECE por el sustantivo principal. USDA las escribe
       como "Tomato, roma" o "Bread, cheese": lo primero es el alimento y lo
       demás son calificativos. Si arranca con otra cosa, es otro alimento.
    2. Cuántas de las palabras buscadas aparecen.
    3. Cuánto le sobra. Un alimento simple tiene nombre corto; los nombres
       largos son platos preparados o presentaciones enlatadas.
    """
    palabras = [w for w in consulta.lower().replace(",", " ").split() if w not in _VACIAS]
    if not palabras:
        return 0.0
    d = descripcion.lower()
    dpal = [w.strip(",") for w in d.replace(",", " ").split()]

    # El sustantivo principal es la última palabra en inglés: "grilled chicken
    # BREAST", "beef BURGER". Se compara tolerando el plural.
    nucleo = palabras[-1].rstrip("s")
    empieza = bool(dpal) and dpal[0].rstrip("s") == nucleo

    cubiertas = sum(1 for w in palabras if w.rstrip("s") in d)
    cobertura = cubiertas / len(palabras)

    puntos = (1.4 if empieza else 0.0) + cobertura
    puntos -= 0.045 * len(dpal)                       # lo que le sobra

    # Formas concentradas del alimento. "Tomato powder" empieza por tomate y es
    # corto, así que empataba con "Tomato, roma" — y tiene 300 kcal por 100 g
    # contra 18. Si no las pediste, no las querés.
    for w in _CONCENTRADO:
        if w in d and w not in consulta.lower():
            puntos -= 1.2
            break

    for w in _PREPARADO:
        if w in d and w not in consulta.lower():
            puntos -= 1.0
            break

    # Mayúsculas = nombre comercial. Un nombre de cadena de comida rápida
    # aparece porque contiene la palabra buscada, no porque sea el alimento.
    if descripcion.isupper() or any(m in descripcion for m in _MARCAS):
        puntos -= 1.0
    return puntos


def buscar_usda(consulta: str) -> dict | None:
    """El mejor match entre varios candidatos, no el primero que devuelve.

    Pedir uno solo era el error de fondo: con `pageSize=1` te quedás con lo que
    el ranking de USDA puso arriba, que para un alimento simple suele ser un
    plato preparado con nombre largo. Se piden 25 y se elige con `puntuar`.
    """
    for tipos in ("Foundation,SR%20Legacy", "Branded"):
        q = urllib.parse.quote(consulta)
        d = _get(f"{USDA}/foods/search?api_key={clave_usda()}&query={q}"
                 f"&dataType={tipos}&pageSize=25")
        comidas = (d or {}).get("foods") or []
        if not comidas:
            continue

        mejor, mejor_puntos = None, float("-inf")
        for f in comidas:
            desc = f.get("description") or ""
            por100 = {k: _valor(f.get("foodNutrients") or [], n, u)
                      for k, (n, u) in INTERES.items()}
            # Un candidato sin calorías no sirve por más que el nombre calce.
            if por100.get("calorias") is None:
                continue
            pts = puntuar(consulta, desc)
            if pts > mejor_puntos:
                mejor, mejor_puntos = (f, desc, por100), pts

        if mejor:
            f, desc, por100 = mejor
            return {
                "fuente": "USDA",
                "tipo": tipos.replace("%20", " "),
                "descripcion": desc,
                "id": f.get("fdcId"),
                "puntaje": round(mejor_puntos, 2),
                "por_100g": {k: v for k, v in por100.items() if v is not None},
            }
    return None


def buscar_off(consulta: str) -> dict | None:
    """Productos envasados, que es donde USDA no llega.

    Va contra search.openfoodfacts.org y no contra /api/v2/search: aquella
    IGNORA `search_terms` en silencio y devuelve la base entera ordenada por lo
    que se le ocurra. Pedirle "dulce de leche" devolvía un queso francés con
    cara de resultado válido, que es la peor forma de fallar — nutrientes de
    cualquier cosa, sin un error que avise.
    """
    q = urllib.parse.quote(consulta)
    d = _get(f"{OFF_BUSQUEDA}/search?q={q}&page_size=10")
    hits = (d or {}).get("hits") or []
    # El primer resultado suele no tener tabla nutricional cargada; se busca el
    # primero que sí, en vez de devolver un producto sin datos.
    p = next((h for h in hits if (h.get("nutriments") or {}).get("energy-kcal_100g")), None)
    if not p:
        return None
    n = p.get("nutriments") or {}
    mapa = {
        "calorias": "energy-kcal_100g", "proteinas": "proteins_100g",
        "carbohidratos": "carbohydrates_100g", "azucares": "sugars_100g",
        "fibra": "fiber_100g", "grasas": "fat_100g",
        "grasas_saturadas": "saturated-fat_100g", "sodio": "sodium_100g",
    }
    por100 = {}
    for nuestro, suyo in mapa.items():
        v = n.get(suyo)
        if isinstance(v, (int, float)):
            # OFF da el sodio en gramos; nosotros lo mostramos en miligramos.
            por100[nuestro] = float(v) * (1000 if nuestro == "sodio" else 1)
    if "calorias" not in por100:
        return None
    return {
        "fuente": "Open Food Facts",
        "tipo": "producto envasado",
        "descripcion": " · ".join(
            x for x in (p.get("product_name"), ", ".join(p.get("brands") or [])) if x
        ),
        "id": None,
        "por_100g": por100,
    }


def nutrientes_de(consulta: str, gramos: float) -> dict | None:
    """Busca el alimento y escala sus nutrientes a la porción."""
    hallado = buscar_usda(consulta) or buscar_off(consulta)
    if not hallado:
        return None
    factor = gramos / 100.0
    return hallado | {
        "gramos": round(gramos),
        "nutrientes": {k: round(v * factor, 1) for k, v in hallado["por_100g"].items()},
    }


def sumar(items: list[dict]) -> dict:
    """Los totales del plato, sumando sólo lo que se pudo resolver."""
    total: dict[str, float] = {}
    for it in items:
        for k, v in (it.get("nutrientes") or {}).items():
            total[k] = total.get(k, 0.0) + v
    return {k: round(v, 1) for k, v in total.items()}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("consulta", nargs="?", help="nombre del alimento, en inglés para USDA")
    ap.add_argument("--gramos", type=float, default=100)
    ap.add_argument("--buscar", help="mostrar el match sin escalar")
    ap.add_argument("--local", action="store_true", help="buscar sólo en Open Food Facts")
    args = ap.parse_args()

    consulta = args.buscar or args.consulta
    if not consulta:
        ap.error("hace falta un alimento")

    r = buscar_off(consulta) if args.local else nutrientes_de(consulta, args.gramos)
    if not r:
        print(f"sin resultados para «{consulta}»", file=sys.stderr)
        sys.exit(1)
    print(json.dumps(r, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
