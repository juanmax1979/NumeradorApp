const { runQuery } = require("../config/db");

async function getStats(req, res, next) {
  try {
    const year = Number(req.query.year || new Date().getFullYear());
    const dependenciaId = Number(req.user?.dependenciaId);
    if (!Number.isInteger(dependenciaId) || dependenciaId <= 0) {
      return res.status(400).json({ message: "Dependencia inválida en sesión" });
    }

    const totalsRs = await runQuery(
      `SELECT tipo, COUNT(*) AS total
       FROM dbo.registros
       WHERE anio = @year AND expediente <> 'ANULADO' AND dependencia_id = @dependenciaId
       GROUP BY tipo`,
      { year, dependenciaId }
    );

    const monthlyRs = await runQuery(
      `SELECT
         MONTH(fecha) AS mes,
         tipo,
         COUNT(*) AS cantidad
       FROM dbo.registros
       WHERE anio = @year AND expediente <> 'ANULADO' AND dependencia_id = @dependenciaId
       GROUP BY MONTH(fecha), tipo`,
      { year, dependenciaId }
    );

    const rankingRs = await runQuery(
      `SELECT TOP (30) detalle, tipo, COUNT(*) AS cantidad
       FROM dbo.registros
       WHERE anio = @year AND expediente <> 'ANULADO' AND detalle <> '' AND dependencia_id = @dependenciaId
       GROUP BY detalle, tipo
       ORDER BY cantidad DESC`,
      { year, dependenciaId }
    );

    let logRs = { recordset: [] };
    if (Number(req.user?.rolId) === 1 || String(req.user?.rol || "").toLowerCase() === "admin") {
      logRs = await runQuery(
        `SELECT TOP (100)
           fecha,
           accion,
           registro_id,
           campo_modificado,
           valor_anterior,
           valor_nuevo,
           usuario
         FROM dbo.log_auditoria
         WHERE dependencia_id = @dependenciaId
         ORDER BY id DESC`
      ,
        { dependenciaId }
      );
    }

    return res.json({
      year,
      totals: totalsRs.recordset,
      monthly: monthlyRs.recordset,
      ranking: rankingRs.recordset,
      auditLog: logRs.recordset,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { getStats };
