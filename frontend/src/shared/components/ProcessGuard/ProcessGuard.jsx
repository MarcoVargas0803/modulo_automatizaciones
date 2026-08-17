import React from 'react';
import { Navigate } from 'react-router-dom';
import { Alert } from '@/shared/components/Alert/Alert';
import { useAuth } from '@/shared/context/useAuth';
import { getProcessAccess, hasProcessAccess } from '@/shared/utils/processAccess';
import './ProcessGuard.css';

/**
 * ProcessAccessDenied — El aviso de «Acceso restringido», suelto.
 *
 * `ProcessGuard` ya lo pinta cuando la sesión no trae el proceso. Este export
 * existe para el otro caso, el que el guard no puede ver: que el servidor
 * responda **403 en mitad de la sesión** porque a alguien le retiraron el acceso
 * mientras tenía la página abierta. Ahí la sesión del cliente sigue diciendo que
 * sí, y la página necesita pintar el mismo mensaje por su cuenta.
 *
 * Se exporta para que ese texto se escriba **una sola vez**. No lo uses para
 * hacer el gate: para eso está `ProcessGuard`.
 *
 * @param {string} moduleName  - Nombre del módulo tal como se lee en la frase ("pagos", "Compras Internacionales").
 * @param {string} [className] - Clase del contenedor, normalmente la de la página, para heredar su padding.
 *
 * @example
 * // La sesión decía que sí, pero la API respondió 403
 * if (accesoRevocado) {
 *   return <ProcessAccessDenied moduleName="revaluaciones" className="material-revaluations-page" />;
 * }
 */
export function ProcessAccessDenied({ moduleName, className = 'process-guard-message' }) {
  return (
    <div className={className}>
      <Alert variant="error" title="Acceso restringido">
        Tu usuario no tiene acceso al módulo de {moduleName}. Pídelo al administrador del portal.
      </Alert>
    </div>
  );
}

/**
 * ProcessGuard — Restringe una página al proceso que le corresponde.
 *
 * Envuelve el contenido y no lo monta hasta saber que el usuario tiene el
 * proceso en `audit_portal.user_process_access`. Mientras la sesión se valida
 * pinta un aviso de espera; si falta el acceso, el de «Acceso restringido».
 *
 * ── Por qué existe, y qué NO sustituye ───────────────────────────────────────
 * `ProtectedRoute` responde «¿hay alguien con sesión?», nunca «¿esta persona
 * puede ver este módulo?». Son dos comprobaciones distintas y hacen falta las
 * dos: un usuario de mantenimiento con sesión válida atraviesa `ProtectedRoute`
 * y llega a `/international-purchases` escribiendo la URL.
 *
 * Antes de este componente el gate estaba escrito **cuatro veces**: `PagosGuard`
 * y `DocsGuard` lo copiaban entero, `MaterialRevaluations` lo llevaba inline con
 * su propio `accessState`, y compras internacionales **no lo hacía en absoluto**.
 * `DocsGuard` además reimplementaba `hasProcessAccess` a mano.
 *
 * ── Es interfaz, no seguridad ────────────────────────────────────────────────
 * Esto decide qué se pinta, no a qué se puede llamar. La barrera real es
 * `requireProcess` en el servidor, y sigue ahí aunque este componente falle.
 * Su valor es no montar una página entera —con sus `fetch`, su SSE y sus
 * temporizadores— para descubrir el 403 después.
 *
 * ── No cubre la revocación en caliente ───────────────────────────────────────
 * Solo mira la sesión, así que si el acceso se retira **con la página abierta**
 * el guard no se entera: la sesión del cliente sigue diciendo que sí. Ese caso
 * lo resuelve la página al recibir el 403, con `ProcessAccessDenied`.
 *
 * @param {string} processCode  - Código del proceso, tal cual en la base (`payments`, `material_revaluation`, `international_purchases`, `admin`).
 * @param {string} moduleName   - Nombre legible del módulo; se inserta en las dos frases de aviso.
 * @param {string} [className]  - Clase del contenedor de los avisos. Pásale la clase de la página para que hereden su padding. (default: `process-guard-message`)
 * @param {React.ReactNode} children - La página. **No se monta** hasta que el acceso está confirmado.
 *
 * @example
 * // En la propia página, envolviendo lo que exporta
 * export function InternationalPurchases() {
 *   return (
 *     <ProcessGuard processCode="international_purchases" moduleName="Compras Internacionales">
 *       <InternationalPurchasesContent />
 *     </ProcessGuard>
 *   );
 * }
 *
 * @example
 * // Conservando el contenedor de la página para no cambiar el espaciado
 * <ProcessGuard processCode="payments" moduleName="pagos" className="workbench-page">
 *   {children}
 * </ProcessGuard>
 */
export function ProcessGuard({ processCode, moduleName, className = 'process-guard-message', children }) {
  const { isChecking, processes } = useAuth();

  if (isChecking) {
    return (
      <div className={className}>
        <Alert variant="info">Validando acceso al módulo de {moduleName}…</Alert>
      </div>
    );
  }

  if (!hasProcessAccess(processes, processCode)) {
    return <ProcessAccessDenied moduleName={moduleName} className={className} />;
  }

  // El auditor ve métricas, no la herramienta operativa: se le lleva a su vista
  // de auditoría del proceso en vez de montar la página del módulo.
  if (getProcessAccess(processes, processCode)?.role === 'auditor_maestro') {
    return <Navigate to={`/auditoria/${processCode}`} replace />;
  }

  return children;
}
