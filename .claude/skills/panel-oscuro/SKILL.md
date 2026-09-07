---
name: panel-oscuro
description: Sistema de diseño para paneles de datos oscuros — vidrio translúcido estilo Apple, números grandes en monoespaciada estilo Oura, acento naranja estilo Strava, gráficos legibles y textos en segunda persona. Usala cuando alguien pida un dashboard, un panel de métricas, una app de salud o deporte, una pantalla de estadísticas, o cuando diga que su interfaz "se ve fea", "no se entiende", "muy plana" o "quiero que se vea moderna". También cuando haya que elegir colores para series de datos, tipografía para números, o escribir los textos de una pantalla de datos.
---

# Panel oscuro

Un sistema para pantallas donde lo importante son los números. Sale de rediseñar un panel de entrenamiento que era ilegible: las etiquetas estaban en 3,4:1 de contraste, los números competían con sus rótulos, y cada gráfico usaba una paleta distinta.

No copies los valores sin entender por qué están ahí. Casi todos son la respuesta a un problema concreto, y esa respuesta es lo que se traslada a otro proyecto — no el hexadecimal.

## Cómo se ve, en una frase

Fondo oscuro con un degradado de color muy tenue detrás, tarjetas de vidrio esmerilado que flotan encima, números enormes en monoespaciada con su etiqueta chiquita al lado, un solo naranja para todo lo que se toca, y colores de datos que nunca se confunden con la interfaz.

## Los colores

Tres familias que **no se mezclan nunca**. Si un color de estado aparece como serie de datos, el lector deja de saber si el rojo significa "esta categoría" o "esto está mal".

```css
@theme {
  /* Superficies: del fondo hacia arriba */
  --color-surface-base:  #101826;  /* el fondo de todo */
  --color-surface-card:  #172033;  /* las tarjetas */
  --color-surface-sunk:  #131c2e;  /* paneles hundidos dentro de una tarjeta */
  --color-surface-line:  #28334a;  /* bordes y grillas */
  --color-surface-hover: #1e2942;

  /* Tinta: contraste medido sobre la tarjeta */
  --color-ink-primary:   #f1f5f9;  /* 14,7:1 */
  --color-ink-secondary: #cbd5e1;  /* 10,9:1 */
  --color-ink-muted:     #94a3b8;  /*  6,3:1 — el piso para texto */
  --color-ink-faint:     #64748b;  /* sólo decorativo, nunca texto que importe */

  /* Acento: SÓLO interfaz — navegación, enlaces, acciones. Jamás una serie. */
  --color-accent:        #fc5200;
  --color-accent-soft:   #ff7a3d;

  /* Estado: reservados. Nunca se reutilizan como color de categoría. */
  --color-state-good:     #34d399;
  --color-state-warning:  #fbbf24;
  --color-state-critical: #f87171;
}
```

**El piso de contraste es 4,5:1** y no es negociable para nada que se lea. El problema original de este panel era exactamente ese: las etiquetas estaban en `slate-500` a 3,4:1 y se veían "elegantes" en la maqueta y borrosas en la pantalla.

Para **colores de series** (categorías de datos) no inventes a ojo: armá el set y corré el validador del skill `dataviz`, que chequea banda de luminosidad, separación para daltonismo y contraste contra la superficie. En este panel, dos rosas que parecían distintos estaban a ΔE 3,2 — indistinguibles.

## El fondo

Un degradado radial muy tenue detrás de todo, fijo al viewport. Le da profundidad al vidrio: sin algo de color abajo, un panel translúcido se ve gris y sucio en vez de translúcido.

```css
body {
  background:
    radial-gradient(820px 600px at 96% -2%,  color-mix(in oklab, var(--color-accent) 40%, transparent), transparent 55%),
    radial-gradient(900px 820px at 52% 112%, color-mix(in oklab, #199e70 34%, transparent), transparent 58%),
    var(--color-surface-base);
  background-attachment: fixed;
}
```

## El vidrio

```css
.glass {
  position: relative;
  background: color-mix(in oklab, var(--color-surface-card) 66%, transparent);
  backdrop-filter: blur(30px) saturate(180%);
  border: 1px solid color-mix(in oklab, white 11%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in oklab, white 16%, transparent),  /* borde superior iluminado */
    0 2px 8px -2px rgb(0 0 0 / 0.35),                            /* sombra corta que despega */
    0 22px 56px -22px rgb(0 0 0 / 0.70);                         /* sombra difusa, distancia */
}
```

Tres cosas que se aprenden rompiéndolas:

**El tinte es pesado a propósito.** Un panel más transparente se ve mejor en una captura aislada y arrastra el contraste del texto por debajo del piso apenas hay algo de color detrás. El fondo no tiene que ser legible a través de la tarjeta.

**No apiles `backdrop-filter`.** Un panel hundido dentro de una tarjeta de vidrio usa color y borde, sin segundo desenfoque. Dos capas de desenfoque es la forma más rápida de que el scroll se trabe.

**Los diálogos van a `document.body` con un portal.** Cualquier ancestro con `transform` o `backdrop-filter` se convierte en el bloque contenedor de sus descendientes `position: fixed`, y ahí `inset: 0` deja de significar "la ventana". Un modal abierto desde adentro de una barra lateral de vidrio sale aplastado en 216 píxeles. Esto pasa siempre y cuesta media hora encontrarlo.

## La tipografía

La jerarquía se hace con **dos movimientos**: el número es mucho más grande y apretado que todo lo que lo rodea, y su etiqueta mucho más chica y callada. Un número de 28px sobre una etiqueta de 13px se lee como un párrafo; uno de 44px sobre una de 11px se lee como una medición.

```css
.metric-xl, .metric-lg, .metric {
  font-family: 'Geist Mono', ui-monospace, monospace;
  font-variant-numeric: tabular-nums;   /* los dígitos no bailan al actualizarse */
  line-height: 1;
}
.metric-xl { font-size: 44px; font-weight: 600; letter-spacing: -0.035em; }
.metric-lg { font-size: 32px; font-weight: 600; letter-spacing: -0.03em; }
.metric    { font-size: 24px; font-weight: 600; letter-spacing: -0.025em; }

/* La unidad viaja con el número pero nunca compite */
.metric-unit {
  font-family: 'Geist', system-ui, sans-serif;
  font-size: 0.42em; font-weight: 450;
  color: var(--color-ink-muted); margin-left: 0.3em;
}

.label { font-size: 13px; font-weight: 450; color: var(--color-ink-muted); }
.title-page { font-size: 28px; font-weight: 600; letter-spacing: -0.03em; }
.title-card { font-size: 15px; font-weight: 550; letter-spacing: -0.015em; }
```

**Las etiquetas van en minúscula, sin tracking.** Mayúsculas con espaciado entre letras es la convención de panel deportivo de hace diez años; hoy la jerarquía la llevan el peso y el color. `Distancia`, no `DISTANCIA`.

**Los números en monoespaciada con `tabular-nums`.** En un panel que se actualiza, sin esto los dígitos cambian de ancho y la fila entera tiembla.

Si cargás fuentes de Google, hacelo con `<link>` en el HTML. Un `@import url()` remoto dentro del CSS no sobrevive al empaquetado de Vite y todo cae al tipo del sistema en silencio.

## El movimiento

Duraciones cortas, entrada escalonada, y una salida para quien no quiere animaciones.

```css
.rise-in    { animation: rise-in 260ms cubic-bezier(0.22, 1, 0.36, 1) backwards; }
.page-in > * { animation: rise-in 340ms cubic-bezier(0.22, 1, 0.36, 1) backwards; }
/* + delays escalonados de 50ms por hijo */

@media (prefers-reduced-motion: reduce) {
  .rise-in, .page-in > * { animation: none; }
  /* Las librerías de gráficos animan por su cuenta y no miran esta preferencia: */
  .recharts-wrapper * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

**Usá `backwards`, no `both`.** Todos los fotogramas finales vuelven a `transform: none`, así que con `both` cada sección queda transformada para siempre — y un ancestro transformado rompe los `position: fixed` de adentro (ver la trampa del vidrio, es la misma).

## Los gráficos

Leé el skill `dataviz` para la parte de color y forma. Lo específico de este sistema:

**Una serie manda, el resto es contexto.** Si dibujás el dato diario y su media móvil con el mismo tono y grosor parecido, se leen como una sola línea enredada. El diario va como relleno tenue (opacidad 0,18), la media móvil como única línea de 2,5px.

**Línea horizontal con la media** en cada gráfico donde tenga sentido, punteada y en gris, con su valor rotulado. Convierte "está subiendo" en "está por encima de tu media de 48".

**No fuerces el cero** cuando el rango real no lo incluye. Una frecuencia cardíaca en reposo entre 35 y 60 ppm dibujada desde cero es una línea plana que esconde justo lo que se viene a mirar. `domain={['dataMin - 3', 'dataMax + 3']}`.

**Tooltip siempre.** Un gráfico en pantalla es interactivo; si no se puede pasar el mouse y ver el valor exacto, la mitad del gráfico no está.

## Los textos

Es la mitad del diseño y suele ser lo último que se piensa.

**Segunda persona, no tercera.** "Llevás 3 días sin entrenar", no "El usuario no registra actividad hace 3 días".

**Cada afirmación con su número.** "Tu FC en reposo bajó de 46 a 44 ppm" en vez de "tu recuperación mejoró". Si no podés citar un número, probablemente no tengas el hallazgo.

**Decí la dirección cuando no es obvia.** "Menos pulsaciones en reposo es mejor" al lado del dato, porque la mitad de la gente lee "bajó" como "empeoró".

**Declará lo que el dispositivo no mide** en vez de esconderlo. Una métrica ausente con la nota "tu reloj no registra esto" es información; una métrica ausente sin explicación parece un error.

**Las recomendaciones se cuantifican.** "Subí a 3 sesiones por semana", no "aumentá la frecuencia". Si no se puede cuantificar, no va.

## Comparaciones justas

Un panel compara períodos todo el tiempo, y ahí se cuela el error más caro: **comparar un tramo incompleto contra uno completo**. Un lunes al mediodía, medir un día contra los siete de la semana anterior da "vas 100% peor" — verdad aritmética y mentira deportiva.

Compará siempre contra **el mismo tramo transcurrido** del período anterior, y guardá el período completo sólo como referencia de dónde terminó.

## Antes de dar algo por terminado

- Contraste de todo lo que se lee: 4,5:1 mínimo, medido y no estimado.
- La paleta de series pasada por el validador, no elegida a ojo.
- `prefers-reduced-motion` cubierto, incluida la librería de gráficos.
- Los diálogos montados en `<body>`.
- Abrilo y mirálo. El validador chequea color, no si las etiquetas del eje se pisan.
