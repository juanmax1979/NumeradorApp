const { sql, executeSigiProcedure } = require("../config/sigiDb");
const { runQuery } = require("../config/db");

const PROC_USUARIO = "procNumeradorDatosUsuarioSIGI_DepsCircNomyApe";
const PROC_EXPEDIENTE = "procNumeradorDatosExpteCaratProcDepRadic";

function unwrapResult(procedureName, input, result) {
  return {
    procedure: procedureName,
    input,
    rowsAffected: result.rowsAffected || [],
    recordset: result.recordset || [],
    recordsets: result.recordsets || [],
    output: result.output || {},
    returnValue: result.returnValue,
  };
}

function usuarioDniParamName() {
  return (
    String(process.env.SIGI_SP_USUARIO_DNI_PARAM || "dniUsuarioSigi").trim() ||
    "dniUsuarioSigi"
  );
}

function sqlParamsUsuarioSigi(dniInt) {
  const name = usuarioDniParamName();
  return { [name]: { type: sql.Int, value: dniInt } };
}

const COD_DEP_CANDIDATES = [
  "COD_DEP",
  "CODDEP",
  "COD_DEP_RAD",
  "CODDEP_RAD",
  "COD_DEP_RADIC",
  "CODDEP_RADIC",
  "COD_DEP_PROC",
  "COD_DEP_EXPDTE",
  "COD_DEPENDENCIA",
  "CODDEPENDENCIA",
  "DEP_COD",
  "DEP_CODIGO",
  "CODIGO_DEPENDENCIA",
  "ID_DEPENDENCIA",
  "ID_DEP",
  "IDDEP",
  "ORG_COD_DEP",
];

/**
 * SP usuario: solo lista explícita (evita tomar COD_CIRC u otros por heurística).
 * SP expediente: lista + heurística sobre nombres de columna (SIGI a veces no usa COD_DEP).
 */
function getCodDepFromRow(row, mode = "usuario") {
  if (!row || typeof row !== "object") return null;
  const upperMap = {};
  for (const k of Object.keys(row)) {
    upperMap[String(k).toUpperCase()] = row[k];
  }
  for (const c of COD_DEP_CANDIDATES) {
    const v = upperMap[c];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  if (mode !== "expediente") return null;

  for (const k of Object.keys(row)) {
    const ku = String(k).toUpperCase();
    if (
      ku.includes("DESCRIP") ||
      ku.includes("OBSERV") ||
      ku.includes("CARATULA") ||
      ku.includes("TEXTO")
    ) {
      continue;
    }
    const fromCodDep =
      (ku.includes("COD") && ku.includes("DEP")) ||
      ku === "DEP_COD" ||
      /^COD_DEP/i.test(k) ||
      /^DEP_COD/i.test(k);
    if (!fromCodDep) continue;
    const v = row[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (!s || s.length > 64) continue;
    return s;
  }
  return null;
}

/** Alinear "03500" con "3500" que suele venir distinto entre SPs / tipos. */
function expandCodDepVariants(token) {
  const s = String(token ?? "").trim();
  if (!s) return [];
  const out = new Set([s]);
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    if (!Number.isNaN(n)) out.add(String(n));
  }
  return [...out];
}

function addCodDepTokens(set, raw) {
  if (raw == null || String(raw).trim() === "") return;
  const s = String(raw).trim();
  for (const part of s.split(/[,;]+/)) {
    const p = part.trim();
    if (!p) continue;
    for (const v of expandCodDepVariants(p)) set.add(v);
  }
}

function collectCodDepsFromUsuarioSigiResult(result) {
  const rows = [];
  if (Array.isArray(result.recordsets) && result.recordsets.length) {
    for (const rs of result.recordsets) {
      if (Array.isArray(rs)) rows.push(...rs);
    }
  } else if (Array.isArray(result.recordset)) {
    rows.push(...result.recordset);
  }
  const set = new Set();
  for (const row of rows) {
    const v = getCodDepFromRow(row, "usuario");
    if (v) addCodDepTokens(set, v);
  }
  return set;
}

/**
 * IDs en dbo.dependencias cuyo cod_dep_sigi coincide con algún COD_DEP devuelto por el SP usuario SIGI.
 */
async function getAllowedDependenciaIdsForDni(dniInt) {
  const result = await executeSigiProcedure(PROC_USUARIO, sqlParamsUsuarioSigi(dniInt));
  const allowed = collectCodDepsFromUsuarioSigiResult(result);
  if (allowed.size === 0) return [];

  const rs = await runQuery(
    `SELECT id, cod_dep_sigi AS cod
     FROM dbo.dependencias
     WHERE activa = 1 AND cod_dep_sigi IS NOT NULL AND LTRIM(RTRIM(cod_dep_sigi)) <> ''`
  );

  const ids = [];
  for (const row of rs.recordset) {
    const raw = row.cod;
    if (raw == null || String(raw).trim() === "") continue;
    for (const part of String(raw).split(/[,;]+/)) {
      const p = part.trim();
      if (!p) continue;
      let hit = false;
      for (const v of expandCodDepVariants(p)) {
        if (allowed.has(v)) {
          hit = true;
          break;
        }
      }
      if (hit) {
        ids.push(Number(row.id));
        break;
      }
    }
  }
  return [...new Set(ids)].sort((a, b) => a - b);
}

/** Códigos SIGI (COD_DEP) asociados a la dependencia del Numerador en dbo.dependencias. */
async function mergeCodDepsFromNumeradorDependencia(allowed, dependenciaId) {
  const id = Number(dependenciaId);
  if (!Number.isInteger(id) || id <= 0) return;
  const rs = await runQuery(
    `SELECT cod_dep_sigi AS c
     FROM dbo.dependencias
     WHERE id = @id AND activa = 1`,
    { id }
  );
  const raw = rs.recordset[0]?.c;
  addCodDepTokens(allowed, raw);
}

function rowMatchesAllowedCodDep(row, allowed) {
  const cod = getCodDepFromRow(row, "expediente");
  if (cod == null) return false;
  return expandCodDepVariants(cod).some((v) => allowed.has(v));
}

function flattenSigiRecordsets(result) {
  const rows = [];
  if (Array.isArray(result.recordsets) && result.recordsets.length) {
    for (const rs of result.recordsets) {
      if (Array.isArray(rs)) rows.push(...rs);
    }
  } else if (Array.isArray(result.recordset)) {
    rows.push(...result.recordset);
  }
  return rows;
}

function filterExpedienteResultByCodDep(result, allowed) {
  const filterRows = (rows) => {
    if (!Array.isArray(rows)) return rows;
    return rows.filter((row) => rowMatchesAllowedCodDep(row, allowed));
  };
  const recordsets = Array.isArray(result.recordsets)
    ? result.recordsets.map(filterRows)
    : result.recordsets;
  const recordset =
    recordsets && recordsets.length && Array.isArray(recordsets[0])
      ? recordsets[0]
      : filterRows(result.recordset || []);
  return { ...result, recordset, recordsets };
}

async function resolveDniIntForRequest(req) {
  let raw = req.user?.dni;
  if (raw == null || raw === "") {
    const nombre = req.user?.nombre;
    if (!nombre) return null;
    const rs = await runQuery(
      `SELECT TOP (1) dni FROM dbo.usuarios
       WHERE nombre = @nombre OR usuario = @nombre`,
      { nombre }
    );
    raw = rs.recordset[0]?.dni;
  }
  const str =
    typeof raw === "number" && Number.isInteger(raw)
      ? String(raw)
      : String(raw ?? "").trim();
  if (!/^\d{7,8}$/.test(str)) return null;
  const dniInt = parseInt(str, 10);
  if (!Number.isInteger(dniInt) || dniInt < 0 || dniInt > 2147483647) {
    return null;
  }
  return dniInt;
}

async function runSigiUsuarioPorDni(req, res, next) {
  try {
    const raw = req.body?.dni ?? req.body?.dniUsuarioSigi;
    const dniStr =
      typeof raw === "number" && Number.isInteger(raw)
        ? String(raw)
        : String(raw ?? "").trim();
    if (!/^\d{7,8}$/.test(dniStr)) {
      return res.status(400).json({
        message:
          "dni inválido. Debe contener 7 u 8 dígitos (o número entero equivalente). Enviá `dni` o `dniUsuarioSigi`.",
      });
    }

    const dniInt = parseInt(dniStr, 10);
    if (!Number.isInteger(dniInt) || dniInt < 0 || dniInt > 2147483647) {
      return res.status(400).json({ message: "dni fuera del rango permitido" });
    }

    const dniParamName =
      String(process.env.SIGI_SP_USUARIO_DNI_PARAM || "dniUsuarioSigi").trim() ||
      "dniUsuarioSigi";

    const sqlParams = {
      [dniParamName]: { type: sql.Int, value: dniInt },
    };
    const result = await executeSigiProcedure(PROC_USUARIO, sqlParams);
    return res.json(
      unwrapResult(PROC_USUARIO, { [dniParamName]: dniInt }, result)
    );
  } catch (error) {
    return next(error);
  }
}

async function runSigiExpediente(req, res, next) {
  try {
    const raw = req.body?.expediente ?? req.body?.NroExpediente;
    const nro = String(raw ?? "").trim();
    if (nro.length < 1 || nro.length > 50) {
      return res.status(400).json({
        message:
          "Nro. de expediente inválido. Hasta 50 caracteres. Enviá `expediente` o `NroExpediente`.",
      });
    }
    // SP: @NroExpediente VARCHAR(50); ej. '3500384/2026-91' o '3500354/2026-4'
    if (!/^\d{1,8}\/\d{4}-\d{1,4}$/.test(nro)) {
      return res.status(400).json({
        message:
          "expediente inválido. Formato esperado: NNNNNNN/AAAA-CC (ej. 3500384/2026-91)",
      });
    }

    const dniInt = await resolveDniIntForRequest(req);
    if (dniInt == null) {
      return res.status(403).json({
        message:
          "No hay un DNI válido asociado a su usuario. Cargue el DNI en la base local o vuelva a iniciar sesión.",
      });
    }

    const usuarioRs = await executeSigiProcedure(
      PROC_USUARIO,
      sqlParamsUsuarioSigi(dniInt)
    );
    const allowed = collectCodDepsFromUsuarioSigiResult(usuarioRs);
    await mergeCodDepsFromNumeradorDependencia(allowed, req.user?.dependenciaId);
    if (allowed.size === 0) {
      return res.status(403).json({
        message:
          "No hay códigos de dependencia SIGI para filtrar: el SP de usuario no devolvió COD_DEP y la dependencia del Numerador no tiene cod_dep_sigi cargado.",
      });
    }

    const paramName =
      String(process.env.SIGI_SP_EXPEDIENTE_PARAM || "NroExpediente").trim() ||
      "NroExpediente";

    const sqlParams = {
      [paramName]: { type: sql.VarChar(50), value: nro },
    };
    const result = await executeSigiProcedure(PROC_EXPEDIENTE, sqlParams);

    const allRows = flattenSigiRecordsets(result);
    const canFilterRows =
      allRows.length === 0 ||
      allRows.some((row) => getCodDepFromRow(row, "expediente") != null);

    let outResult = result;
    let filterNote = null;
    if (canFilterRows) {
      outResult = filterExpedienteResultByCodDep(result, allowed);
    } else {
      filterNote =
        "SIGI no devolvió código de dependencia reconocible por fila; se muestran todos los datos que devolvió el trámite (el filtro por su dependencia no pudo aplicarse).";
    }

    const payload = unwrapResult(
      PROC_EXPEDIENTE,
      { [paramName]: nro },
      outResult
    );
    const filteredRows = flattenSigiRecordsets(outResult);
    if (filterNote) {
      payload.message = filterNote;
    } else if (allRows.length > 0 && filteredRows.length === 0) {
      payload.message =
        "El expediente figura en SIGI pero no está asignado a ninguna de sus dependencias.";
    }
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  runSigiUsuarioPorDni,
  runSigiExpediente,
  resolveDniIntForRequest,
  getAllowedDependenciaIdsForDni,
};

