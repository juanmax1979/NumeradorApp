const { sql, executeSigiProcedure } = require("../config/sigiDb");
const { runQuery } = require("../config/db");
const { FUEROS, SISTEMAS, normalizeFuero, normalizeSistemaOrigen } = require("../config/fueros");

const PROC_USUARIO = "procNumeradorDatosUsuarioSIGI_DepsCircNomyApe";
const PROC_EXPEDIENTE = "procNumeradorDatosExpteCaratProcDepRadic";

async function getDependenciaContextById(dependenciaId) {
  const id = Number(dependenciaId);
  if (!Number.isInteger(id) || id <= 0) {
    return { fuero: FUEROS.PENAL, sistemaOrigen: SISTEMAS.SIGI };
  }
  const rs = await runQuery(
    `SELECT fuero, sistema_origen
     FROM dbo.dependencias
     WHERE id = @id`,
    { id }
  );
  const row = rs.recordset[0] || {};
  return {
    fuero: normalizeFuero(row.fuero || FUEROS.PENAL),
    sistemaOrigen: normalizeSistemaOrigen(row.sistema_origen || SISTEMAS.SIGI),
  };
}

async function getRequestIntegrationContext(req) {
  const depId = req.user?.dependenciaId;
  const dbCtx = await getDependenciaContextById(depId);
  return {
    fuero: normalizeFuero(req.user?.fuero || dbCtx.fuero || FUEROS.PENAL),
    sistemaOrigen: normalizeSistemaOrigen(
      req.user?.sistemaOrigen || dbCtx.sistemaOrigen || SISTEMAS.SIGI
    ),
  };
}

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

/** Alinear "03500" con "3500"; códigos alfanuméricos (ej. MUIT) en mayúsculas para cruzar con BD/SIGI. */
function expandCodDepVariants(token) {
  const s = String(token ?? "").trim();
  if (!s) return [];
  const out = new Set();
  if (/^\d+$/.test(s)) {
    out.add(s);
    const n = parseInt(s, 10);
    if (!Number.isNaN(n)) out.add(String(n));
  } else {
    out.add(s.toUpperCase());
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

function getDependenciaNameFromUsuarioRow(row) {
  if (!row || typeof row !== "object") return null;
  const upperMap = {};
  for (const k of Object.keys(row)) {
    upperMap[String(k).toUpperCase()] = row[k];
  }
  const CANDS = [
    "NOMB_DEP",
    "NOM_DEP",
    "NOMBRE_DEP",
    "DEPENDENCIA",
    "DEPENDENCIA_NOMBRE",
  ];
  for (const c of CANDS) {
    const v = upperMap[c];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

function collectDependenciaNamesFromUsuarioSigiResult(result) {
  const rows = [];
  if (Array.isArray(result.recordsets) && result.recordsets.length) {
    for (const rs of result.recordsets) {
      if (Array.isArray(rs)) rows.push(...rs);
    }
  } else if (Array.isArray(result.recordset)) {
    rows.push(...result.recordset);
  }
  const names = new Set();
  for (const row of rows) {
    const n = getDependenciaNameFromUsuarioRow(row);
    if (n) names.add(n);
  }
  return names;
}

/**
 * IDs en dbo.dependencias cuyo cod_dep_sigi coincide con algún COD_DEP devuelto por el SP usuario SIGI.
 */
async function getAllowedDependenciaIdsForDni(dniInt, options = {}) {
  const result = await executeSigiProcedure(PROC_USUARIO, sqlParamsUsuarioSigi(dniInt));
  const allowed = collectCodDepsFromUsuarioSigiResult(result);
  const allowedNames = collectDependenciaNamesFromUsuarioSigiResult(result);
  if (allowed.size === 0 && allowedNames.size === 0) return [];

  const targetFuero = options?.fuero ? normalizeFuero(options.fuero) : null;
  const targetSistema = options?.sistemaOrigen
    ? normalizeSistemaOrigen(options.sistemaOrigen)
    : null;

  let inferredCtx = null;
  if ((!targetFuero || !targetSistema) && options?.dependenciaIdActual) {
    inferredCtx = await getDependenciaContextById(options.dependenciaIdActual);
  }
  const finalFuero = targetFuero || inferredCtx?.fuero || FUEROS.PENAL;
  const finalSistema = targetSistema || inferredCtx?.sistemaOrigen || SISTEMAS.SIGI;

  const rs = await runQuery(
    `SELECT id,
            COALESCE(NULLIF(LTRIM(RTRIM(cod_dep_externo)), ''), cod_dep_sigi) AS cod
     FROM dbo.dependencias
     WHERE activa = 1
       AND fuero = @fuero
       AND sistema_origen = @sistema
       AND COALESCE(NULLIF(LTRIM(RTRIM(cod_dep_externo)), ''), cod_dep_sigi) IS NOT NULL
       AND LTRIM(RTRIM(COALESCE(NULLIF(cod_dep_externo, ''), cod_dep_sigi))) <> ''`,
    { fuero: finalFuero, sistema: finalSistema }
  );

  const ids = [];
  for (const row of rs.recordset) {
    const raw = row.cod;
    let matchedByCode = false;
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
        matchedByCode = true;
        break;
      }
    }
    if (matchedByCode) continue;
  }

  if (allowedNames.size > 0) {
    const namesRs = await runQuery(
      `SELECT id, nombre
       FROM dbo.dependencias
       WHERE activa = 1
         AND fuero = @fuero
         AND sistema_origen = @sistema`,
      { fuero: finalFuero, sistema: finalSistema }
    );
    for (const row of namesRs.recordset) {
      const nombre = String(row.nombre || "").trim();
      if (!nombre) continue;
      for (const sigiNombre of allowedNames) {
        if (dependenciaLabelsMatch(sigiNombre, nombre)) {
          ids.push(Number(row.id));
          break;
        }
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
    `SELECT COALESCE(NULLIF(LTRIM(RTRIM(cod_dep_externo)), ''), cod_dep_sigi) AS c
     FROM dbo.dependencias
     WHERE id = @id AND activa = 1`,
    { id }
  );
  const raw = rs.recordset[0]?.c;
  addCodDepTokens(allowed, raw);
}

/** Texto de dependencia en filas del SP expediente (p. ej. DependRadicExpte). */
function getDependenciaDescripcionFromExpedienteRow(row) {
  if (!row || typeof row !== "object") return null;
  const upperMap = {};
  for (const k of Object.keys(row)) {
    upperMap[String(k).toUpperCase()] = row[k];
  }
  const CANDS = [
    "DEPENDRADICEXPTE",
    "DEPEND_RADIC_EXPTE",
    "DEPEND_RADIC_EXPDTE",
    "NOMB_DEP",
    "NOM_DEP",
    "NOMBRE_DEP",
    "DEPENDENCIA",
    "DESCRIP_DEP",
    "DEP_RADICACION",
    "DEPENDENCIA_RADICACION",
    "DEPENDENCIA_RADIC",
  ];
  for (const c of CANDS) {
    const v = upperMap[c];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  for (const k of Object.keys(row)) {
    const ku = String(k).toUpperCase();
    if (ku.includes("CARATULA") || ku.includes("OBSERV") || ku.includes("TEXTO")) continue;
    if (ku.includes("DEPEND") && (ku.includes("RADIC") || ku.includes("EXPTE"))) {
      const v = row[k];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
  }
  return null;
}

function normalizeDependenciaLabel(s) {
  let t = String(s ?? "").trim();
  if (!t) return "";
  t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  t = t.replace(/[º°]/gi, "");
  t = t.replace(/\s+/g, " ").trim().toUpperCase();
  return t;
}

function dependenciaLabelsMatch(sigiLabel, numeradorNombre) {
  if (!sigiLabel || !numeradorNombre) return false;
  const a = normalizeDependenciaLabel(sigiLabel);
  const b = normalizeDependenciaLabel(numeradorNombre);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  return false;
}

function expedienteRowHasMatchableDepData(row) {
  return (
    getCodDepFromRow(row, "expediente") != null ||
    getDependenciaDescripcionFromExpedienteRow(row) != null
  );
}

/**
 * Misma lógica que runSigiExpediente: tokens del SP usuario SIGI (DNI) + cod_dep_sigi de la dependencia
 * activa en dbo.dependencias (pueden no coincidir literalmente entre SIGI y Numerador).
 */
async function buildSessionAllowedCodDepSet(req) {
  const allowed = new Set();
  const dniInt = await resolveDniIntForRequest(req);
  if (dniInt != null) {
    try {
      const usuarioRs = await executeSigiProcedure(PROC_USUARIO, sqlParamsUsuarioSigi(dniInt));
      const fromUser = collectCodDepsFromUsuarioSigiResult(usuarioRs);
      for (const t of fromUser) allowed.add(t);
    } catch {
      /* SIGI usuario no disponible: se siguen usando tokens desde cod_dep_sigi del Numerador */
    }
  }
  await mergeCodDepsFromNumeradorDependencia(allowed, req.user?.dependenciaId);
  return allowed;
}

/** Tokens SIGI + nombre de la dependencia activa en Numerador (para filtrar expediente por código o por texto). */
async function buildSessionSigiFilterContext(req) {
  const allowed = await buildSessionAllowedCodDepSet(req);
  let dependenciaNombre = null;
  const id = Number(req.user?.dependenciaId);
  if (Number.isInteger(id) && id > 0) {
    const rs = await runQuery(
      `SELECT LTRIM(RTRIM(nombre)) AS nombre
       FROM dbo.dependencias
       WHERE id = @id AND activa = 1`,
      { id }
    );
    const n = rs.recordset[0]?.nombre;
    if (n != null && String(n).trim() !== "") dependenciaNombre = String(n).trim();
  }
  return { allowed, dependenciaNombre };
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
    const ctx = await getRequestIntegrationContext(req);
    if (ctx.sistemaOrigen !== SISTEMAS.SIGI) {
      return res.status(409).json({
        message: `La dependencia activa pertenece al fuero ${ctx.fuero} y usa ${ctx.sistemaOrigen}. Este endpoint solo aplica a SIGI.`,
      });
    }

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
    const ctx = await getRequestIntegrationContext(req);
    if (ctx.sistemaOrigen !== SISTEMAS.SIGI) {
      return res.status(409).json({
        message: `La dependencia activa pertenece al fuero ${ctx.fuero} y usa ${ctx.sistemaOrigen}. Este endpoint solo aplica a SIGI.`,
      });
    }

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

    const paramName =
      String(process.env.SIGI_SP_EXPEDIENTE_PARAM || "NroExpediente").trim() ||
      "NroExpediente";

    const sqlParams = {
      [paramName]: { type: sql.VarChar(50), value: nro },
    };
    const result = await executeSigiProcedure(PROC_EXPEDIENTE, sqlParams);

    const allRows = flattenSigiRecordsets(result);
    const canDetectDepPerRow =
      allRows.length === 0 || allRows.some((row) => expedienteRowHasMatchableDepData(row));

    let filterNote = null;
    if (!canDetectDepPerRow) {
      filterNote =
        "SIGI no devolvió código ni texto de dependencia reconocible por fila; no se puede indicar si cada fila corresponde a su dependencia activa.";
    }

    const payload = unwrapResult(
      PROC_EXPEDIENTE,
      { [paramName]: nro },
      result
    );
    if (filterNote) {
      payload.message = filterNote;
    }
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
}

/** Para el front: mismos tokens que se usan al filtrar /sigi/expediente (usuario SIGI + cod_dep_sigi). */
async function getSigiAllowedCodDepTokens(req, res, next) {
  try {
    const integrationCtx = await getRequestIntegrationContext(req);
    if (integrationCtx.sistemaOrigen !== SISTEMAS.SIGI) {
      return res.json({
        tokens: [],
        dependenciaNombre: "",
        fuero: integrationCtx.fuero,
        sistemaOrigen: integrationCtx.sistemaOrigen,
      });
    }

    const sigiCtx = await buildSessionSigiFilterContext(req);
    return res.json({
      tokens: [...sigiCtx.allowed].sort(),
      dependenciaNombre: sigiCtx.dependenciaNombre || "",
      fuero: integrationCtx.fuero,
      sistemaOrigen: integrationCtx.sistemaOrigen,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Dependencias del Numerador donde el usuario está habilitado según SIGI (SP usuario por DNI),
 * mismo criterio que switch-dependencia y getAllowedDependenciaIdsForDni.
 */
async function getMisDependenciasSigi(req, res, next) {
  try {
    const ctx = await getRequestIntegrationContext(req);
    if (ctx.sistemaOrigen !== SISTEMAS.SIGI) {
      return res.json({
        dependencias: [],
        fuero: ctx.fuero,
        sistemaOrigen: ctx.sistemaOrigen,
      });
    }

    const dniInt = await resolveDniIntForRequest(req);
    if (dniInt == null) {
      return res.json({
        dependencias: [],
        aviso: "sin_dni",
        fuero: ctx.fuero,
        sistemaOrigen: ctx.sistemaOrigen,
      });
    }

    let ids = [];
    try {
      ids = await getAllowedDependenciaIdsForDni(dniInt, {
        dependenciaIdActual: req.user?.dependenciaId,
      });
    } catch {
      return res.status(503).json({
        message:
          "No se pudo consultar SIGI para listar dependencias. Intente más tarde.",
      });
    }

    if (!ids.length) {
      return res.json({
        dependencias: [],
        fuero: ctx.fuero,
        sistemaOrigen: ctx.sistemaOrigen,
      });
    }

    const inputs = {};
    const placeholders = ids.map((id, i) => {
      const key = `id${i}`;
      inputs[key] = id;
      return `@${key}`;
    });
    const rs = await runQuery(
      `SELECT id, LTRIM(RTRIM(nombre)) AS nombre
       FROM dbo.dependencias
       WHERE activa = 1 AND id IN (${placeholders.join(", ")})`,
      inputs
    );
    const byId = new Map(
      (rs.recordset || []).map((row) => [Number(row.id), String(row.nombre || "").trim()])
    );
    const dependencias = ids.map((id) => ({
      dependenciaId: id,
      label: byId.get(id) || `Dependencia ${id}`,
    }));

    return res.json({
      dependencias,
      fuero: ctx.fuero,
      sistemaOrigen: ctx.sistemaOrigen,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  runSigiUsuarioPorDni,
  runSigiExpediente,
  getSigiAllowedCodDepTokens,
  getMisDependenciasSigi,
  resolveDniIntForRequest,
  getAllowedDependenciaIdsForDni,
};

