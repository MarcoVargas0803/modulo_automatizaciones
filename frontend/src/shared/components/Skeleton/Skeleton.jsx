import React from 'react';
import ReactSkeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

/**
 * Placeholders de carga, construidos sobre `react-loading-skeleton`.
 *
 * ── El principio, y por qué cambió ───────────────────────────────────────────
 * Este módulo tuvo siete exports, cuatro de ellos con forma (`TableSkeleton`,
 * `CardSkeleton`, `FormSkeleton`, `PageSkeleton`). Cada uno **redibujaba a mano,
 * en estilos en línea, el CSS del componente que imitaba**, así que había que
 * tocarlos cada vez que cambiaba el original — y ya habían divergido: el
 * skeleton de tabla usaba `overflow: hidden` donde `.data-table-container` tiene
 * `overflow-x: auto`, no llevaba su `fade-in`, y maquetaba las columnas como
 * `repeat(N, 1fr)` mientras la `<table>` real las dimensiona por contenido (de
 * ahí el salto de columnas al terminar la carga).
 *
 * La regla ahora es la que documenta la propia librería: **el estado de carga
 * vive dentro del componente real**, que pinta su markup de siempre con un
 * `<Skeleton />` en el hueco del dato. Los estilos los pone su hoja CSS, así que
 * no hay nada que mantener sincronizado. Quien lo aplica hoy:
 *
 * - `DataTable` con `isLoading` → tabla real con un `Skeleton` por celda.
 * - `DataCard` con `isLoading` → tarjeta real con `Skeleton` en título y cifra.
 *
 * Antes de escribir un placeholder a mano, comprobar si el componente que va a
 * ocupar ese hueco ya acepta `isLoading`.
 *
 * ── Los tres exports ─────────────────────────────────────────────────────────
 * | Export             | Para qué                                             |
 * |--------------------|------------------------------------------------------|
 * | `SkeletonProvider` | Tema de color de todos los skeletons. Va en `App.jsx` |
 * | `Skeleton`         | La pieza. Un bloque, o N líneas apiladas con `count`  |
 * | `SkeletonRepeat`   | N bloques **hermanos**, para rejillas con `gap` propio |
 *
 * ── `count` o `SkeletonRepeat`: cómo elegir ──────────────────────────────────
 * No son intercambiables y la diferencia importa:
 *
 * - **`<Skeleton count={3} />`** produce **un solo** elemento
 *   (`span.react-loading-skeleton-container`) con tres barras y `<br>` dentro.
 *   Es lo correcto para líneas apiladas dentro de un bloque normal (un párrafo,
 *   el cuerpo de una tarjeta). Acepta decimales: `count={2.5}` pinta dos líneas
 *   y media, que es como se simula un párrafo sin última línea completa.
 * - **`<SkeletonRepeat count={3} />`** produce **tres elementos hermanos**. Es lo
 *   único que sirve dentro de un CSS grid o un flex: con `count` la rejilla
 *   recibiría un único ítem en vez de tres.
 *
 * ── No tiene hoja de estilos, a propósito ────────────────────────────────────
 * Aquí solo se carga el CSS de `react-loading-skeleton`. Ya no queda maquetación
 * propia que estilar: la forma la pone siempre el componente anfitrión.
 *
 * ── Trampa ───────────────────────────────────────────────────────────────────
 * **Dependen del provider.** Fuera de `SkeletonProvider` los skeletons se ven,
 * pero con los colores por defecto de la librería, no con los de la marca.
 *
 * @module Skeleton
 */

/**
 * SkeletonProvider — Tema de color de todos los skeletons.
 *
 * Los colores se leen de los tokens CSS `--skeleton-base` y `--skeleton-shine`,
 * así que se adaptan solos al tema claro/oscuro. **Ya está montado en `App.jsx`
 * sobre toda la aplicación: no hace falta repetirlo** en una página ni en un
 * modal.
 *
 * @param {React.ReactNode} children - Árbol que hereda el tema.
 *
 * @example
 * // Montaje único, en la raíz (ya hecho)
 * <SkeletonProvider>
 *   <App />
 * </SkeletonProvider>
 */
export function SkeletonProvider({ children }) {
  return (
    <SkeletonTheme baseColor="var(--skeleton-base)" highlightColor="var(--skeleton-shine)">
      {children}
    </SkeletonTheme>
  );
}

/**
 * Skeleton — La pieza de carga. Un bloque, o N líneas apiladas con `count`.
 *
 * Es un pass-through de `react-loading-skeleton`: **acepta todas sus props**, no
 * un subconjunto. Lo único que añade es que el radio por defecto sale del token
 * `--radius-sm` en vez del literal `0.25rem` de la librería.
 *
 * ── Lo adaptativo es la gracia: no des medidas que puedas heredar ────────────
 * Sin `height`, el bloque toma el `font-size` del contenedor; sin `width`, ocupa
 * el 100 %. Por eso dentro de un `<td class="data-table-td">` basta con
 * `<Skeleton />`: sale con la altura del texto que va a sustituir. Pasar medidas
 * a mano es lo que hay que evitar salvo que no haya nada que heredar.
 *
 * @param {number|string}  [width]        - Ancho. Número = px, cadena = valor CSS ('60%'). Por defecto 100%.
 * @param {number|string}  [height]       - Alto. Sin él hereda el `font-size` del contenedor.
 * @param {number|string}  borderRadius   - Radio de las esquinas. (default: 'var(--radius-sm)')
 * @param {number}         [count]        - Líneas apiladas dentro de **un solo** contenedor. Admite decimales. (default: 1)
 * @param {boolean}        [circle]       - Radio al 50 %, para avatares.
 * @param {boolean}        [inline]       - Sin `<br>` entre líneas, para skeletons en mitad de un texto.
 * @param {string}         [className]    - Clases extra de cada barra.
 * @param {string}         [containerClassName] - Clases del `<span>` contenedor. Es el remedio documentado cuando el skeleton sale con ancho 0 dentro de un flex.
 * @param {boolean}        [enableAnimation] - A `false` queda un bloque de color sólido.
 * @param {React.CSSProperties} [style]   - Escotilla de escape; preferir las props anteriores.
 *
 * @example
 * // Lo habitual: heredar del contenedor
 * <Skeleton />
 *
 * @example
 * // Un párrafo de dos líneas y media
 * <Skeleton count={2.5} />
 *
 * @example
 * // Dentro de un flex, si sale con ancho 0
 * <Skeleton containerClassName="flex-1" />
 */
export function Skeleton({ borderRadius = 'var(--radius-sm)', ...rest }) {
  return <ReactSkeleton borderRadius={borderRadius} {...rest} />;
}

/**
 * SkeletonRepeat — N bloques **hermanos**, sin contenedor propio.
 *
 * Existe por una limitación concreta de la librería: su prop `count` mete las N
 * barras dentro de un único `<span>`, así que en un CSS grid ocupa **una** celda
 * en vez de N. `SkeletonRepeat` devuelve N elementos sueltos, que es lo que
 * necesita una rejilla de tarjetas o una lista.
 *
 * **No pone contenedor ni separación.** La rejilla y el `gap` los pone quien lo
 * usa, igual que haría con los elementos reales; envolverlo rompería esa
 * rejilla. Todas las props que no sean `count` se pasan tal cual a `Skeleton`.
 *
 * ── Accesibilidad: no se le pueden añadir atributos ARIA ────────────────────
 * `react-loading-skeleton` construye su `<span>` contenedor con un juego fijo de
 * atributos (`className`, `data-testid`, `aria-live="polite"`, `aria-busy`) y
 * **no reenvía props desconocidas al DOM**: las interpreta como opciones de
 * estilo. Así que pasarle `aria-hidden` aquí no haría nada — el `CardSkeleton`
 * que esto sustituye sí podía porque tenía un `<div>` propio donde ponerlo.
 *
 * En la práctica cada bloque queda como una región viva `polite` cuyo contenido
 * nunca cambia, así que no llega a anunciarse. **Si hace falta ocultar el grupo
 * o anunciar la carga, hacerlo en el contenedor de la página**, que es de quien
 * es la rejilla:
 *
 *     <div className="dashboard-grid" role="status" aria-label="Cargando KPIs">
 *
 * @param {number} count - Número de bloques. (default: 1)
 * @param {...*}   props - Cualquier prop de `Skeleton`, aplicada a todos.
 *
 * @example
 * // La rejilla y su gap los pone la página
 * <div className="dashboard-grid">
 *   {isLoading
 *     ? <SkeletonRepeat count={4} height={132} borderRadius="var(--radius-lg)" />
 *     : kpis.map((k) => <TarjetaKpi key={k.id} {...k} />)}
 * </div>
 */
export function SkeletonRepeat({ count = 1, ...props }) {
  return Array.from({ length: count }).map((_, index) => (
    <Skeleton key={index} {...props} />
  ));
}
