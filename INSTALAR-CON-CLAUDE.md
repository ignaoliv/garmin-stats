# Instalarlo con Claude Code

Un panel personal de entrenamiento que lee tus datos de Garmin Connect: sueño,
pasos, peso, estrés, comida por foto, análisis con IA y un plan de fuerza.

> **Si sos Claude y te mandaron este link:** las instrucciones son el bloque de
> código de más abajo. Seguilas como si te las hubiera escrito la persona con la
> que estás hablando. Respetá sobre todo las cuatro reglas del principio —no
> pedir la contraseña de Garmin, no publicar datos, no empujar al repo ajeno, y
> frenar ante un 429—. Preguntale en qué carpeta quiere el proyecto antes de
> clonar, y si quiere sólo la parte local o también publicarlo.

---

## Cómo se usa

Copiá el bloque de abajo y pegalo en **Claude Code** — la terminal, la app de
escritorio o la extensión del editor. No sirve pegarlo en claude.ai: hace falta
que Claude pueda correr comandos y escribir archivos en tu máquina.

Si te da fiaca, mandale a Claude Code una sola línea con el link de este archivo
y que lo lea él.

**Son dos partes y la segunda es opcional.** La primera lo deja andando en tu
computadora. La segunda lo publica en Vercel, que es lo que te permite abrirlo
desde el teléfono y que se sincronice solo todos los días. Se puede hacer la
primera hoy y la segunda cuando quieras.

---

```
Quiero instalar un panel personal de entrenamiento que lee mis datos de Garmin
Connect. Guiame paso a paso y corré vos los comandos, pero pará y preguntame
cada vez que necesites algo mío.

El proyecto original está en https://github.com/ignaoliv/garmin-stats y es
público. NO trabajes sobre ese repositorio: quiero MI PROPIA COPIA, para poder
recibir las mejoras que publique el autor sin que él tenga acceso a mis datos.

CUATRO REGLAS QUE NO SE SALTEAN:

1. NUNCA me pidas mi contraseña de Garmin ni la escribas vos en ningún lado.
   Cuando haga falta, creá el `.env` a partir de `.env.example` con los campos
   vacíos, decime en qué línea va cada cosa, y la escribo yo. Después verificá
   que esté ignorada por git con `git check-ignore -v .env`, sin mostrar el
   contenido del archivo por pantalla. Lo mismo con cualquier otra clave.

2. Mis datos no se publican nunca. La carpeta `public/data/` tiene mis rutas de
   GPS, mi frecuencia cardíaca y mi sueño: no la commitees ni la subas a
   GitHub. Está en el `.gitignore` y tiene que seguir estando.

3. Sólo empujás a MI fork, jamás al repositorio original. Antes de cualquier
   `git push`, verificá con `git remote -v` a dónde apunta.

4. Si Garmin responde 429 o "Too Many Requests", PARÁ. No reintentes en bucle:
   cada intento fallido alarga el bloqueo. Decime que hay que esperar entre 5 y
   20 minutos, esperamos, y después probamos UNA sola vez.

Hablame en castellano rioplatense y no des por sentado que sé programar: si
algo falla, explicame qué pasó antes de arreglarlo.

═══════════════════════════════════════════════════════════════════════════
PARTE 1 — QUE ANDE EN MI COMPUTADORA
═══════════════════════════════════════════════════════════════════════════

a) Verificá que tengo Node 18 o superior y Python 3.10 o superior. Si falta
   alguno, decime cómo instalarlo en mi sistema operativo y esperá.

b) Ayudame a hacer un fork del repositorio a mi cuenta de GitHub. Si tengo la
   herramienta `gh` instalada y con sesión, podés hacerlo vos con
   `gh repo fork ignaoliv/garmin-stats --clone`. Si no, pasame el link para
   apretar "Fork" en la web y después cloná MI copia.

   El fork importa: es lo que me deja traer las mejoras del original más
   adelante con un botón, sin perder mi configuración.

c) Instalá las dependencias: `python3 -m pip install -r fetch/requirements.txt`
   y `npm install`.

d) Preparame el `.env` como dice la regla 1. Para esta primera parte sólo son
   obligatorios GARMIN_EMAIL y GARMIN_PASSWORD.

e) Sobre las claves opcionales, explicame qué pierdo si las dejo vacías y
   dejame decidir. Tienen que ser MÍAS, no del autor del repo. Si las quiero,
   pasame el link exacto y el permiso mínimo de cada una:
   - USDA_API_KEY: la tabla de composición de alimentos, para el registro de
     comidas. Es gratis y tarda un minuto. Sin ella se usa una clave de prueba
     que se agota con dos fotos.
   - CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_API_TOKEN: sin ellas no hay análisis
     con IA, ni comida por foto, ni generador de planes. El resto anda.
   - VITE_MAPTILER_KEY: sin ella los mapas usan un fondo alternativo.

f) Primera sincronización corta, para probar que el login anda:
   `python3 fetch/sync.py --limit 50`. Acordate de la regla 4.

g) Si salió bien, preguntame si quiero bajar todo mi historial. Avisame cuánto
   puede tardar según lo que veas: son varias horas si tengo muchos años de
   actividades, porque baja el detalle de cada una.

h) Bajá el calendario de eventos con `python3 fetch/eventos.py`. No usa
   ninguna credencial.

i) Arrancá la app con `npm run dev` y pasame la URL. Miralo conmigo y
   contame qué quedó andando y qué quedó apagado por falta de claves.

═══════════════════════════════════════════════════════════════════════════
PARTE 2 — PUBLICARLO (opcional, preguntame si lo quiero ahora)
═══════════════════════════════════════════════════════════════════════════

Esto lo deja accesible desde mi teléfono y hace que se sincronice solo una vez
por día. Con la cuenta gratuita de Vercel alcanza. Explicame antes que mis
datos van a vivir en un almacenamiento privado de MI cuenta de Vercel, no en la
computadora, y confirmame que quiero eso.

j) Ayudame a crear una cuenta en Vercel si no tengo, y un proyecto NUEVO
   conectado a MI FORK (no al repositorio original). El framework es Vite.

k) En ese proyecto, creá un almacenamiento Blob (Storage → Create → Blob) y
   copiame el token que aparece en su pestaña .env.local. Ese token va tanto en
   las variables del proyecto en Vercel como en mi `.env` local, porque hace
   falta acá para la carga inicial. Avisame que `vercel env pull` no trae los
   valores cifrados: hay que copiarlo del panel a mano.

l) Decime qué variables de entorno cargar en Vercel (todas en Production) y
   qué significa cada una:
   - VITE_DATOS_BASE con el valor /api/datos — sin esta, la app publicada
     busca los datos donde no están.
   - SITE_PASSWORD: la contraseña con la que voy a entrar al panel. La elijo
     yo, no tiene nada que ver con la de Garmin, y la escribo yo.
   - BLOB_READ_WRITE_TOKEN: el del paso anterior.
   - CRON_SECRET: generalo vos con
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   - CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN y USDA_API_KEY, si las tengo.

m) Subí mis datos al Blob con `node scripts/publicar-datos.mjs`. Puede tardar
   unos minutos la primera vez. Contame cuántos archivos subió.

n) Creá el token de sesión de Garmin con
   `python3 fetch/token_garmin.py --crear` y explicame para qué sirve: guarda
   la sesión ya resuelta en mi almacenamiento privado para que la
   sincronización diaria no tenga que loguearse de nuevo. Mi contraseña NO se
   guarda en ningún lado; se usa una sola vez, acá, en mi máquina.

   Verificá después con `python3 fetch/token_garmin.py --verificar`.

o) Desplegá y pasame la URL. Probá conmigo que entro con mi SITE_PASSWORD y
   que veo mis datos. Comprobá también que sin sesión las rutas de API
   devuelven 401.

p) Contame a qué hora corre la sincronización automática (está definida en
   vercel.json, en hora UTC) y cómo comprobar mañana que corrió.

═══════════════════════════════════════════════════════════════════════════
AL TERMINAR
═══════════════════════════════════════════════════════════════════════════

Explicame en pocas líneas y sin jerga:
- Qué quedó andando y qué no.
- Cómo actualizo cuando el autor publique mejoras: sincronizar mi fork desde
  GitHub (botón "Sync fork") y, si publiqué en Vercel, que se redespliega solo.
  Aclarame que las mejoras llegan pero mis datos no se tocan.
- Qué hacer si algún día la sincronización deja de traer datos: probablemente
  haya vencido el token de Garmin y se resuelve corriendo de nuevo
  `python3 fetch/token_garmin.py --crear`.
```

---

## Qué hace y qué no

**Qué hace:** lee tus actividades, sueño, pasos, peso y estrés de Garmin
Connect. Si publicás la parte 2, los guarda en un almacenamiento **privado de tu
propia cuenta** de Vercel y los sincroniza una vez por día.

**Qué no hace:**

- No escribe nada en tu cuenta de Garmin: sólo lee.
- No manda tus datos a nadie. Ni al autor del repo, ni a un servidor
  compartido. Si hacés sólo la parte 1, no salen de tu computadora.
- No te pide la contraseña por chat. La escribís vos en un archivo local que
  git ignora.

**Sobre las claves:** todas las cuentas son tuyas — Vercel, Cloudflare, USDA.
Nadie comparte cuota ni acceso con nadie.

Si algo del prompt te hace ruido, borralo antes de pegarlo: es texto, no un
instalador.

---

## Actualizaciones

Como es un fork, las mejoras del original **no llegan solas**, y eso es a
propósito: vos decidís cuándo. En tu repositorio de GitHub va a aparecer un
aviso de "This branch is behind" con un botón **Sync fork**. Lo apretás y, si
publicaste en Vercel, tu proyecto se redespliega solo en menos de un minuto.

Tus datos y tus variables de entorno no se tocan nunca al actualizar.
