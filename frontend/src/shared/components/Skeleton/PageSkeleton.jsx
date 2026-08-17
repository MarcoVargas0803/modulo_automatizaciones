import React from 'react';
import { Skeleton } from '@/shared/components/Skeleton/Skeleton';
import { PageHeader } from '@/shared/components/PageHeader/PageHeader';

/**
 * PageSkeleton — Silueta de una pantalla mientras se descarga su código.
 *
 * Su único consumidor es el `Suspense` de `App.jsx`, que la muestra mientras
 * llega el chunk de una ruta perezosa. Es el caso —el único— en el que no hay
 * componente real al que pasarle `isLoading`, porque su código todavía no está
 * en el navegador.
 *
 * ── Qué dibuja, y por qué tan poco ───────────────────────────────────────────
 * Una cabecera y un bloque neutro. Nada más, a propósito: cuando este fallback
 * se pinta **no se sabe qué ruta va a montarse**, así que cualquier forma
 * concreta es una promesa que se incumple en la mayoría de pantallas.
 *
 * Llegó a dibujar una tabla, y mentía en dos tercios de las rutas: `/dashboard`
 * pinta tarjetas, `/logs/:id` pares clave/valor, `/mantenimiento` una rejilla.
 * Lo que sí es universal es la cabecera —`PageHeader` está en todas las páginas
 * de ruta—, mientras que `FilterBar` solo aparece en 6, así que una tarjeta de
 * filtros habría sido el mismo error más pequeño.
 *
 * El bloque de abajo existe únicamente para **reservar altura**: sin él la
 * página entera aparecería de golpe al resolver el chunk, que es el salto que
 * este componente vino a evitar (ver el comentario de `App.jsx`). Va en `vh` y
 * no en píxeles para no introducir otra medida a mano.
 *
 * ── La cabecera es el `PageHeader` de verdad ─────────────────────────────────
 * No una copia. Los `<Skeleton>` van dentro de sus props, así que heredan el
 * `font-size` y el `line-height` de `.page-header-title` y
 * `.page-header-subtitle`: no hay ni una medida duplicada que pueda desfasarse.
 * Es el mismo principio que aplican `DataTable` y `DataCard` con su `isLoading`.
 *
 * Usar solo las clases `.page-header*` sin importar el componente **no
 * funcionaría**: `PageHeader.css` lo importa `PageHeader.jsx`, que vive en los
 * chunks perezosos — justo los que aún no han llegado cuando esto se pinta.
 * Importar el componente garantiza que su hoja viaje en el bundle principal.
 *
 * ── Por qué está en su propio archivo ────────────────────────────────────────
 * `Skeleton.jsx` guarda los primitivos; esto es una composición de página. La
 * separación no responde a ninguna restricción técnica: hubo un ciclo de
 * imports cuando componía un `DataTable`, pero ese import ya no existe.
 *
 * ── Accesibilidad ────────────────────────────────────────────────────────────
 * El `<h1>` de `PageHeader` queda con contenido decorativo durante unos cientos
 * de milisegundos. Lo que anuncia la espera es el `role="status"` con
 * `aria-label` del contenedor, no el encabezado.
 *
 * @example
 * // En App.jsx, envuelta en .fade-in-delayed para que no aparezca si el chunk
 * // ya estaba en caché
 * <Suspense fallback={<div className="fade-in-delayed"><PageSkeleton /></div>}>
 */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Cargando página" aria-busy="true">
      {/* Sin `height`: cada bloque hereda el tamaño de texto de su hueco real. */}
      <PageHeader
        title={<Skeleton width={220} />}
        subtitle={<Skeleton width={320} />}
        actions={<Skeleton width={140} height={40} />}
      />

      {/* Solo reserva altura. No insinúa tabla, tarjetas ni filtros.
          `.page-header` ya trae su propio margin-bottom, así que no hace falta
          separación extra. */}
      <Skeleton height="50vh" borderRadius="var(--radius-md)" />
    </div>
  );
}
