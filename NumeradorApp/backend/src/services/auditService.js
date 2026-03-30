const { runQuery } = require("../config/db");

async function logAudit({
  registroId = null,
  dependenciaId,
  dependencia = "GENERAL",
  accion,
  campo = "-",
  valorAnterior = "-",
  valorNuevo = "-",
  usuario,
}) {
  await runQuery(
    `INSERT INTO dbo.log_auditoria
     (registro_id, dependencia_id, dependencia, accion, campo_modificado, valor_anterior, valor_nuevo, usuario, fecha)
     VALUES (@registroId, @dependenciaId, @dependencia, @accion, @campo, @valorAnterior, @valorNuevo, @usuario, SYSUTCDATETIME())`,
    {
      registroId,
      dependenciaId,
      dependencia,
      accion,
      campo,
      valorAnterior,
      valorNuevo,
      usuario,
    }
  );
}

module.exports = { logAudit };
