# Garmin Stats

Panel personal de entrenamiento y salud sobre tus datos de Garmin Connect.
Entrenamiento, sueño, pasos, peso, estrés, comida por foto, tiempo en pantalla,
objetivos de salud y análisis con IA.

Hay dos formas de usarlo y la segunda es opcional:

- **En tu computadora.** Bajás tus datos de Garmin a archivos locales y abrís la
  app. Nada sale de tu máquina.
- **Publicado en Vercel.** Tus datos viven en un almacenamiento privado de tu
  propia cuenta, el panel se abre desde el teléfono y se sincroniza solo una vez
  por día. Con la cuenta gratuita alcanza.

> **¿Recién llegás?** El camino más corto es
> [INSTALAR-CON-CLAUDE.md](INSTALAR-CON-CLAUDE.md): un prompt para pegar en
> Claude Code que hace la instalación entera, incluido el fork. Si preferís a
> mano, seguí esta guía.

---

## Lo primero: forkealo, no lo clones

Hacé un **fork** a tu cuenta de GitHub y trabajá sobre tu copia.

Si clonás, quedás con una copia muerta: para traer una mejora habría que
rehacerlo todo a mano. Con un fork, cuando este repositorio publique algo nuevo
te aparece el aviso de *"This branch is behind"* con un botón **Sync fork**. Lo
apretás y, si lo publicaste en Vercel, tu proyecto se redespliega solo en menos
de un minuto.

**Tus datos y tus variables de entorno no se tocan nunca al actualizar.**

```bash
gh repo fork ignaoliv/garmin-stats --clone
```

O apretá "Fork" en la web y después cloná tu copia.

---

## Qué trae

| Sección | Qué hay adentro |
|---|---|
| **Resumen** | Objetivo de salud con puntaje, Preparación del día, tu racha de semanas, la semana en curso, estado de forma (CTL/ATL/TSB), descanso, pasos, FC en reposo y calorías |
| **Comida** | Foto del plato o descripción escrita, identificada con IA y con los nutrientes sacados de una tabla de composición. Editable por día, con balance de consumido contra gastado |
| **Pantalla** | Tiempo en pantalla y uso de redes, cargado desde una captura del resumen de iOS |
| **Entrenar** | Plan de fuerza de varias semanas generado con IA, alineado al objetivo elegido, y envío de sesiones al reloj |
| **Salud** | Peso con composición corporal, estrés con el reparto del día, pasos y sueño |
| **Analizar** | Comparación semana a semana y mes a mes, racha, temporadas, constancia, zonas de FC y rendimiento |
| **Eventos** | Calendario de carreras de la región con cuenta regresiva |
| **Actividades** | Listado completo y detalle de cada sesión, con mapa y series por segundo |
| **Ajustes** | Tu perfil fisiológico: FC máxima, umbral y FTP |

### Dos ideas que atraviesan todo

**Lo que el dispositivo no mide se declara, no se inventa.** Si tu reloj no
calcula algo, la tarjeta lo dice en vez de desaparecer o de mostrar un cero. Un
ciclocomputador no tiene muñeca: sin pulso en reposo, sin estrés, sin sueño.

**Las comparaciones van contra el mismo tramo transcurrido.** Un martes al
mediodía no se compara contra una semana entera. Eso daría "venís mal" todos los
martes.

---

## Antes de empezar

| Programa | Para qué sirve | Cómo comprobarlo |
|---|---|---|
| **Node.js** 18 o superior | Ejecutar la app web | `node --version` |
| **Python** 3.10 o superior | Descargar datos de Garmin | `python3 --version` |

Más una **cuenta de Garmin Connect**, la misma que usás en el teléfono.

Si te faltan: [nodejs.org](https://nodejs.org) (versión LTS) y
[python.org/downloads](https://python.org/downloads).

---

## Parte 1: que ande en tu computadora

### 1. Las dependencias

```bash
python3 -m pip install -r fetch/requirements.txt
npm install
```

### 2. Tus credenciales

```bash
cp .env.example .env
```

Abrí el `.env` y completá `GARMIN_EMAIL` y `GARMIN_PASSWORD`. Son las únicas dos
obligatorias para esta parte. El archivo está ignorado por git, comprobalo con:

```bash
git check-ignore -v .env
```

### 3. La primera sincronización

Corta, para ver que el login anda:

```bash
python3 fetch/sync.py --limit 50
```

Si sale bien, bajá el resto. Puede tardar varias horas si tenés años de
historial, porque descarga el detalle de cada actividad:

```bash
python3 fetch/sync.py
python3 fetch/eventos.py     # el calendario de carreras, sin credenciales
```

> **Si Garmin contesta 429 o "Too Many Requests", pará.** Cada reintento alarga
> el bloqueo. Esperá entre 5 y 20 minutos y probá **una** sola vez más.

### 4. Abrir la app

```bash
npm run dev
```

Te da una dirección tipo `http://localhost:5173`.

---

## Parte 2: publicarlo (opcional)

Esto lo deja accesible desde el teléfono y lo sincroniza solo. Tus datos pasan a
vivir en un almacenamiento privado de **tu** cuenta de Vercel.

### 1. El proyecto en Vercel

Creá un proyecto nuevo conectado a **tu fork**. El framework es Vite.

### 2. El almacenamiento

En el proyecto, Storage → Create → Blob. Copiá el token que aparece en su
pestaña `.env.local`. Va tanto en las variables del proyecto en Vercel como en
tu `.env` local, porque hace falta acá para la carga inicial.

> `vercel env pull` **no** trae los valores cifrados. Ese token hay que copiarlo
> del panel a mano.

### 3. Las variables en Vercel

Todas en Production:

| Variable | Qué es |
|---|---|
| `VITE_DATOS_BASE` | Poné `/api/datos`. Sin esta, la app publicada busca los datos donde no están |
| `SITE_PASSWORD` | La contraseña con la que entrás al panel. La elegís vos, no tiene nada que ver con la de Garmin |
| `BLOB_READ_WRITE_TOKEN` | El del paso anterior |
| `CRON_SECRET` | Un secreto largo para que sólo la tarea programada pueda disparar la sincronización. Generalo con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CLOUDFLARE_ACCOUNT_ID` y `CLOUDFLARE_API_TOKEN` | Opcionales, para la IA |
| `USDA_API_KEY` | Opcional, para la tabla de alimentos |

### 4. Subir tus datos

```bash
node scripts/publicar-datos.mjs
```

### 5. El token de sesión de Garmin

```bash
python3 fetch/token_garmin.py --crear
python3 fetch/token_garmin.py --verificar
```

Esto guarda **la sesión ya resuelta** en tu almacenamiento privado, para que la
sincronización diaria no tenga que loguearse de nuevo. Tu contraseña no se
guarda en ningún lado: se usa una sola vez, acá, en tu máquina.

**Por qué importa:** el login de Garmin pasa por Cloudflare y contesta 429 si lo
golpeás seguido. Una función de Vercel arranca con el disco vacío, así que
loguearse todos los días sería la forma segura de comerse un bloqueo. Con el
token guardado, la corrida diaria no toca el login. Si Garmin renueva la sesión
durante el trabajo, el token nuevo se guarda antes de salir.

### 6. Listo

La sincronización corre sola todos los días a las **11:00 UTC**, definido en
`vercel.json`. También hay un botón **Sincronizar** en el Resumen.

---

## Después de la primera vez

```bash
python3 fetch/sincronizar.py        # lo que cambió desde ayer, contra public/data
python3 fetch/sincronizar.py --blob # lo mismo, contra el blob
npm run dev
```

`sync.py` es la carga inicial y recorre todo. `sincronizar.py` es la diaria:
mira las últimas 25 actividades, baja el detalle de las que faltan y refresca
pasos, sueño, recuperación, peso y plan.

---

## Las claves opcionales

Son tuyas, no las compartas con nadie. La app anda sin ellas:

| Sin la clave | Qué perdés |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` y `CLOUDFLARE_API_TOKEN` | El análisis diario, el brief del objetivo, la comida por foto, la lectura de capturas de pantalla y el generador de planes. El resto anda completo |
| `USDA_API_KEY` | Los micronutrientes de la comida. Sin ella se usa una clave de prueba que se agota con dos fotos. Es gratis en [fdc.nal.usda.gov](https://fdc.nal.usda.gov/api-key-signup.html) |
| `VITE_MAPTILER_KEY` | Los mapas usan un fondo alternativo |

El token de Cloudflare da acceso a tu cuenta y el gasto de IA se carga a quien
sea dueño de la clave.

---

## Tu perfil fisiológico

En **Ajustes** están la FC máxima, el umbral y el FTP. **No son un detalle:** de
ahí sale la carga de cada sesión, y de esa carga salen el fitness, la fatiga, el
estado de forma y la preparación del día.

El mismo esfuerzo a 150 ppm cuenta un 35% más si tu máxima es 170 que si es 185.
Si dejás los valores por defecto, todos tus números de carga van a estar
corridos.

Para que te proponga uno a partir de tus propias actividades:

```bash
python3 fetch/perfil.py
```

Cambiarlo **no** recalcula el historial solo: la carga ya está escrita dentro de
los datos, sesión por sesión. Para rehacerla:

```bash
python3 fetch/enrich.py --rehacer
node scripts/publicar-datos.mjs   # si lo tenés publicado
```

---

## Problemas frecuentes

**"ERROR: Set GARMIN_EMAIL and GARMIN_PASSWORD in .env"**
No existe el `.env` o está vacío. Copiá `.env.example` y completalo.

**"Authentication failed" al sincronizar**
Revisá el correo y la contraseña. Si tenés verificación en dos pasos, la API
privada de Garmin no la soporta bien y puede fallar igual.

**Se corta con 429 o "Too Many Requests"**
Es el límite de Garmin por IP, no por cuenta. Esperá entre 5 y 20 minutos y
probá una sola vez. Reintentar en bucle alarga el bloqueo.

**"No se encontró /data/activities.json"**
Todavía no corriste la sincronización, o la corriste desde otra carpeta.

**La sincronización diaria dejó de traer datos**
Probablemente venció el token de Garmin. Corré
`python3 fetch/token_garmin.py --crear` de nuevo.

**El puerto 5173 está en uso**
`npm run dev -- --port 5174`.

---

## Estructura

```
garmin-stats/
├── .env                      ← tus credenciales (nunca se sube)
├── api/                      ← funciones de Vercel (sesión, datos, comida, plan, sync)
├── fetch/                    ← scripts de Python
│   ├── sync.py               ← carga inicial completa
│   ├── sincronizar.py        ← la diaria, incremental
│   ├── token_garmin.py       ← la sesión de Garmin para el cron
│   ├── perfil.py             ← FC máxima, umbral, FTP
│   └── blob.py               ← cliente de Vercel Blob para Python
├── scripts/publicar-datos.mjs ← sube public/data al blob
├── public/data/              ← tus datos (nunca se sube)
└── src/                      ← la app (React + Vite + Tailwind)
```

---

## Privacidad

Estos archivos tienen datos personales o credenciales. El `.gitignore` ya los
excluye, pero conviene conocerlos:

| Archivo | Qué contiene | Riesgo |
|---|---|---|
| `.env` | Credenciales de Garmin y todas las claves | Acceso total a tu cuenta |
| `public/data/` | Actividades, rutas GPS, sueño, peso | Dónde vivís, dónde entrenás, tu salud |
| `dist/data/` | Copia de lo anterior al compilar | Igual |

Dentro de los JSON hay coordenadas de cada entrenamiento, ciudades en los
títulos, frecuencia cardíaca, VO2max y patrones horarios.

**Antes de cualquier `git push`:**

```bash
git status
```

No deberían aparecer `.env` ni nada de `public/data/`. Si alguna vez los
agregaste por error:

```bash
git rm -r --cached public/data/
git rm --cached .env
```

Si ya los subiste a GitHub, **cambiá tu contraseña de Garmin** y considerá
borrar el historial del repositorio.

### Si lo publicás, está abierto a internet

El HTML es público y no tiene datos adentro: lo que se protege son los datos,
con la contraseña de `SITE_PASSWORD`. Todas las rutas de API contestan 401 sin
sesión.

Esto reemplaza a la protección de despliegue de Vercel a propósito: aquella
bloquea también las rutas de API, y rompería la sincronización automática.

---

## Compartirlo con otra persona

Que forkee este repositorio y siga esta guía, o directamente
[INSTALAR-CON-CLAUDE.md](INSTALAR-CON-CLAUDE.md). Cada uno con su cuenta de
Vercel, su almacenamiento y sus claves. Nadie comparte nada con nadie.

**Nunca le pidas su usuario y contraseña de Garmin para ponerlos vos**, ni montes
esto en un servidor donde otros escriban sus credenciales. La app usa la API
privada de Garmin, que no tiene forma de conectar una cuenta ajena sin la
contraseña entera. La única manera sana es que cada quien la escriba en su
propia máquina.

---

## Créditos

Derivado de **[RafaTatay/garming-stats](https://github.com/RafaTatay/garming-stats)**,
de donde vienen la base del panel, el modelo de fitness CTL/ATL/TSB y el
pipeline de sincronización con Garmin. El mérito de los cimientos es de ahí.

**Sobre la licencia:** el repositorio original no publica ninguna, así que por
defecto se aplica "todos los derechos reservados". Si querés reutilizar esto más
allá de usarlo para vos, lo correcto es pedirle permiso a
[RafaTatay](https://github.com/RafaTatay) primero.
