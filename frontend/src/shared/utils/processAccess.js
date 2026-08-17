/**
 * Acceso por proceso, leído de la sesión.
 *
 * El acceso se decide SIEMPRE por las filas de `audit_portal.user_process_access`
 * que devuelve la sesión, nunca comparando el nombre de usuario contra un
 * literal. Ese fue un bug real: bastaba renombrar un usuario, o dar de alta uno
 * nuevo con los mismos permisos, para que el módulo dejara de funcionar. El
 * backend lo corrigió con `requireProcess`; esto es su equivalente en el cliente.
 *
 * Recuerda que ocultar algo aquí es cuestión de interfaz, no de seguridad: quien
 * escriba la URL a mano choca igualmente contra el 403 del servidor.
 */

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Devuelve la fila de acceso del usuario a un proceso, o `null` si no lo tiene.
 * Útil cuando hace falta algo más que el sí/no: `role`, `can_export`…
 *
 * @param {Array<{process_code: string, role?: string, can_view?: boolean, can_export?: boolean}>} processes - `processes` de `useAuth()`
 * @param {string} processCode - Código del proceso (`maintenance`, `payments`…)
 * @returns {object|null}
 *
 * @example
 * const acceso = getProcessAccess(processes, 'maintenance');
 * const esJefe = acceso?.role === 'jefe';
 */
export function getProcessAccess(processes, processCode) {
  const target = normalize(processCode);

  return (processes || []).find(
    (process) => normalize(process?.process_code) === target,
  ) ?? null;
}

/**
 * `true` si el usuario tiene acceso al proceso.
 *
 * @param {Array} processes    - `processes` de `useAuth()`
 * @param {string} processCode - Código del proceso
 * @returns {boolean}
 *
 * @example
 * if (!hasProcessAccess(processes, 'material_revaluation')) return <AccesoDenegado />;
 */
export function hasProcessAccess(processes, processCode) {
  return getProcessAccess(processes, processCode) !== null;
}
