# Instalarlo con Claude Code

Si te da fiaca seguir el README a mano, copiá el bloque de abajo y pegalo en
**Claude Code** (la terminal, la app de escritorio o la extensión del editor),
parado en una carpeta vacía donde quieras que viva el proyecto.

No sirve pegarlo en claude.ai: hace falta que Claude pueda correr comandos y
escribir archivos en tu máquina.

---

```
Quiero instalar y dejar andando en mi computadora un panel personal de
entrenamiento que lee mis datos de Garmin Connect. Guiame paso a paso y hacé
vos los comandos, pero pará y preguntame cada vez que necesites algo mío.

El repositorio es https://github.com/ignaoliv/garmin-stats y es privado: si
`git clone` te da error de permisos, avisame para que le pida acceso al dueño.

Reglas importantes, no las saltees:

1. NUNCA me pidas mi contraseña de Garmin ni la escribas vos en ningún lado.
   Cuando haga falta, creá el archivo `.env` a partir de `.env.example` con los
   campos vacíos, decime en qué línea va cada cosa, y la escribo yo. Después
   verificá que `.env` esté ignorado por git (`git check-ignore -v .env`) sin
   mostrar el contenido del archivo por pantalla.

2. Nunca subas nada: no hagas `git push`, ni commits con `.env` o con la
   carpeta `public/data/` (son mis datos y mis credenciales).

3. Si Garmin responde 429 o "Too Many Requests", PARÁ. No reintentes en bucle:
   cada intento fallido alarga el bloqueo. Decime que hay que esperar entre 5 y
   20 minutos y esperamos, después probamos UNA sola vez.

Lo que necesito que hagas, en orden:

a) Verificá que tengo Node 18 o superior y Python 3.10 o superior. Si falta
   alguno, decime cómo instalarlo en mi sistema operativo y esperá a que lo
   haga.

b) Cloná el repositorio y entrá en la carpeta.

c) Leé el README.md del proyecto: tiene la guía completa y manda sobre
   cualquier cosa que yo te haya escrito acá.

d) Instalá las dependencias: `python3 -m pip install -r fetch/requirements.txt`
   y `npm install`.

e) Preparame el `.env` como dice la regla 1. Sólo son obligatorios
   GARMIN_EMAIL y GARMIN_PASSWORD.

f) Sobre las claves opcionales del `.env`, explicame qué pierdo si las dejo
   vacías y dejame decidir. Tienen que ser MÍAS, no del dueño del repo:
   - VITE_MAPTILER_KEY: sin ella los mapas usan un fondo alternativo.
   - CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_API_TOKEN: sin ellas no aparecen el
     análisis diario con IA ni el generador de planes. El resto del panel
     anda completo.
   Si las quiero, pasame el link exacto donde se sacan y qué permiso mínimo
   necesita cada una.

g) Primera sincronización corta para probar que el login anda:
   `python3 fetch/sync.py --limit 50`. Si sale bien, preguntame si quiero
   bajar todo el historial (puede tardar bastante) y con qué límite.

h) Bajá el calendario de eventos con `python3 fetch/eventos.py`. Eso no usa
   ninguna credencial.

i) Arrancá la app con `npm run dev` y pasame la URL para abrirla.

j) Al final contame en dos o tres líneas qué quedó andando, qué quedó apagado
   por falta de claves opcionales, y cómo actualizo los datos de acá en
   adelante.

Hablame en castellano rioplatense y no des por sentado que sé de
programación: si algo falla, explicame qué pasó antes de arreglarlo.
```

---

## Si el repo es privado

El dueño te tiene que dar acceso de lectura. Del lado de él:

```bash
gh api -X PUT repos/ignaoliv/garmin-stats/collaborators/TU-USUARIO -f permission=pull
```

O desde la web, en **Settings → Collaborators**.
