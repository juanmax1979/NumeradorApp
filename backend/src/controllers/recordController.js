const { getPool, sql, runQuery } = require("../config/db");
const { getAnnulMaxHoursAfterCreate } = require("../config/appLimits");
const ExcelJS = require("exceljs");
const { logAudit } = require("../services/auditService");

const TIPOS_FALLBACK = [
  { id: null, codigo: "OFICIO", nombre: "Oficios" },
  { id: null, codigo: "AUTO", nombre: "Autos" },
  { id: null, codigo: "SENT_TRAMITE", nombre: "Sentencia Trámite" },
  { id: null, codigo: "SENT_RELATORIA", nombre: "Sentencia Relatoria" },
  { id: null, codigo: "RECAUDO", nombre: "Recaudos" },
];

const MOTIVOS_ANULACION = [
  "Decreto no firmado",
  "Rechazado por incongruencias",
  "Otro",
];

function canModify(user, createdBy) {
  return Number(user?.rolId) === 1 || String(user?.rol || "").toLowerCase() === "admin" || user.nombre === createdBy;
}

function getDependenciaId(req) {
  const dependenciaId = Number(req.user?.dependenciaId);
  if (!Number.isInteger(dependenciaId) || dependenciaId <= 0) {
    const error = new Error("Dependencia de usuario inválida");
    error.status = 400;
    throw error;
  }
  return dependenciaId;
}

async function getTiposRecaudoActivos() {
  try {
    const rs = await runQuery(
      `SELECT id, codigo, nombre
       FROM dbo.tipos_recaudo
       WHERE activo = 1
       ORDER BY orden, nombre`
    );
    if (Array.isArray(rs.recordset) && rs.recordset.length > 0) {
      return rs.recordset;
    }
  } catch (_) {
    // Compatibilidad: si aún no existe la tabla nueva, continuar con fallback.
  }
  return TIPOS_FALLBACK;
}

async function resolveTipoRecaudo({ tipo, tipoRecaudoId }) {
  const tipos = await getTiposRecaudoActivos();
  const normalizedTipo = String(tipo || "").trim();
  const normalizedTipoUpper = normalizedTipo.toUpperCase();
  const normalizedTipoNoAccent = normalizedTipoUpper
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (Number.isInteger(Number(tipoRecaudoId)) && Number(tipoRecaudoId) > 0) {
    const byId = tipos.find((t) => Number(t.id) === Number(tipoRecaudoId));
    if (!byId) return null;
    return { id: byId.id, tipoTexto: String(byId.codigo || byId.nombre || "").toUpperCase() };
  }

  if (!normalizedTipo) return null;
  const byCodeOrName = tipos.find((t) => {
    const code = String(t.codigo || "").trim().toUpperCase();
    const name = String(t.nombre || "").trim().toUpperCase();
    const nameNoAccent = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return (
      code === normalizedTipoUpper ||
      name === normalizedTipoUpper ||
      nameNoAccent === normalizedTipoNoAccent
    );
  });
  if (!byCodeOrName) return null;
  return {
    id: byCodeOrName.id ?? null,
    tipoTexto: String(byCodeOrName.codigo || byCodeOrName.nombre || "").toUpperCase(),
  };
}

async function getNextNumber(req, res, next) {
  try {
    const { tipo } = req.params;
    const dependenciaId = getDependenciaId(req);
    const resolved = await resolveTipoRecaudo({ tipo });
    if (!resolved) {
      return res.status(400).json({ message: "Tipo inválido" });
    }
    const anio = new Date().getFullYear();
    const rs = await runQuery(
      `SELECT ISNULL(MAX(numero), 0) + 1 AS proximo
       FROM dbo.registros
       WHERE tipo = @tipo AND anio = @anio AND dependencia_id = @dependenciaId`,
      { tipo: resolved.tipoTexto, anio, dependenciaId }
    );
    return res.json({ tipo: resolved.tipoTexto, anio, proximo: rs.recordset[0].proximo });
  } catch (error) {
    return next(error);
  }
}

async function listRecords(req, res, next) {
  try {
    const dependenciaId = getDependenciaId(req);
    const {
      tipo,
      q = "",
      from,
      to,
      limit = 200,
    } = req.query;

    const cappedLimit = Math.min(Number(limit) || 200, 500);
    const term = `%${q}%`;
    const fromDate = from || "2000-01-01 00:00:00";
    const toDate = to || "2099-12-31 23:59:59";

    let query = `
      SELECT TOP (${cappedLimit})
        r.id, r.dependencia, r.tipo, r.tipo_recaudo_id AS tipoRecaudoId, r.numero, r.anio, r.expediente, r.detalle, r.usuario, r.fecha,
        ISNULL(remitido, 0) AS remitido, remitido_por, remitido_fecha,
        ISNULL(anulado_por, '') AS anulado_por,
        ISNULL(anulacion_motivo, '') AS anulacion_motivo,
        ISNULL(anulacion_observacion, '') AS anulacion_observacion,
        anulacion_fecha
      FROM dbo.registros r
      WHERE (r.expediente LIKE @term OR r.detalle LIKE @term OR r.usuario LIKE @term OR r.tipo LIKE @term)
        AND r.fecha BETWEEN @fromDate AND @toDate
        AND r.dependencia_id = @dependenciaId
    `;

    const bindings = { term, fromDate, toDate, dependenciaId };
    if (tipo && tipo !== "TODOS") {
      const resolved = await resolveTipoRecaudo({ tipo });
      if (!resolved) {
        return res.status(400).json({ message: "Tipo inválido" });
      }
      query += " AND tipo = @tipo";
      bindings.tipo = resolved.tipoTexto;
    }

    query += " ORDER BY anio DESC, numero DESC";
    const rs = await runQuery(query, bindings);
    return res.json(rs.recordset);
  } catch (error) {
    return next(error);
  }
}

async function exportRecordsExcel(req, res, next) {
  try {
    const dependenciaId = getDependenciaId(req);
    const {
      tipo,
      q = "",
      from,
      to,
      limit = 500,
    } = req.query;

    const term = `%${q}%`;
    const fromDate = from || "2000-01-01 00:00:00";
    const toDate = to || "2099-12-31 23:59:59";
    const cappedLimit = Math.min(Number(limit) || 500, 2000);

    let query = `
      SELECT TOP (${cappedLimit})
        r.id, r.dependencia, r.tipo, r.tipo_recaudo_id AS tipoRecaudoId, r.numero, r.anio, r.expediente, r.detalle, r.usuario, r.fecha,
        ISNULL(remitido, 0) AS remitido,
        ISNULL(anulado_por, '') AS anulado_por,
        ISNULL(anulacion_motivo, '') AS anulacion_motivo,
        ISNULL(anulacion_observacion, '') AS anulacion_observacion,
        anulacion_fecha
      FROM dbo.registros r
      WHERE (r.expediente LIKE @term OR r.detalle LIKE @term OR r.usuario LIKE @term OR r.tipo LIKE @term)
        AND r.fecha BETWEEN @fromDate AND @toDate
        AND r.dependencia_id = @dependenciaId
    `;
    const bindings = { term, fromDate, toDate, dependenciaId };
    if (tipo && tipo !== "TODOS") {
      const resolved = await resolveTipoRecaudo({ tipo });
      if (!resolved) {
        return res.status(400).json({ message: "Tipo inválido" });
      }
      query += " AND tipo = @tipo";
      bindings.tipo = resolved.tipoTexto;
    }
    query += " ORDER BY anio DESC, numero DESC";
    const rs = await runQuery(query, bindings);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Registros");
    sheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "Dependencia", key: "dependencia", width: 34 },
      { header: "Tipo", key: "tipo", width: 24 },
      { header: "Numero", key: "numero", width: 12 },
      { header: "Anio", key: "anio", width: 10 },
      { header: "Expediente", key: "expediente", width: 24 },
      { header: "Detalle", key: "detalle", width: 60 },
      { header: "Remitido", key: "remitido", width: 12 },
      { header: "Usuario", key: "usuario", width: 24 },
      { header: "Fecha", key: "fecha", width: 24 },
      { header: "Anulado por", key: "anulado_por", width: 22 },
      { header: "Motivo anulación", key: "anulacion_motivo", width: 28 },
      { header: "Obs. anulación", key: "anulacion_observacion", width: 36 },
      { header: "Fecha anulación", key: "anulacion_fecha", width: 22 },
    ];
    sheet.getRow(1).font = { bold: true };
    rs.recordset.forEach((row) =>
      sheet.addRow({
        ...row,
        remitido: row.remitido ? "SI" : "NO",
        fecha: row.fecha ? new Date(row.fecha).toISOString() : "",
        anulacion_fecha: row.anulacion_fecha ? new Date(row.anulacion_fecha).toISOString() : "",
      })
    );

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `registros_${timestamp}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) {
    return next(error);
  }
}

async function createRecord(req, res, next) {
  const transaction = new sql.Transaction(await getPool());
  try {
    const dependenciaId = getDependenciaId(req);
    const { tipo, tipoRecaudoId, expediente, detalle = "" } = req.body;
    const resolved = await resolveTipoRecaudo({ tipo, tipoRecaudoId });
    if (!resolved) {
      return res.status(400).json({ message: "Tipo inválido" });
    }
    if (!expediente || !expediente.trim()) {
      return res.status(400).json({ message: "Expediente es obligatorio" });
    }

    const anio = new Date().getFullYear();
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const request = new sql.Request(transaction);
    request.input("tipo", resolved.tipoTexto);
    request.input("tipoRecaudoId", resolved.id);
    request.input("anio", anio);
    request.input("dependenciaId", dependenciaId);
    request.input("dependencia", req.user.dependencia || "GENERAL");
    request.input("expediente", expediente.trim());
    request.input("detalle", detalle.trim());
    request.input("usuario", req.user.nombre);

    const rs = await request.query(`
      DECLARE @nuevoNumero INT;
      SELECT @nuevoNumero = ISNULL(MAX(numero), 0) + 1
      FROM dbo.registros WITH (UPDLOCK, HOLDLOCK)
      WHERE tipo = @tipo AND anio = @anio AND dependencia_id = @dependenciaId;

      INSERT INTO dbo.registros (dependencia_id, dependencia, tipo, tipo_recaudo_id, numero, anio, expediente, detalle, usuario, fecha)
      VALUES (@dependenciaId, @dependencia, @tipo, @tipoRecaudoId, @nuevoNumero, @anio, @expediente, @detalle, @usuario, SYSUTCDATETIME());

      SELECT SCOPE_IDENTITY() AS id, @nuevoNumero AS numero, @anio AS anio;
    `);

    const created = rs.recordset[0];
    await transaction.commit();

    await logAudit({
      registroId: Number(created.id),
      dependenciaId,
      dependencia: req.user.dependencia || "GENERAL",
      accion: "CREACION",
      campo: "-",
      valorAnterior: "-",
      valorNuevo: `${resolved.tipoTexto} N° ${created.numero}/${created.anio}`,
      usuario: req.user.nombre,
    });

    return res.status(201).json({
      id: Number(created.id),
      tipo: resolved.tipoTexto,
      tipoRecaudoId: resolved.id,
      dependencia: req.user.dependencia || "GENERAL",
      numero: created.numero,
      anio: created.anio,
      expediente: expediente.trim(),
      detalle: detalle.trim(),
      usuario: req.user.nombre,
    });
  } catch (error) {
    if (transaction._aborted !== true) {
      try {
        await transaction.rollback();
      } catch (ignored) {}
    }
    return next(error);
  }
}

async function updateRecord(req, res, next) {
  try {
    const dependenciaId = getDependenciaId(req);
    const id = Number(req.params.id);
    const { expediente, detalle } = req.body;

    const rs = await runQuery(
      `SELECT id, expediente, detalle, usuario
       FROM dbo.registros
       WHERE id = @id AND dependencia_id = @dependenciaId`,
      { id, dependenciaId }
    );
    const row = rs.recordset[0];
    if (!row) return res.status(404).json({ message: "Registro no encontrado" });
    if (row.expediente === "ANULADO") {
      return res.status(400).json({ message: "No se puede modificar un registro anulado" });
    }
    if (!canModify(req.user, row.usuario)) {
      return res.status(403).json({ message: "Solo podés modificar tus registros" });
    }

    const nuevoExpte = (expediente || row.expediente).trim();
    const nuevoDetalle = (detalle || row.detalle).trim();
    if (!nuevoExpte) return res.status(400).json({ message: "Expediente no puede quedar vacío" });

    await runQuery(
      `UPDATE dbo.registros SET expediente = @expediente, detalle = @detalle WHERE id = @id`,
      { id, expediente: nuevoExpte, detalle: nuevoDetalle }
    );

    if (nuevoExpte !== row.expediente) {
      await logAudit({
        registroId: id,
        dependenciaId,
        dependencia: req.user.dependencia || "GENERAL",
        accion: "MODIFICACION",
        campo: "expediente",
        valorAnterior: row.expediente,
        valorNuevo: nuevoExpte,
        usuario: req.user.nombre,
      });
    }
    if (nuevoDetalle !== row.detalle) {
      await logAudit({
        registroId: id,
        dependenciaId,
        dependencia: req.user.dependencia || "GENERAL",
        accion: "MODIFICACION",
        campo: "detalle",
        valorAnterior: row.detalle,
        valorNuevo: nuevoDetalle,
        usuario: req.user.nombre,
      });
    }

    return res.json({ message: "Registro modificado" });
  } catch (error) {
    return next(error);
  }
}

async function toggleRemitido(req, res, next) {
  try {
    const dependenciaId = getDependenciaId(req);
    const id = Number(req.params.id);
    const rs = await runQuery(
      `SELECT id, tipo, numero, expediente, ISNULL(remitido, 0) AS remitido
       FROM dbo.registros WHERE id = @id AND dependencia_id = @dependenciaId`,
      { id, dependenciaId }
    );
    const row = rs.recordset[0];
    if (!row) return res.status(404).json({ message: "Registro no encontrado" });
    if (row.expediente === "ANULADO") {
      return res.status(400).json({ message: "No se puede cambiar remitido en un registro anulado" });
    }
    if (row.tipo !== "OFICIO") {
      return res.status(400).json({ message: "La función remitido solo aplica a OFICIO" });
    }

    if (row.remitido) {
      await runQuery(
        `UPDATE dbo.registros
         SET remitido = 0, remitido_por = '', remitido_fecha = NULL
         WHERE id = @id`,
        { id }
      );
      await logAudit({
        registroId: id,
        dependenciaId,
        dependencia: req.user.dependencia || "GENERAL",
        accion: "DESMARCAR_REMITIDO",
        campo: "remitido",
        valorAnterior: "REMITIDO",
        valorNuevo: "NO REMITIDO",
        usuario: req.user.nombre,
      });
      return res.json({ message: "Remitido desmarcado" });
    }

    await runQuery(
      `UPDATE dbo.registros
       SET remitido = 1, remitido_por = @usuario, remitido_fecha = SYSUTCDATETIME()
       WHERE id = @id`,
      { id, usuario: req.user.nombre }
    );
    await logAudit({
      registroId: id,
      dependenciaId,
      dependencia: req.user.dependencia || "GENERAL",
      accion: "MARCAR_REMITIDO",
      campo: "remitido",
      valorAnterior: "NO REMITIDO",
      valorNuevo: `REMITIDO por ${req.user.nombre}`,
      usuario: req.user.nombre,
    });
    return res.json({ message: "Remitido marcado" });
  } catch (error) {
    return next(error);
  }
}

async function annulRecord(req, res, next) {
  try {
    const dependenciaId = getDependenciaId(req);
    const id = Number(req.params.id);
    const motivo = String(req.body?.motivo || "").trim();
    const observacion = String(req.body?.observacion || "").trim();

    if (!MOTIVOS_ANULACION.includes(motivo)) {
      return res.status(400).json({
        message: `Motivo inválido. Opciones: ${MOTIVOS_ANULACION.join(", ")}`,
      });
    }
    if (observacion.length > 400) {
      return res.status(400).json({ message: "La observación admite como máximo 400 caracteres" });
    }

    const maxHours = getAnnulMaxHoursAfterCreate();
    const maxMinutes = Math.min(Math.round(maxHours * 60), 2147483647);

    const rs = await runQuery(
      `SELECT id, usuario, expediente, tipo, numero, fecha,
        DATEDIFF(MINUTE, fecha, SYSUTCDATETIME()) AS edad_minutos
       FROM dbo.registros WHERE id = @id AND dependencia_id = @dependenciaId`,
      { id, dependenciaId }
    );
    const row = rs.recordset[0];
    if (!row) return res.status(404).json({ message: "Registro no encontrado" });
    if (row.expediente === "ANULADO") {
      return res.status(400).json({ message: "El registro ya está anulado" });
    }
    if (!canModify(req.user, row.usuario)) {
      return res.status(403).json({ message: "Solo podés anular tus registros" });
    }

    const edadMinutos = Number(row.edad_minutos);
    if (Number.isFinite(edadMinutos) && edadMinutos > maxMinutes) {
      return res.status(400).json({
        message: `Solo se puede anular dentro de las ${maxHours} horas posteriores a la creación del recaudo.`,
      });
    }

    const anuladoPor = req.user.nombre;

    await runQuery(
      `UPDATE dbo.registros
       SET expediente = 'ANULADO',
           anulado_por = @anuladoPor,
           anulacion_motivo = @motivo,
           anulacion_observacion = @observacion,
           anulacion_fecha = SYSUTCDATETIME()
       WHERE id = @id`,
      {
        id,
        anuladoPor,
        motivo,
        observacion,
      }
    );
    await logAudit({
      registroId: id,
      dependenciaId,
      dependencia: req.user.dependencia || "GENERAL",
      accion: "ANULACION",
      campo: "expediente",
      valorAnterior: row.expediente,
      valorNuevo: `ANULADO | ${motivo}${observacion ? ` | ${observacion}` : ""} | por ${anuladoPor}`,
      usuario: anuladoPor,
    });
    return res.json({ message: `${row.tipo} N° ${row.numero} anulado` });
  } catch (error) {
    return next(error);
  }
}

async function deleteRecord(req, res, next) {
  try {
    const dependenciaId = getDependenciaId(req);
    const id = Number(req.params.id);
    const rs = await runQuery(
      `SELECT id, numero, tipo, expediente, detalle
       FROM dbo.registros WHERE id = @id AND dependencia_id = @dependenciaId`,
      { id, dependenciaId }
    );
    const row = rs.recordset[0];
    if (!row) return res.status(404).json({ message: "Registro no encontrado" });

    await logAudit({
      registroId: id,
      dependenciaId,
      dependencia: req.user.dependencia || "GENERAL",
      accion: "BORRADO",
      campo: "registro_completo",
      valorAnterior: `${row.tipo} N°${row.numero} | ${row.expediente} | ${row.detalle}`,
      valorNuevo: "ELIMINADO",
      usuario: req.user.nombre,
    });
    await runQuery("DELETE FROM dbo.registros WHERE id = @id AND dependencia_id = @dependenciaId", {
      id,
      dependenciaId,
    });
    return res.json({ message: "Registro borrado" });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getNextNumber,
  listRecords,
  exportRecordsExcel,
  createRecord,
  updateRecord,
  toggleRemitido,
  annulRecord,
  deleteRecord,
};
