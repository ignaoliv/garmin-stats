#!/usr/bin/env python3
"""
El brief del objetivo: qué mover primero para acercarse a lo que uno quiere.

El PUNTAJE no se calcula acá. Se calcula en el navegador (src/lib/objetivos.ts),
que es donde se puede leer, discutir y ajustar sin llamar a ningún modelo. Lo
que se le pide al modelo es lo otro: mirar las piezas juntas y decir cuál
conviene mover primero, que es justo lo que un promedio ponderado no sabe hacer.

O sea: el número es determinista y el texto es del modelo. Si el modelo no
contesta, el puntaje y su desglose siguen en pantalla igual.

Uso:
    python3 fetch/objetivo.py --from-stdin   # recibe el digest que arma la app
    python3 fetch/objetivo.py --ejemplo      # digest de prueba, para ver el tono
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

try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
except ImportError:
    pass

MODELO = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"

SISTEMA = """Sos un entrenador leyendo los datos de una persona que eligió un
objetivo concreto de salud. Tu tarea NO es evaluar cómo entrena en general: es
decirle qué la acerca y qué la aleja DE ESE OBJETIVO.

IDIOMA: español rioplatense, hablándole de vos y en segunda persona. Escribís
"llevás", "venís", "tenés", "entrenaste". NUNCA "el atleta" ni tercera persona.
Los imperativos van en voseo, con el acento en la última sílaba: "sumá",
"mantené", "subí", "bajá", "dormí", "agregá", "comé", "registrá", "anotá",
"elegí", "probá", "sostené". NUNCA "suma", "mantén", "sube", "duerme",
"agrega", "come", "registra", "anota", "elige", "prueba", que son de España.
Esto vale también dentro de "esta_semana", que es donde más se escapa.
Pasado simple ("bajó", "fue"), nunca "ha bajado". Directo, sin relleno motivacional.

QUÉ TENÉS ADELANTE:
- "objetivo": lo que la persona eligió, con una línea de qué significa.
- "score": un puntaje de 0 a 100 YA CALCULADO. No lo recalcules ni lo discutas;
  es el marco del que hablás.
- "componentes": las piezas del objetivo. Cada una trae su puntaje de 0 a 100,
  cuánto pesa en el total, el valor real y contra qué se lo mide. VIENEN
  ORDENADAS DE PEOR A MEJOR: la primera es la que más lejos está.
- "faltantes": piezas que no se pudieron medir por falta de datos.
- "metricas": los números crudos, por si necesitás un detalle.

CÓMO PENSARLO — y esto es lo importante:
1. La palanca que más mueve el puntaje es la que combina PUNTAJE BAJO con PESO
   ALTO. Una pieza de 20 puntos que pesa 25 mueve mucho más que una de 60 que
   pesa 10. Recomendá en ese orden, no en el orden en que se te ocurra.
2. Nombrá lo que YA ESTÁ BIEN, con su número. Una lista de reproches no la lee
   nadie dos veces, y además es falsa: si el puntaje es 60, hay piezas altas.
3. Si algo está en "faltantes", NO opines sobre eso. Decí que falta el dato y
   qué habría que registrar para tenerlo. Nunca lo supongas.
4. Las piezas se relacionan entre sí. Poco sueño con carga alta, o pasos altos
   con cero fuerza, dicen más juntas que por separado: buscá esas lecturas.
5. Si el objetivo es de peso o de composición corporal, no des consejos de
   dieta restrictiva ni pautes calorías. Hablá de proteína, de pasos, de fuerza
   y de sostener el ritmo. Nada de ayunos ni de déficits agresivos.

REGLAS DURAS:
- Basate SOLO en los números que te doy. No inventes ninguno.
- Cada acción es concreta y cuantificada: "sumá una tercera sesión de fuerza",
  "subí de 6.200 a 8.000 pasos", "agregá 30 g de proteína en el desayuno".
  Prohibido "mejorá tu alimentación", "entrená más" o "sé constante".
- No des consejo médico ni diagnostiques. Si algo llama la atención, sugerí
  consultarlo.
- Nunca menciones nombres de campos del JSON ni escribas cosas como
  "componentes.fuerza": escribís para una persona.

Devolvés JSON válido y NADA más, con esta forma exacta:
{
  "titular": "una frase de 10 palabras máximo sobre dónde estás parado para ESTE objetivo",
  "estado": "bien" | "atencion" | "alerta",
  "lectura": "2 o 3 oraciones: qué dice el puntaje, qué pieza lo está frenando y qué pieza lo está sosteniendo, cada una con su número",
  "palancas": [
    {
      "titulo": "la pieza a mover, en 3 o 4 palabras",
      "accion": "qué hacer, cuantificado, en una oración",
      "porque": "por qué esto y no otra cosa, atado a este objetivo"
    }
  ],
  "esta_semana": ["2 o 3 acciones concretas para los próximos 7 días, una por línea"]
}
"palancas" lleva 2 o 3 entradas, ordenadas por cuánto mueven el puntaje.

ANTES DE DEVOLVER, releé cada imperativo que escribiste —sobre todo los de
"esta_semana", que es el último campo y donde más se afloja— y pasá a voseo
cualquiera que haya salido en forma de España: "mantén" → "mantené",
"registra" → "registrá", "sube" → "subí", "come" → "comé"."""


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


def extraer_json(texto: object) -> dict | None:
    """Rescata el objeto JSON de la respuesta.

    Workers AI a veces devuelve `response` ya parseado y a veces como texto
    envuelto en ```json … ``` o con una frase adelante.
    """
    if isinstance(texto, dict):
        return texto
    if not isinstance(texto, str):
        return None
    t = texto.strip()
    if t.startswith("```"):
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


def validar(d: dict) -> dict:
    """Recorta la respuesta a la forma que la pantalla sabe dibujar.

    Sin esto, un campo de más o una lista donde iba texto rompen la tarjeta con
    un error de React, que es la peor forma posible de contar que el modelo
    contestó raro.
    """
    def texto(v: object, largo: int) -> str:
        return str(v).strip()[:largo] if isinstance(v, (str, int, float)) else ""

    palancas = []
    for p in (d.get("palancas") or [])[:3]:
        if not isinstance(p, dict):
            continue
        titulo, accion = texto(p.get("titulo"), 60), texto(p.get("accion"), 300)
        if titulo and accion:
            palancas.append({"titulo": titulo, "accion": accion,
                             "porque": texto(p.get("porque"), 300)})

    estado = d.get("estado")
    return {
        "titular": texto(d.get("titular"), 120),
        "estado": estado if estado in ("bien", "atencion", "alerta") else "atencion",
        "lectura": texto(d.get("lectura"), 700),
        "palancas": palancas,
        "esta_semana": [texto(a, 200) for a in (d.get("esta_semana") or [])[:3]
                        if texto(a, 200)],
        "modelo": MODELO,
    }


def brief(digest: dict) -> dict:
    cuenta, token = credenciales()
    pedido = (
        "Leé estos datos y devolvé el JSON pedido.\n\n"
        + json.dumps(digest, ensure_ascii=False, indent=1)
    )

    crudo = ""
    for temperatura in (0.3, 0.0):
        cuerpo = json.dumps({
            "messages": [
                {"role": "system", "content": SISTEMA},
                {"role": "user", "content": pedido},
            ],
            "max_tokens": 1100,
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
        if parsed and parsed.get("titular"):
            return validar(parsed)

    sys.exit(f"ERROR: el modelo no devolvió JSON válido.\n{str(crudo)[:400]}")


EJEMPLO = {
    "objetivo": {
        "id": "recomposicion",
        "nombre": "Recomposición corporal",
        "resumen": "Bajar grasa sin perder músculo.",
    },
    "score": 58,
    "banda": "En camino",
    "componentes": [
        {"label": "Sesiones de fuerza", "puntos": 30, "peso": 25,
         "valor": "0,9 por semana", "meta": "3 por semana"},
        {"label": "Pasos diarios", "puntos": 62, "peso": 15,
         "valor": "7.100 por día", "meta": "9.000 sostenidos"},
        {"label": "Ritmo del peso", "puntos": 88, "peso": 20,
         "valor": "-0,15 kg por semana", "meta": "entre −0,4 y +0,1"},
        {"label": "Sueño", "puntos": 92, "peso": 10,
         "valor": "7,3 h por noche", "meta": "7 a 9 horas"},
    ],
    "faltantes": ["Proteína"],
    "metricas": {"peso": 78.4, "fcReposo": 54, "sesionesSemana": 3.2},
}


def imprimir(r: dict) -> None:
    print(f"\n  {r['titular']}  [{r['estado']}]\n")
    print(f"  {r['lectura']}\n")
    for p in r["palancas"]:
        print(f"  → {p['titulo']}")
        print(f"    {p['accion']}")
        if p["porque"]:
            print(f"    ({p['porque']})")
    if r["esta_semana"]:
        print("\n  Esta semana:")
        for a in r["esta_semana"]:
            print(f"    · {a}")
    print()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-stdin", action="store_true", help="el digest llega por stdin")
    ap.add_argument("--ejemplo", action="store_true", help="usar un digest de prueba")
    args = ap.parse_args()

    if args.ejemplo:
        digest = EJEMPLO
    elif args.from_stdin:
        digest = json.load(sys.stdin)
    else:
        ap.error("hace falta --from-stdin o --ejemplo")

    r = brief(digest)
    if args.from_stdin:
        print(json.dumps(r, ensure_ascii=False))
    else:
        imprimir(r)


if __name__ == "__main__":
    main()
