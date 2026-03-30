const { getPool, sql, runQuery } = require("../config/db");
const ExcelJS = require("exceljs");
const { logAudit } = require("../services/auditService");

const TIPOS = [
  "OFICIO",
  "AUTO",
  "SENTENCIA TRAMITE",
  "SENTENCIA RELATORIA",
];

function canModify(user, createdBy) {
  return user.rol === "admin" || user.nombre === createdBy;
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

async function getNextNumber(req, res, next) {
  try {
    const { tipo } = req.params;
    const dependenciaId = getDependenciaId(req);
    if (!TIPOS.includes(tipo)) {
      return res.status(400).json({ message: "Tipo inválido" });
    }
    const anio = new Date().getFullYear();
    const rs = await runQuery(
      `SELECT ISNULL(MAX(numero), 0) + 1 AS proximo
       FROM dbo.registros
       WHERE tipo = @tipo AND anio = @anio AND dependencia_id = @dependenciaId`,
      { tipo, anio, dependenciaId }
    );
    return res.json({ tipo, anio, proximo: rs.recordset[0].proximo });
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
        id, dependencia, tipo, numero, anio, expediente, detalle, usuario, fecha,
        ISNULL(remitido, 0) AS remitido, remitido_por, remitido_fecha
      FROM dbo.registros
      WHERE (expediente LIKE @term OR detalle LIKE @term OR usuario LIKE @term OR tipo LIKE @term)
        AND fecha BETWEEN @fromDate AND @toDate
        AND dependencia_id = @dependenciaId
    `;

    const bindings = { term, fromDate, toDate, dependenciaId };
    if (tipo && tipo !== "TODOS") {
      query += " AND tipo = @tipo";
      bindings.tipo = tipo;
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
        id, dependencia, tipo, numero, anio, expediente, detalle, usuario, fecha,
        ISNULL(remitido, 0) AS remitido
      FROM dbo.registros
      WHERE (expediente LIKE @term OR detalle LIKE @term OR usuario LIKE @term OR tipo LIKE @term)
        AND fecha BETWEEN @fromDate AND @toDate
        AND dependencia_id = @dependenciaId
    `;
    const bindings = { term, fromDate, toDate, dependenciaId };
    if (tipo && tipo !== "TODOS") {
      query += " AND tipo = @tipo";
      bindings.tipo = tipo;
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
    ];
    sheet.getRow(1).font = { bold: true };
    rs.recordset.forEach((row) =>
      sheet.addRow({
        ...row,
        remitido: row.remitido ? "SI" : "NO",
        fecha: row.fecha ? new Date(row.fecha).toISOString() : "",
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
    const { tipo, expediente, detalle = "" } = req.body;
    if (!TIPOS.includes(tipo)) {
      return res.status(400).json({ message: "Tipo inválido" });
    }
    if (!expediente || !expediente.trim()) {
      return res.status(400).json({ message: "Expediente es obligatorio" });
    }

    const anio = new Date().getFullYear();
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const request = new sql.Request(transaction);
    request.input("tipo", tipo);
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

      INSERT INTO dbo.registros (dependencia_id, dependencia, tipo, numero, anio, expediente, detalle, usuario, fecha)
      VALUES (@dependenciaId, @dependencia, @tipo, @nuevoNumero, @anio, @expediente, @detalle, @usuario, SYSUTCDATETIME());

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
      valorNuevo: `${tipo} N° ${created.numero}/${created.anio}`,
      usuario: req.user.nombre,
    });

    return res.status(201).json({
      id: Number(created.id),
      tipo,
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
      `SELECT id, tipo, numero, ISNULL(remitido, 0) AS remitido
       FROM dbo.registros WHERE id = @id AND dependencia_id = @dependenciaId`,
      { id, dependenciaId }
    );
    const row = rs.recordset[0];
    if (!row) return res.status(404).json({ message: "Registro no encontrado" });
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
    const rs = await runQuery(
      `SELECT id, usuario, expediente, tipo, numero
       FROM dbo.registros WHERE id = @id AND dependencia_id = @dependenciaId`,
      { id, dependenciaId }
    );
    const row = rs.recordset[0];
    if (!row) return res.status(404).json({ message: "Registro no encontrado" });
    if (!canModify(req.user, row.usuario)) {
      return res.status(403).json({ message: "Solo podés anular tus registros" });
    }

    await runQuery(
      `UPDATE dbo.registros
       SET expediente = 'ANULADO',
           detalle = @detalle
       WHERE id = @id`,
      {
        id,
        detalle: `Anulado por ${req.user.nombre}`,
      }
    );
    await logAudit({
      registroId: id,
      dependenciaId,
      dependencia: req.user.dependencia || "GENERAL",
      accion: "ANULACION",
      campo: "expediente",
      valorAnterior: row.expediente,
      valorNuevo: "ANULADO",
      usuario: req.user.nombre,
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
