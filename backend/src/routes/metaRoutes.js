const express = require("express");
const categorias = require("../data/categorias.json");
const { authRequired, requireRole } = require("../middleware/auth");
const { runQuery } = require("../config/db");
const { getAnnulMaxHoursAfterCreate } = require("../config/appLimits");

const router = express.Router();

function toFrontendTipoKey(tipoCodigo, tipoNombre) {
  const code = String(tipoCodigo || "").trim().toUpperCase();
  if (code === "SENT_TRAMITE") return "SENTENCIA TRAMITE";
  if (code === "SENT_RELATORIA") return "SENTENCIA RELATORIA";
  if (code) return code;

  const normalizedName = String(tipoNombre || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (normalizedName === "SENTENCIA TRAMITE") return "SENTENCIA TRAMITE";
  if (normalizedName === "SENTENCIA RELATORIA") return "SENTENCIA RELATORIA";
  return normalizedName;
}

router.get("/health", (req, res) => {
  res.json({ ok: true, service: "numerador-backend" });
});

router.get("/categorias", authRequired, async (req, res, next) => {
  try {
    const rs = await runQuery(
      `SELECT
         tr.codigo AS tipoCodigo,
         tr.nombre AS tipoNombre,
         c.nombre AS categoriaNombre,
         o.nombre AS opcionNombre,
         c.orden AS categoriaOrden,
         o.orden AS opcionOrden
       FROM dbo.tipos_recaudo tr
       INNER JOIN dbo.tipos_recaudo_categoria c
         ON c.tipo_recaudo_id = tr.id AND c.activo = 1
       INNER JOIN dbo.tipos_recaudo_opcion o
         ON o.tipo_recaudo_categoria_id = c.id AND o.activo = 1
       WHERE tr.activo = 1
       ORDER BY tr.orden, tr.nombre, c.orden, c.nombre, o.orden, o.nombre`
    );

    if (!Array.isArray(rs.recordset) || rs.recordset.length === 0) {
      return res.json(categorias);
    }

    const output = {};
    for (const row of rs.recordset) {
      const tipo = toFrontendTipoKey(row.tipoCodigo, row.tipoNombre);
      const categoria = String(row.categoriaNombre || "").trim();
      const opcion = String(row.opcionNombre || "").trim();
      if (!tipo || !categoria || !opcion) continue;

      if (!output[tipo]) output[tipo] = {};
      if (!output[tipo][categoria]) output[tipo][categoria] = [];
      output[tipo][categoria].push(opcion);
    }

    return res.json(output);
  } catch (error) {
    // Compatibilidad: si no están creadas aún las tablas nuevas, continuar con JSON estático.
    if (error?.message && String(error.message).toLowerCase().includes("invalid object name")) {
      return res.json(categorias);
    }
    return next(error);
  }
});

router.get("/limits", authRequired, (req, res) => {
  res.json({
    annulMaxHoursAfterCreate: getAnnulMaxHoursAfterCreate(),
  });
});

router.get("/dependencias", authRequired, async (req, res, next) => {
  try {
    const rs = await runQuery(
      `SELECT id, nombre, activa,
              fuero,
              sistema_origen AS sistemaOrigen,
              cod_dep_sigi AS codDepSigi,
              COALESCE(NULLIF(LTRIM(RTRIM(cod_dep_externo)), ''), cod_dep_sigi) AS codDepExterno
       FROM dbo.dependencias
       WHERE activa = 1
       ORDER BY nombre`
    );
    res.json(rs.recordset);
  } catch (error) {
    next(error);
  }
});

router.get("/tipos-recaudo", authRequired, async (req, res, next) => {
  try {
    const rs = await runQuery(
      `SELECT id, codigo, nombre, activo, orden
       FROM dbo.tipos_recaudo
       WHERE activo = 1
       ORDER BY orden, nombre`
    );
    res.json(rs.recordset);
  } catch (error) {
    next(error);
  }
});

router.get("/recaudos-catalogo", authRequired, async (req, res, next) => {
  try {
    const rs = await runQuery(
      `SELECT
         tr.id AS tipoRecaudoId,
         tr.codigo AS tipoCodigo,
         tr.nombre AS tipoNombre,
         c.id AS categoriaId,
         c.nombre AS categoriaNombre,
         o.id AS opcionId,
         o.nombre AS opcionNombre
       FROM dbo.tipos_recaudo tr
       LEFT JOIN dbo.tipos_recaudo_categoria c
         ON c.tipo_recaudo_id = tr.id AND c.activo = 1
       LEFT JOIN dbo.tipos_recaudo_opcion o
         ON o.tipo_recaudo_categoria_id = c.id AND o.activo = 1
       WHERE tr.activo = 1
       ORDER BY tr.orden, tr.nombre, c.orden, c.nombre, o.orden, o.nombre`
    );

    const tiposById = new Map();
    for (const row of rs.recordset) {
      const tipoId = Number(row.tipoRecaudoId);
      if (!tiposById.has(tipoId)) {
        tiposById.set(tipoId, {
          id: tipoId,
          codigo: row.tipoCodigo,
          nombre: row.tipoNombre,
          categorias: [],
          _catById: new Map(),
        });
      }
      const tipo = tiposById.get(tipoId);
      if (row.categoriaId == null) continue;
      const catId = Number(row.categoriaId);
      if (!tipo._catById.has(catId)) {
        const cat = { id: catId, nombre: row.categoriaNombre, opciones: [] };
        tipo.categorias.push(cat);
        tipo._catById.set(catId, cat);
      }
      if (row.opcionId == null) continue;
      const cat = tipo._catById.get(catId);
      cat.opciones.push({ id: Number(row.opcionId), nombre: row.opcionNombre });
    }

    const tipos = [...tiposById.values()].map((t) => {
      delete t._catById;
      return t;
    });
    return res.json({ tipos });
  } catch (error) {
    return next(error);
  }
});

router.post("/recaudos-catalogo/categorias", authRequired, requireRole("admin"), async (req, res, next) => {
  try {
    const tipoRecaudoId = Number(req.body?.tipoRecaudoId);
    const nombre = String(req.body?.nombre || "").trim();
    if (!Number.isInteger(tipoRecaudoId) || tipoRecaudoId <= 0) {
      return res.status(400).json({ message: "tipoRecaudoId inválido" });
    }
    if (!nombre) return res.status(400).json({ message: "nombre es obligatorio" });

    const rs = await runQuery(
      `INSERT INTO dbo.tipos_recaudo_categoria (tipo_recaudo_id, nombre, activo, orden)
       VALUES (@tipoRecaudoId, @nombre, 1,
         ISNULL((SELECT MAX(orden) + 10 FROM dbo.tipos_recaudo_categoria WHERE tipo_recaudo_id = @tipoRecaudoId), 10)
       );
       SELECT SCOPE_IDENTITY() AS id;`,
      { tipoRecaudoId, nombre }
    );
    return res.status(201).json({ id: Number(rs.recordset[0].id), nombre, tipoRecaudoId });
  } catch (error) {
    return next(error);
  }
});

router.put("/recaudos-catalogo/categorias/:id", authRequired, requireRole("admin"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const nombre = String(req.body?.nombre || "").trim();
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "id inválido" });
    if (!nombre) return res.status(400).json({ message: "nombre es obligatorio" });
    await runQuery(
      `UPDATE dbo.tipos_recaudo_categoria
       SET nombre = @nombre, updated_at = SYSUTCDATETIME()
       WHERE id = @id`,
      { id, nombre }
    );
    return res.json({ message: "Categoría actualizada" });
  } catch (error) {
    return next(error);
  }
});

router.post("/recaudos-catalogo/opciones", authRequired, requireRole("admin"), async (req, res, next) => {
  try {
    const categoriaId = Number(req.body?.categoriaId);
    const nombre = String(req.body?.nombre || "").trim();
    if (!Number.isInteger(categoriaId) || categoriaId <= 0) {
      return res.status(400).json({ message: "categoriaId inválido" });
    }
    if (!nombre) return res.status(400).json({ message: "nombre es obligatorio" });

    const rs = await runQuery(
      `INSERT INTO dbo.tipos_recaudo_opcion (tipo_recaudo_categoria_id, nombre, activo, orden)
       VALUES (@categoriaId, @nombre, 1,
         ISNULL((SELECT MAX(orden) + 10 FROM dbo.tipos_recaudo_opcion WHERE tipo_recaudo_categoria_id = @categoriaId), 10)
       );
       SELECT SCOPE_IDENTITY() AS id;`,
      { categoriaId, nombre }
    );
    return res.status(201).json({ id: Number(rs.recordset[0].id), nombre, categoriaId });
  } catch (error) {
    return next(error);
  }
});

router.put("/recaudos-catalogo/opciones/:id", authRequired, requireRole("admin"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const nombre = String(req.body?.nombre || "").trim();
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "id inválido" });
    if (!nombre) return res.status(400).json({ message: "nombre es obligatorio" });
    await runQuery(
      `UPDATE dbo.tipos_recaudo_opcion
       SET nombre = @nombre, updated_at = SYSUTCDATETIME()
       WHERE id = @id`,
      { id, nombre }
    );
    return res.json({ message: "Opción actualizada" });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
