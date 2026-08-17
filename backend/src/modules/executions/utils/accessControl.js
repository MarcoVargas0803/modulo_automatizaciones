// El JOIN a users desaparecio: v_user_process_access_effective ya exige usuario
// activo, can_view y --esto es nuevo aqui-- proceso activo. Antes esta pareja de
// helpers no comprobaba p.is_active, asi que desactivar un proceso lo ocultaba
// del menu pero sus ejecuciones seguian saliendo en los listados.
function accessControlJoins(alias = "v") {
  return `INNER JOIN audit_portal.v_user_process_access_effective upa
    ON upa.process_code = ${alias}.process_code`;
}

function accessControlConditions(userParam, { requireExport = false } = {}) {
  const conditions = [`upa.user_id = ${userParam}`];

  if (requireExport) {
    conditions.push("upa.can_export = TRUE");
  }

  return conditions.join("\n    AND ");
}

module.exports = {
  accessControlJoins,
  accessControlConditions,
};
