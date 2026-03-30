const { runQuery } = require("../config/db");

async function logAudit({
  registroId = null,
  dependencia = "GENERAL",
  accion,
  campo = "-",
  valorAnterior = "-",
  valorNuevo = "-",
  usuario,
}) {
  await runQuery(
    `INSERT INTO dbo.log_auditoria
     (registro_id, dependencia, accion, campo_modificado, valor_anterior, valor_nuevo, usuario, fecha)
     VALUES (@registroId, @dependencia, @accion, @campo, @valorAnterior, @valorNuevo, @usuario, SYSUTCDATETIME())`,
    {
      registroId,
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
