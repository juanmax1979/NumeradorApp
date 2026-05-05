import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import api, { setAuthToken, setOnAuthFailure } from "./api";

const TYPES = [
  "OFICIO",
  "AUTO",
  "SENTENCIA TRAMITE",
  "SENTENCIA RELATORIA",
];

const TAB_KEYS = [...TYPES, "BUSCADOR", "ESTADISTICAS", "CATALOGO"];
const CAPTCHA_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PAGE_SIZE_OPTIONS = [10, 20, 50];

const MOTIVOS_ANULACION = [
  "Decreto no firmado",
  "Rechazado por incongruencias",
  "Otro",
];

const MSG_SIGI_FILA_OTRA_DEPENDENCIA =
  "Esta fila no corresponde a la dependencia seleccionada en el Numerador. " +
  "Elegí otra dependencia en la barra superior o comprobá en SIGI el código o el texto de dependencia del trámite.";

function fmtDate(value) {
  if (!value) return "-";
  return dayjs(value).format("DD/MM/YYYY HH:mm");
}

/**
 * True = fuera de plazo (el botón Anular debe ir deshabilitado).
 * Misma idea que el backend: minutos desde `row.fecha` vs. tope en horas.
 */
function isPastAnnulDeadline(row, maxHoursAfterCreate) {
  if (!Number.isFinite(maxHoursAfterCreate) || maxHoursAfterCreate <= 0) {
    return true;
  }
  if (!row?.fecha) {
    return true;
  }
  const maxMinutes = maxHoursAfterCreate * 60;
  const minutesElapsed = dayjs().diff(dayjs(row.fecha), "minute", true);
  return minutesElapsed > maxMinutes;
}

/** Incluye formato Numerador corto y SIGI largo (NVARCHAR 120 en BD) */
const EXPEDIENTE_REGEX = /^\d{1,8}\/\d{4}-\d{1,4}$/;
const SIGI_EXPEDIENTE_REGEX = EXPEDIENTE_REGEX;

function normalizeExpedienteInput(rawValue) {
  const cleaned = String(rawValue || "").replace(/[^\d/-]/g, "");
  let left = "";
  let year = "";
  let circ = "";
  let stage = 0; // 0: numero, 1: anio, 2: circunscripcion

  for (const ch of cleaned) {
    if (stage === 0) {
      if (/\d/.test(ch) && left.length < 8) {
        left += ch;
      } else if (ch === "/" && left.length > 0) {
        stage = 1;
      }
      continue;
    }

    if (stage === 1) {
      if (/\d/.test(ch) && year.length < 4) {
        year += ch;
      } else if (ch === "-" && year.length === 4) {
        stage = 2;
      }
      continue;
    }

    if (stage === 2) {
      if (/\d/.test(ch) && circ.length < 4) {
        circ += ch;
      }
    }
  }

  let result = left;
  if (stage >= 1 || year.length > 0) {
    result += `/${year}`;
  }
  if (stage >= 2 || circ.length > 0) {
    result += `-${circ}`;
  }
  return result;
}

function isValidExpediente(value) {
  return EXPEDIENTE_REGEX.test(String(value || "").trim());
}

/** Toma el N° de expediente desde una fila SIGI o el valor consultado. */

function sigiRowField(row, ...candidateKeys) {
  if (!row || typeof row !== "object") return "";
  const map = {};
  for (const k of Object.keys(row)) {
    map[String(k).toUpperCase()] = row[k];
  }
  for (const key of candidateKeys) {
    const u = String(key).toUpperCase();
    if (Object.prototype.hasOwnProperty.call(map, u)) {
      const v = map[u];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
  }
  return "";
}

/** Igual que backend sigiController.COD_DEP_CANDIDATES / getCodDepFromRow. */
const SIGI_COD_DEP_CANDIDATES = [
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

/** Alinear "03500" con "3500"; códigos alfanuméricos (ej. MUIT) en mayúsculas (misma regla que el backend). */
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

function codTokensFromField(raw) {
  const tokens = new Set();
  for (const part of String(raw ?? "").split(/[,;]+/)) {
    const p = part.trim();
    if (!p) continue;
    for (const v of expandCodDepVariants(p)) tokens.add(v);
  }
  return tokens;
}

/** Misma lógica que backend getCodDepFromRow (incl. heurística expediente). */
function getCodDepFromSigiRow(row, mode = "usuario") {
  if (!row || typeof row !== "object") return null;
  const upperMap = {};
  for (const k of Object.keys(row)) {
    upperMap[String(k).toUpperCase()] = row[k];
  }
  for (const c of SIGI_COD_DEP_CANDIDATES) {
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
      /^COD_DEP/i.test(ku) ||
      /^DEP_COD/i.test(ku);
    if (!fromCodDep) continue;
    const v = row[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (!s || s.length > 64) continue;
    return s;
  }
  return null;
}

/** Igual que backend getDependenciaDescripcionFromExpedienteRow. */
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

/** Igual que backend rowMatchesSessionSigiFilter: tokens y/o nombre dbo.dependencias.nombre. */
function expedienteRowMatchesAllowedTokens(row, tokensArray, dependenciaNombre) {
  const allowed = new Set(Array.isArray(tokensArray) ? tokensArray : []);
  if (allowed.size > 0) {
    const cod = getCodDepFromSigiRow(row, "expediente");
    if (cod != null && expandCodDepVariants(cod).some((v) => allowed.has(v))) return true;
  }
  const depNom = String(dependenciaNombre ?? "").trim();
  if (depNom) {
    const desc = getDependenciaDescripcionFromExpedienteRow(row);
    if (desc && dependenciaLabelsMatch(desc, depNom)) return true;
  }
  return false;
}

function expedienteFromSigiRow(row, fallbackQueried) {
  if (!row || typeof row !== "object") return String(fallbackQueried || "").trim();
  const preferredKeys = [
    "nroexpediente",
    "nro_expediente",
    "expediente",
    "numeroexpediente",
    "numero_expediente",
    "expedientesigi",
    "expte",
    "exp",
  ];
  const lower = {};
  for (const k of Object.keys(row)) {
    lower[String(k).toLowerCase()] = row[k];
  }
  for (const pk of preferredKeys) {
    const v = lower[pk];
    if (v != null && String(v).trim() !== "") {
      const s = String(v).trim();
      if (EXPEDIENTE_REGEX.test(s)) return s;
    }
  }
  for (const k of Object.keys(row)) {
    const s = String(row[k] ?? "").trim();
    if (EXPEDIENTE_REGEX.test(s)) return s;
  }
  return String(fallbackQueried || "").trim();
}

function generateCaptchaCode(length = 6) {
  let value = "";
  for (let i = 0; i < length; i += 1) {
    value += CAPTCHA_CHARS[Math.floor(Math.random() * CAPTCHA_CHARS.length)];
  }
  return value;
}

function App() {
  const [token, setToken] = useState(localStorage.getItem("numerador_token") || "");
  const [user, setUser] = useState(
    JSON.parse(localStorage.getItem("numerador_user") || "null")
  );

  const [loginForm, setLoginForm] = useState({
    usuario: "",
    password: "",
    pcName: window.navigator.userAgent.slice(0, 60),
  });
  const [captchaCode, setCaptchaCode] = useState(() => generateCaptchaCode());
  const [captchaInput, setCaptchaInput] = useState("");
  const [loginError, setLoginError] = useState("");

  const [activeTab, setActiveTab] = useState(TYPES[0]);
  const [categorias, setCategorias] = useState({});
  const [tipoRows, setTipoRows] = useState([]);
  const [tipoSearch, setTipoSearch] = useState("");
  const [sigiExpediente, setSigiExpediente] = useState({
    loading: false,
    error: "",
    data: null,
    queried: "",
  });
  const [sigiExpedienteSelectedIdx, setSigiExpedienteSelectedIdx] = useState(null);
  const [nextNumber, setNextNumber] = useState(null);
  const [formByType, setFormByType] = useState(
    Object.fromEntries(
      TYPES.map((t) => [t, { expediente: "", detalleSelect: "", detalleOtro: "" }])
    )
  );

  const [globalFilters, setGlobalFilters] = useState({
    q: "",
    tipo: "TODOS",
    from: dayjs().startOf("year").format("YYYY-MM-DD"),
    to: dayjs().format("YYYY-MM-DD"),
  });
  const [globalRows, setGlobalRows] = useState([]);

  const [statsYear, setStatsYear] = useState(new Date().getFullYear());
  const [stats, setStats] = useState({ totals: [], monthly: [], ranking: [], auditLog: [] });
  const displayName = user?.nombreCompleto || user?.nombre || "-";
  const displayUser = user?.usuario || user?.nombre || "-";
  const activeFuero = String(user?.fuero || "PENAL").trim().toUpperCase();
  const activeSistemaOrigen = String(user?.sistemaOrigen || "SIGI").trim().toUpperCase();
  /** Opciones de dependencia según SIGI + cod_dep_sigi en Numerador */
  const [sigiDepOptions, setSigiDepOptions] = useState([]);
  /** null = sin sesión; loading | choose | ready */
  const [multiDepGate, setMultiDepGate] = useState(null);
  const [depPickerChoice, setDepPickerChoice] = useState(null);
  const [paginationByTab, setPaginationByTab] = useState(() =>
    Object.fromEntries(
      TAB_KEYS.map((tab) => [tab, { page: 1, pageSize: 20 }])
    )
  );
  const [annulMaxHoursAfterCreate, setAnnulMaxHoursAfterCreate] = useState(48);
  const [annulModalRow, setAnnulModalRow] = useState(null);
  const [annulForm, setAnnulForm] = useState({
    motivo: MOTIVOS_ANULACION[0],
    observacion: "",
  });
  /** dbo.dependencias (cod_dep_sigi) para cruzar filas SIGI con la dependencia activa */
  const [metaDependencias, setMetaDependencias] = useState([]);
  /** Códigos permitidos: SP usuario SIGI (DNI) + cod_dep_sigi de la dependencia (mismo criterio que el backend). */
  const [sigiAllowedCodDepTokens, setSigiAllowedCodDepTokens] = useState([]);
  const [sigiDependenciaNombre, setSigiDependenciaNombre] = useState("");
  const [catalogo, setCatalogo] = useState([]);
  const [catalogoLoading, setCatalogoLoading] = useState(false);
  const [catalogoError, setCatalogoError] = useState("");
  const [newCategoriaByTipo, setNewCategoriaByTipo] = useState({});
  const [newOpcionByCategoria, setNewOpcionByCategoria] = useState({});

  function localLogout() {
    setToken("");
    setUser(null);
    setSigiDepOptions([]);
    setMetaDependencias([]);
    setSigiAllowedCodDepTokens([]);
    setSigiDependenciaNombre("");
    setMultiDepGate(null);
    setDepPickerChoice(null);
    setAuthToken("");
    localStorage.removeItem("numerador_token");
    localStorage.removeItem("numerador_user");
  }

  async function applySwitchDependencia(dependenciaId) {
    const { data } = await api.post("/auth/switch-dependencia", { dependenciaId });
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem("numerador_token", data.token);
    localStorage.setItem("numerador_user", JSON.stringify(data.user));
    setAuthToken(data.token);
    return data;
  }

  /**
   * Lista dependencias habilitadas según SIGI (GET /sigi/mis-dependencias = SP usuario + mismo criterio que switch-dependencia).
   * `silent`: no pone la pantalla en "loading" (p. ej. botón Refrescar).
   */
  const syncSigiDependenciasWithServer = useCallback(async (sessionUser, opts = {}) => {
    const silent = Boolean(opts.silent);
    const isCancelled =
      typeof opts.isCancelled === "function" ? opts.isCancelled : () => false;

    const sistema = String(sessionUser?.sistemaOrigen || "SIGI").trim().toUpperCase();
    if (sistema !== "SIGI") return;

    const dniRaw = sessionUser?.dni;
    const dniStr =
      typeof dniRaw === "number" && Number.isInteger(dniRaw)
        ? String(dniRaw)
        : String(dniRaw ?? "").replace(/\D/g, "");
    if (!/^\d{7,8}$/.test(dniStr)) return;

    if (!silent) setMultiDepGate("loading");

    try {
      const { data } = await api.get("/sigi/mis-dependencias");
      if (isCancelled()) return;

      const options = Array.isArray(data?.dependencias) ? data.dependencias : [];
      setSigiDepOptions(options);

      const currentId = Number(sessionUser?.dependenciaId);

      if (options.length >= 2) {
        const inList = options.some((o) => o.dependenciaId === currentId);
        if (!isCancelled()) setMultiDepGate(inList ? "ready" : "choose");
        return;
      }
      if (options.length === 1) {
        const onlyId = options[0].dependenciaId;
        if (onlyId !== currentId) {
          try {
            const { data } = await api.post("/auth/switch-dependencia", {
              dependenciaId: onlyId,
            });
            if (isCancelled()) return;
            setToken(data.token);
            setUser(data.user);
            localStorage.setItem("numerador_token", data.token);
            localStorage.setItem("numerador_user", JSON.stringify(data.user));
            setAuthToken(data.token);
          } catch {
            /* sigue con la dependencia ya asignada en el token */
          }
        }
        if (!isCancelled()) setMultiDepGate("ready");
        return;
      }
      if (!isCancelled()) setMultiDepGate("ready");
    } catch {
      if (!silent && !isCancelled()) {
        setSigiDepOptions([]);
        setMultiDepGate("ready");
      }
    }
  }, []);

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  useEffect(() => {
    setOnAuthFailure(localLogout);
    return () => setOnAuthFailure(() => {});
  }, []);

  useEffect(() => {
    if (!token || !user) {
      setSigiDepOptions([]);
      setMultiDepGate(null);
      setDepPickerChoice(null);
      return;
    }
    if (activeSistemaOrigen !== "SIGI") {
      setSigiDepOptions([]);
      setMetaDependencias([]);
      setSigiAllowedCodDepTokens([]);
      setSigiDependenciaNombre("");
      setMultiDepGate("ready");
      setDepPickerChoice(null);
      return;
    }
    const dniRaw = user.dni;
    const dniStr =
      typeof dniRaw === "number" && Number.isInteger(dniRaw)
        ? String(dniRaw)
        : String(dniRaw ?? "").replace(/\D/g, "");
    if (!/^\d{7,8}$/.test(dniStr)) {
      setSigiDepOptions([]);
      setMultiDepGate("ready");
      setDepPickerChoice(null);
      return;
    }
    let cancelled = false;
    syncSigiDependenciasWithServer(user, {
      silent: false,
      isCancelled: () => cancelled,
    });
    return () => {
      cancelled = true;
    };
  }, [token, user?.dni, user?.nombre, activeSistemaOrigen, syncSigiDependenciasWithServer]);

  const dataSessionReady = Boolean(token && user && multiDepGate === "ready");

  useEffect(() => {
    if (!dataSessionReady) return;
    loadCategorias();
  }, [dataSessionReady]);

  useEffect(() => {
    if (!dataSessionReady || !user) return;
    if (activeSistemaOrigen !== "SIGI") {
      setSigiAllowedCodDepTokens([]);
      setSigiDependenciaNombre("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/sigi/allowed-cod-dep-tokens");
        if (!cancelled) {
          setSigiAllowedCodDepTokens(Array.isArray(data?.tokens) ? data.tokens : []);
          setSigiDependenciaNombre(
            typeof data?.dependenciaNombre === "string" ? data.dependenciaNombre : ""
          );
        }
      } catch {
        if (!cancelled) {
          setSigiAllowedCodDepTokens([]);
          setSigiDependenciaNombre("");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dataSessionReady, user?.dependenciaId, activeSistemaOrigen]);

  useEffect(() => {
    if (!dataSessionReady) return;
    if (!TYPES.includes(activeTab)) return;
    loadTipoRows(activeTab, tipoSearch);
    loadNextNumber(activeTab);
  }, [activeTab, dataSessionReady, user?.dependenciaId]);

  useEffect(() => {
    if (!dataSessionReady) return;
    if (activeTab !== "CATALOGO") return;
    if (user?.rol !== "admin") return;
    loadCatalogo();
  }, [activeTab, dataSessionReady, user?.rol]);

  useEffect(() => {
    if (multiDepGate !== "choose" || sigiDepOptions.length < 1) return;
    const inList = sigiDepOptions.some((o) => o.dependenciaId === user?.dependenciaId);
    setDepPickerChoice(inList ? user.dependenciaId : sigiDepOptions[0].dependenciaId);
  }, [multiDepGate, sigiDepOptions, user?.dependenciaId]);

  useEffect(() => {
    if (!TYPES.includes(activeTab)) return;
    setSigiExpediente({ loading: false, error: "", data: null, queried: "" });
    setSigiExpedienteSelectedIdx(null);
  }, [activeTab]);

  const categoryOptions = useMemo(() => {
    const catByType = categorias[activeTab];
    if (!catByType || typeof catByType !== "object") return [];
    const opts = [];
    Object.entries(catByType).forEach(([categoria, subs]) => {
      if (!subs?.length) {
        opts.push({
          value: activeTab === "OFICIO" ? `Of. ${categoria}` : categoria,
          label: categoria,
        });
      } else {
        subs.forEach((sub) => {
          opts.push({
            value: activeTab === "OFICIO" ? `Of. ${categoria} (${sub})` : `${categoria} (${sub})`,
            label: `${categoria} -> ${sub}`,
          });
        });
      }
    });
    opts.push({ value: "__OTROS__", label: "OTROS (especificar)" });
    return opts;
  }, [categorias, activeTab]);

  async function loadCategorias() {
    const [catRes, limitsRes, depsRes] = await Promise.all([
      api.get("/meta/categorias"),
      api.get("/meta/limits").catch(() => ({ data: null })),
      api.get("/meta/dependencias").catch(() => ({ data: [] })),
    ]);
    setCategorias(catRes.data);
    const h = Number(limitsRes.data?.annulMaxHoursAfterCreate);
    if (Number.isFinite(h) && h > 0) {
      setAnnulMaxHoursAfterCreate(h);
    }
    setMetaDependencias(Array.isArray(depsRes.data) ? depsRes.data : []);
  }

  async function loadCatalogo() {
    setCatalogoLoading(true);
    setCatalogoError("");
    try {
      const { data } = await api.get("/meta/recaudos-catalogo");
      setCatalogo(Array.isArray(data?.tipos) ? data.tipos : []);
    } catch (error) {
      setCatalogoError(error.response?.data?.message || "No se pudo cargar el catálogo");
    } finally {
      setCatalogoLoading(false);
    }
  }

  async function loadNextNumber(tipo) {
    const { data } = await api.get(`/records/next-number/${encodeURIComponent(tipo)}`);
    setNextNumber(data.proximo);
  }

  async function loadTipoRows(tipo, q) {
    const { data } = await api.get("/records", { params: { tipo, q, limit: 150 } });
    setTipoRows(data);
    setPaginationByTab((prev) => ({
      ...prev,
      [tipo]: { ...(prev[tipo] || { page: 1, pageSize: 20 }), page: 1 },
    }));
  }

  async function consultarSigiExpediente() {
    const nro = String(tipoSearch || "").trim();
    if (!SIGI_EXPEDIENTE_REGEX.test(nro)) {
      setSigiExpediente({
        loading: false,
        error:
          "Expediente SIGI: formato NNNNNNN/AAAA-CC (ej. 3500384/2026-91). Usá hasta 8 dígitos antes de / y 1–4 después del guion.",
        data: null,
        queried: "",
      });
      return;
    }
    setSigiExpediente({ loading: true, error: "", data: null, queried: nro });
    setSigiExpedienteSelectedIdx(null);
    try {
      const { data } = await api.post("/sigi/expediente", { NroExpediente: nro });
      setSigiExpediente({ loading: false, error: "", data, queried: nro });
    } catch (e) {
      setSigiExpediente({
        loading: false,
        error: e.response?.data?.message || "No se pudo consultar SIGI",
        data: null,
        queried: nro,
      });
    }
  }

  function usarExpedienteSigiEnFormulario(row, rowIdx) {
    if (!expedienteRowMatchesAllowedTokens(row, sigiAllowedCodDepTokens, sigiDependenciaNombre)) {
      window.alert(MSG_SIGI_FILA_OTRA_DEPENDENCIA);
      return;
    }
    const ex = expedienteFromSigiRow(row, sigiExpediente.queried);
    if (!ex || !EXPEDIENTE_REGEX.test(ex)) {
      window.alert(
        "No se pudo obtener un expediente con formato válido desde esta fila. " +
          "Comprobá las columnas devueltas por SIGI o escribí el número manualmente."
      );
      return;
    }
    setFormByType((p) => ({
      ...p,
      [activeTab]: {
        ...(p[activeTab] || { expediente: "", detalleSelect: "", detalleOtro: "" }),
        expediente: ex,
      },
    }));
    setSigiExpedienteSelectedIdx(rowIdx);
  }

  async function loadGlobalRows() {
    const from = `${globalFilters.from} 00:00:00`;
    const to = `${globalFilters.to} 23:59:59`;
    const { data } = await api.get("/records", {
      params: {
        tipo: globalFilters.tipo,
        q: globalFilters.q,
        from,
        to,
        limit: 250,
      },
    });
    setGlobalRows(data);
    setPaginationByTab((prev) => ({
      ...prev,
      BUSCADOR: { ...(prev.BUSCADOR || { page: 1, pageSize: 20 }), page: 1 },
    }));
  }

  async function loadStats() {
    const { data } = await api.get("/stats", { params: { year: statsYear } });
    setStats(data);
  }

  async function exportBuscadorExcel() {
    const from = `${globalFilters.from} 00:00:00`;
    const to = `${globalFilters.to} 23:59:59`;
    const response = await api.get("/records/export.xlsx", {
      params: {
        tipo: globalFilters.tipo,
        q: globalFilters.q,
        from,
        to,
        limit: 1000,
      },
      responseType: "blob",
    });
    const blob = new Blob([response.data], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `registros_${dayjs().format("YYYYMMDD_HHmmss")}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  async function doLogin(forceSession = false) {
    setLoginError("");
    if (captchaInput.trim().toUpperCase() !== captchaCode) {
      setLoginError("Codigo de verificacion incorrecto");
      setCaptchaCode(generateCaptchaCode());
      setCaptchaInput("");
      return;
    }
    try {
      const { data } = await api.post("/auth/login", { ...loginForm, forceSession });
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem("numerador_token", data.token);
      localStorage.setItem("numerador_user", JSON.stringify(data.user));
    } catch (error) {
      if (error.response?.status === 409 && error.response?.data?.code === "SESSION_ACTIVE") {
        const accepted = window.confirm(
          `El usuario está activo en ${error.response.data.activePc}.\n\n¿Forzar ingreso?`
        );
        if (accepted) return doLogin(true);
        return;
      }
      setLoginError(error.response?.data?.message || "No se pudo iniciar sesión");
      setCaptchaCode(generateCaptchaCode());
      setCaptchaInput("");
    }
  }

  async function doLogout() {
    try {
      await api.post("/auth/logout");
    } catch (e) {
      // Nada: igual cerramos localmente.
    }
    localLogout();
  }

  async function createRecord(e) {
    e.preventDefault();
    const form = formByType[activeTab];
    const detalle =
      form.detalleSelect === "__OTROS__" ? form.detalleOtro.trim() : form.detalleSelect.trim();
    if (!isValidExpediente(form.expediente)) {
      return alert(
        "Expediente inválido. Formato: N°/aaaa-circ (hasta 8 dígitos antes de /, 1–4 en circunscripción; ej. 12345/2026-1 o 3500384/2026-91)."
      );
    }
    if (!detalle) return alert("Debe seleccionar o ingresar detalle");

    await api.post("/records", {
      tipo: activeTab,
      expediente: form.expediente.trim(),
      detalle,
    });

    setFormByType((prev) => ({
      ...prev,
      [activeTab]: { expediente: "", detalleSelect: "", detalleOtro: "" },
    }));
    await loadTipoRows(activeTab, tipoSearch);
    await loadNextNumber(activeTab);
  }

  function clearCurrentTipoForm() {
    if (!TYPES.includes(activeTab)) return;
    setFormByType((prev) => ({
      ...prev,
      [activeTab]: { expediente: "", detalleSelect: "", detalleOtro: "" },
    }));
    setTipoSearch("");
    setSigiExpediente({ loading: false, error: "", data: null, queried: "" });
    setSigiExpedienteSelectedIdx(null);
  }

  async function actionEdit(row) {
    if (row.expediente === "ANULADO") {
      alert("No se puede modificar un registro anulado.");
      return;
    }
    const expediente = prompt("Nuevo expediente (formato 12345/2026-1):", row.expediente);
    if (!expediente) return;
    if (!isValidExpediente(expediente)) {
      alert(
        "Expediente inválido. Formato: N°/aaaa-circ (ej. 3500384/2026-91)."
      );
      return;
    }
    const detalle = prompt("Nuevo detalle:", row.detalle || "");
    if (detalle === null) return;
    await api.put(`/records/${row.id}`, { expediente: expediente.trim(), detalle });
    await refreshCurrentView();
  }

  function openAnnulModal(row) {
    if (row.expediente === "ANULADO") return;
    if (isPastAnnulDeadline(row, annulMaxHoursAfterCreate)) {
      alert(
        `Solo se puede anular dentro de las ${annulMaxHoursAfterCreate} horas posteriores a la creación del recaudo.`
      );
      return;
    }
    setAnnulForm({ motivo: MOTIVOS_ANULACION[0], observacion: "" });
    setAnnulModalRow(row);
  }

  function closeAnnulModal() {
    setAnnulModalRow(null);
  }

  async function submitAnnulacion() {
    if (!annulModalRow) return;
    const observacion = annulForm.observacion.trim();
    if (annulForm.motivo === "Otro" && !observacion) {
      alert("Si el motivo es «Otro», debe ingresar una observación.");
      return;
    }
    try {
      await api.post(`/records/${annulModalRow.id}/annul`, {
        motivo: annulForm.motivo,
        observacion,
      });
      closeAnnulModal();
      await refreshCurrentView();
    } catch (e) {
      alert(e.response?.data?.message || "No se pudo anular el registro");
    }
  }

  async function actionToggleRemitido(row) {
    await api.post(`/records/${row.id}/toggle-remitido`);
    await refreshCurrentView();
  }

  async function refreshCurrentView() {
    const sys = String(user?.sistemaOrigen || "SIGI").trim().toUpperCase();
    if (token && user && sys === "SIGI") {
      const dniRaw = user.dni;
      const dniStr =
        typeof dniRaw === "number" && Number.isInteger(dniRaw)
          ? String(dniRaw)
          : String(dniRaw ?? "").replace(/\D/g, "");
      if (/^\d{7,8}$/.test(dniStr)) {
        await syncSigiDependenciasWithServer(user, { silent: true });
      }
    }
    if (TYPES.includes(activeTab)) {
      await loadTipoRows(activeTab, tipoSearch);
      await loadNextNumber(activeTab);
      return;
    }
    if (activeTab === "BUSCADOR") await loadGlobalRows();
    if (activeTab === "ESTADISTICAS") await loadStats();
    if (activeTab === "CATALOGO" && user?.rol === "admin") await loadCatalogo();
  }

  async function addCategoria(tipoRecaudoId) {
    const nombre = String(newCategoriaByTipo[tipoRecaudoId] || "").trim();
    if (!nombre) return;
    await api.post("/meta/recaudos-catalogo/categorias", { tipoRecaudoId, nombre });
    setNewCategoriaByTipo((prev) => ({ ...prev, [tipoRecaudoId]: "" }));
    await loadCatalogo();
    await loadCategorias();
  }

  async function editCategoria(cat) {
    const nombre = prompt("Nuevo nombre de categoría:", cat.nombre);
    if (nombre == null) return;
    const trimmed = nombre.trim();
    if (!trimmed) return;
    await api.put(`/meta/recaudos-catalogo/categorias/${cat.id}`, { nombre: trimmed });
    await loadCatalogo();
    await loadCategorias();
  }

  async function addOpcion(categoriaId) {
    const nombre = String(newOpcionByCategoria[categoriaId] || "").trim();
    if (!nombre) return;
    await api.post("/meta/recaudos-catalogo/opciones", { categoriaId, nombre });
    setNewOpcionByCategoria((prev) => ({ ...prev, [categoriaId]: "" }));
    await loadCatalogo();
    await loadCategorias();
  }

  async function editOpcion(opcion) {
    const nombre = prompt("Nuevo nombre de opción:", opcion.nombre);
    if (nombre == null) return;
    const trimmed = nombre.trim();
    if (!trimmed) return;
    await api.put(`/meta/recaudos-catalogo/opciones/${opcion.id}`, { nombre: trimmed });
    await loadCatalogo();
    await loadCategorias();
  }

  async function confirmDepPicker() {
    const id = depPickerChoice;
    if (id == null || !Number.isFinite(Number(id))) return;
    const n = Number(id);
    try {
      if (n !== Number(user?.dependenciaId)) {
        await applySwitchDependencia(n);
      }
      setMultiDepGate("ready");
    } catch (e) {
      window.alert(e.response?.data?.message || "No se pudo aplicar la dependencia elegida");
    }
  }

  if (!token) {
    return (
      <div className="login-wrap">
        <div className="login-shell">
          <div className="login-brand-panel">
            <img
              src="/app-icon.png"
              alt="Poder Judicial del Chaco"
              className="login-brand-image"
            />
            <h1>Numerador</h1>
            <p>Sistema de gestión y numeración de recaudos judiciales</p>
          </div>

          <form
            className="login-form-panel"
            onSubmit={(e) => {
              e.preventDefault();
              doLogin();
            }}
          >
            <h2>Inicio de Sesión</h2>
            <input
              placeholder="Usuario"
              value={loginForm.usuario}
              onChange={(e) => setLoginForm((p) => ({ ...p, usuario: e.target.value }))}
            />
            <input
              type="password"
              placeholder="Contraseña"
              value={loginForm.password}
              onChange={(e) => setLoginForm((p) => ({ ...p, password: e.target.value }))}
            />
            <div className="captcha-row">
              <div className="captcha-code" aria-label="Codigo de verificacion">
                {captchaCode}
              </div>
              <button
                type="button"
                className="captcha-refresh"
                onClick={() => {
                  setCaptchaCode(generateCaptchaCode());
                  setCaptchaInput("");
                  setLoginError("");
                }}
              >
                Regenerar
              </button>
            </div>
            <input
              placeholder="Ingrese el codigo de verificacion"
              value={captchaInput}
              onChange={(e) => setCaptchaInput(e.target.value)}
            />
            <button type="submit">Iniciar Sesión</button>
            {loginError && <div className="error">{loginError}</div>}
          </form>
        </div>
      </div>
    );
  }

  const rows = activeTab === "BUSCADOR" ? globalRows : tipoRows;
  const currentPagination = paginationByTab[activeTab] || { page: 1, pageSize: 20 };
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / currentPagination.pageSize));
  const safePage = Math.min(currentPagination.page, totalPages);
  const from = (safePage - 1) * currentPagination.pageSize;
  const paginatedRows = rows.slice(from, from + currentPagination.pageSize);

  const sigiDepDisplayLabel =
    sigiDepOptions.find((o) => o.dependenciaId === user?.dependenciaId)?.label ||
    user?.dependencia ||
    "";
  const sigiLinePending =
    Boolean(user?.dni) && (multiDepGate === "loading" || multiDepGate === null);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-brand">
          <img
            src="/app-icon.png"
            alt="Poder Judicial del Chaco"
            className="topbar-logo"
          />
          <div className="topbar-user">
            <strong>{displayName}</strong> ({displayUser}) — rol {user?.rol}
            <span className="topbar-meta-sep"> · </span>
            <span>Fuero: <em>{activeFuero}</em></span>
            <span className="topbar-meta-sep"> · </span>
            <span
              className="topbar-dependencia"
              title="Integración por fuero/sistema según la dependencia activa del usuario."
            >
              {activeSistemaOrigen !== "SIGI" ? (
                <span className="topbar-muted">Sistema: {activeSistemaOrigen}</span>
              ) : !user?.dni ? (
                <>Dep. activa:{" "}
                <span className="topbar-muted">sin DNI en el perfil</span>
                </>
              ) : sigiLinePending ? (
                <>Dep. activa:{" "}
                <span className="topbar-muted">consultando SIGI…</span>
                </>
              ) : sigiDepDisplayLabel ? (
                <>Dep. activa:{" "}
                <em>{sigiDepDisplayLabel}</em>
                </>
              ) : (
                <>Dep. activa:{" "}
                <span className="topbar-muted">sin datos SIGI</span>
                </>
              )}
            </span>
            {sigiDepOptions.length >= 1 && multiDepGate === "ready" && (
              <label className="topbar-actuar-dep">
                  Actuar en{" "}
                  <select
                    className="topbar-dep-select"
                    value={user.dependenciaId}
                    onChange={async (e) => {
                      const id = Number(e.target.value);
                      if (id === user.dependenciaId) return;
                      try {
                        await applySwitchDependencia(id);
                        await refreshCurrentView();
                      } catch (err) {
                        window.alert(
                          err.response?.data?.message || "No se pudo cambiar de dependencia"
                        );
                      }
                    }}
                  >
                    {sigiDepOptions.map((o) => (
                      <option key={o.dependenciaId} value={o.dependenciaId}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
            )}
          </div>
        </div>
        <div className="topbar-actions">
          <button onClick={refreshCurrentView}>Refrescar</button>
          <button onClick={doLogout}>Salir</button>
        </div>
      </header>

      <nav className="tabs">
        {TAB_KEYS.map((tab) => (
          <button
            key={tab}
            className={tab === activeTab ? "active" : ""}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      <main className="content">
        {!dataSessionReady && token && user && multiDepGate !== "choose" && (
          <section className="card session-gate-card">
            <p>Consultando SIGI y sincronizando dependencias…</p>
          </section>
        )}
        {!dataSessionReady && multiDepGate === "choose" && (
          <section className="card session-gate-card">
            <p>Seleccioná en cuál dependencia querés operar (diálogo en pantalla).</p>
          </section>
        )}
        {dataSessionReady && (
          <>
        {TYPES.includes(activeTab) && (
          <section className="card">
            <h2>{activeTab}</h2>
            <p>Proximo numero: {nextNumber ?? "-"}</p>
            <form className="form-row" onSubmit={createRecord}>
              <input
                placeholder="Expediente"
                value={formByType[activeTab].expediente}
                onChange={(e) =>
                  setFormByType((p) => ({
                    ...p,
                    [activeTab]: {
                      ...p[activeTab],
                      expediente: normalizeExpedienteInput(e.target.value),
                    },
                  }))
                }
                maxLength={50}
                inputMode="text"
                pattern="^\d{1,8}/\d{4}-\d{1,4}$"
                title="Formato: N°/aaaa-circ (ej. 12345/2026-1 o 3500384/2026-91)"
              />
              <select
                value={formByType[activeTab].detalleSelect}
                onChange={(e) =>
                  setFormByType((p) => ({
                    ...p,
                    [activeTab]: { ...p[activeTab], detalleSelect: e.target.value },
                  }))
                }
              >
                <option value="">Seleccione detalle</option>
                {categoryOptions.map((o) => (
                  <option key={o.label} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {formByType[activeTab].detalleSelect === "__OTROS__" && (
                <input
                  placeholder="Especificar detalle"
                  value={formByType[activeTab].detalleOtro}
                  onChange={(e) =>
                    setFormByType((p) => ({
                      ...p,
                      [activeTab]: { ...p[activeTab], detalleOtro: e.target.value },
                    }))
                  }
                />
              )}
              <button
                type="button"
                className="secondary icon-form-clear"
                onClick={clearCurrentTipoForm}
                title="Limpiar expediente, detalle y filtro de búsqueda"
                aria-label="Limpiar expediente, detalle y filtro de búsqueda"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                  <line x1="18" y1="9" x2="12" y2="15" />
                  <line x1="12" y1="9" x2="18" y2="15" />
                </svg>
              </button>
              <button type="submit">Guardar</button>
            </form>
            <div className="form-row wrap sigi-search-row">
              <input
                className="sigi-search-input"
                placeholder="Filtrar registros o expediente para SIGI (ej. 3500384/2026-91)"
                value={tipoSearch}
                onChange={(e) => setTipoSearch(e.target.value)}
              />
              <button type="button" onClick={() => loadTipoRows(activeTab, tipoSearch)}>
                Buscar
              </button>
              <button type="button" className="secondary" onClick={consultarSigiExpediente}>
                Consultar SIGI
              </button>
            </div>
            {(sigiExpediente.queried || sigiExpediente.error) && (
              <div className="sigi-panel">
                <div className="sigi-panel-head">
                  <strong>SIGI — expediente</strong>
                  {sigiExpediente.queried ? (
                    <span className="sigi-panel-nro">{sigiExpediente.queried}</span>
                  ) : null}
                  <button
                    type="button"
                    className="sigi-panel-close"
                    onClick={() => {
                      setSigiExpediente({ loading: false, error: "", data: null, queried: "" });
                      setSigiExpedienteSelectedIdx(null);
                    }}
                  >
                    Cerrar
                  </button>
                </div>
                {sigiExpediente.loading && <p className="sigi-panel-muted">Consultando…</p>}
                {!sigiExpediente.loading && sigiExpediente.error && (
                  <p className="sigi-panel-error">{sigiExpediente.error}</p>
                )}
                {!sigiExpediente.loading && sigiExpediente.data && (
                  <>
                    {Array.isArray(sigiExpediente.data.recordset) &&
                    sigiExpediente.data.recordset.length > 0 ? (
                      <div className="sigi-table-wrap">
                        {sigiAllowedCodDepTokens.length === 0 && !String(sigiDependenciaNombre).trim() ? (
                          <p className="sigi-panel-error">
                            No hay criterio de dependencia para tu sesión: hace falta DNI (SP usuario SIGI)
                            y/o <code>cod_dep_sigi</code> en la dependencia activa, o un nombre de
                            dependencia válido en el Numerador.
                          </p>
                        ) : (
                          sigiExpediente.data.recordset.some(
                            (r) =>
                              !expedienteRowMatchesAllowedTokens(
                                r,
                                sigiAllowedCodDepTokens,
                                sigiDependenciaNombre
                              )
                          ) && (
                            <p className="sigi-panel-hint-dep">
                              Se listan todas las filas que devolvió SIGI. <strong>Usar expediente</strong>{" "}
                              solo aplica a la dependencia activa; en el resto el botón aparece atenuado y
                              al pulsarlo se explica que no corresponde a tu dependencia.
                            </p>
                          )
                        )}
                        <table className="sigi-table">
                          <thead>
                            <tr>
                              <th className="sigi-col-action">Formulario</th>
                              {Object.keys(sigiExpediente.data.recordset[0]).map((k) => (
                                <th key={k}>{k}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {sigiExpediente.data.recordset.map((row, idx) => {
                              const keys = Object.keys(sigiExpediente.data.recordset[0]);
                              const coincideDepActiva = expedienteRowMatchesAllowedTokens(
                                row,
                                sigiAllowedCodDepTokens,
                                sigiDependenciaNombre
                              );
                              return (
                                <tr
                                  key={idx}
                                  className={
                                    idx === sigiExpedienteSelectedIdx ? "sigi-row-selected" : ""
                                  }
                                >
                                  <td className="sigi-col-action">
                                    <button
                                      type="button"
                                      className={`sigi-row-use${
                                        !coincideDepActiva ? " sigi-row-use-blocked" : ""
                                      }`}
                                      title={
                                        coincideDepActiva
                                          ? "Cargar este expediente en el formulario"
                                          : MSG_SIGI_FILA_OTRA_DEPENDENCIA
                                      }
                                      onClick={() => {
                                        if (!coincideDepActiva) {
                                          window.alert(MSG_SIGI_FILA_OTRA_DEPENDENCIA);
                                          return;
                                        }
                                        usarExpedienteSigiEnFormulario(row, idx);
                                      }}
                                    >
                                      Usar expediente
                                    </button>
                                  </td>
                                  {keys.map((k) => (
                                    <td key={k}>
                                      {row[k] === null || row[k] === undefined
                                        ? ""
                                        : String(row[k])}
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p
                        className={
                          sigiExpediente.data.message
                            ? "sigi-panel-error"
                            : "sigi-panel-muted"
                        }
                      >
                        {sigiExpediente.data.message ||
                          "Sin filas (recordset vacío)."}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </section>
        )}

        {activeTab === "BUSCADOR" && (
          <section className="card">
            <h2>Buscador Global</h2>
            <div className="form-row wrap">
              <input
                placeholder="Texto"
                value={globalFilters.q}
                onChange={(e) => setGlobalFilters((p) => ({ ...p, q: e.target.value }))}
              />
              <select
                value={globalFilters.tipo}
                onChange={(e) => setGlobalFilters((p) => ({ ...p, tipo: e.target.value }))}
              >
                <option value="TODOS">TODOS</option>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={globalFilters.from}
                onChange={(e) => setGlobalFilters((p) => ({ ...p, from: e.target.value }))}
              />
              <input
                type="date"
                value={globalFilters.to}
                onChange={(e) => setGlobalFilters((p) => ({ ...p, to: e.target.value }))}
              />
              <button onClick={loadGlobalRows}>Buscar</button>
              <button onClick={exportBuscadorExcel}>Exportar Excel</button>
            </div>
          </section>
        )}

        {activeTab === "ESTADISTICAS" && (
          <section className="card">
            <h2>Estadisticas</h2>
            <div className="form-row">
              <input
                type="number"
                value={statsYear}
                onChange={(e) => setStatsYear(Number(e.target.value))}
              />
              <button onClick={loadStats}>Cargar</button>
            </div>
            <div className="grid-4">
              {TYPES.map((t) => {
                const row = stats.totals.find((x) => x.tipo === t);
                return (
                  <div key={t} className="card">
                    <strong>{t}</strong>
                    <div className="big">{row?.total || 0}</div>
                  </div>
                );
              })}
            </div>
            <h3>Ranking de detalles</h3>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Detalle</th>
                  <th>Tipo</th>
                  <th>Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {stats.ranking.map((r, idx) => (
                  <tr key={`${r.detalle}-${idx}`}>
                    <td>{idx + 1}</td>
                    <td>{r.detalle}</td>
                    <td>{r.tipo}</td>
                    <td>{r.cantidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {activeTab === "CATALOGO" && user?.rol === "admin" && (
          <section className="card">
            <h2>Catálogo de Recaudos</h2>
            <p>Administrá tipos, categorías y opciones del detalle desplegable.</p>
            {catalogoLoading && <p>Cargando catálogo...</p>}
            {catalogoError && <p className="error">{catalogoError}</p>}
            {!catalogoLoading && catalogo.map((tipo) => (
              <div key={tipo.id} className="catalogo-tipo">
                <h3>{tipo.nombre} <small>({tipo.codigo})</small></h3>
                <div className="form-row">
                  <input
                    placeholder="Nueva categoría"
                    value={newCategoriaByTipo[tipo.id] || ""}
                    onChange={(e) =>
                      setNewCategoriaByTipo((prev) => ({ ...prev, [tipo.id]: e.target.value }))
                    }
                  />
                  <button type="button" onClick={() => addCategoria(tipo.id)}>Agregar categoría</button>
                </div>
                {(tipo.categorias || []).map((cat) => (
                  <div key={cat.id} className="catalogo-categoria">
                    <div className="catalogo-row">
                      <strong>{cat.nombre}</strong>
                      <button type="button" className="secondary" onClick={() => editCategoria(cat)}>
                        Editar categoría
                      </button>
                    </div>
                    <div className="form-row">
                      <input
                        placeholder="Nueva opción"
                        value={newOpcionByCategoria[cat.id] || ""}
                        onChange={(e) =>
                          setNewOpcionByCategoria((prev) => ({ ...prev, [cat.id]: e.target.value }))
                        }
                      />
                      <button type="button" onClick={() => addOpcion(cat.id)}>Agregar opción</button>
                    </div>
                    <ul className="catalogo-opciones">
                      {(cat.opciones || []).map((op) => (
                        <li key={op.id}>
                          <span>{op.nombre}</span>
                          <button type="button" className="secondary" onClick={() => editOpcion(op)}>
                            Editar
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </section>
        )}
        {activeTab === "CATALOGO" && user?.rol !== "admin" && (
          <section className="card">
            <h2>Catálogo de Recaudos</h2>
            <p>No autorizado: esta sección es solo para administradores.</p>
          </section>
        )}

        <section className="card">
          <h3>Registros</h3>
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Numero</th>
                <th>Expediente</th>
                <th>Detalle</th>
                <th>Remitido</th>
                <th>Fecha</th>
                <th>Usuario</th>
                <th>Motivo anulación</th>
                <th>Observación</th>
                <th>Anulado por</th>
                <th>Fecha anulación</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((row) => {
                const fueraDePlazoAnular = isPastAnnulDeadline(row, annulMaxHoursAfterCreate);
                return (
                <tr key={row.id} className={row.expediente === "ANULADO" ? "anulado" : ""}>
                  <td>{row.tipo}</td>
                  <td>{row.numero}/{row.anio}</td>
                  <td>{row.expediente}</td>
                  <td>{row.detalle}</td>
                  <td>{row.remitido ? "SI" : "-"}</td>
                  <td>{fmtDate(row.fecha)}</td>
                  <td>{row.usuario}</td>
                  <td>{row.anulacion_motivo || "—"}</td>
                  <td className="cell-wrap">{row.anulacion_observacion || "—"}</td>
                  <td>{row.anulado_por || "—"}</td>
                  <td>{row.anulacion_fecha ? fmtDate(row.anulacion_fecha) : "—"}</td>
                  <td className="actions">
                    {row.expediente !== "ANULADO" && (
                      <>
                        <button type="button" onClick={() => actionEdit(row)}>
                          Modificar
                        </button>
                        <button
                          type="button"
                          disabled={fueraDePlazoAnular}
                          title={
                            fueraDePlazoAnular
                              ? `Plazo vencido: solo se puede anular dentro de las ${annulMaxHoursAfterCreate} h. desde la creación del recaudo.`
                              : undefined
                          }
                          onClick={() => openAnnulModal(row)}
                        >
                          Anular
                        </button>
                        {row.tipo === "OFICIO" && (
                          <button type="button" onClick={() => actionToggleRemitido(row)}>
                            Remitido
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          <div className="pagination-bar">
            <div className="pagination-info">
              Mostrando{" "}
              {totalRows === 0 ? 0 : (safePage - 1) * currentPagination.pageSize + 1}
              {" - "}
              {Math.min(safePage * currentPagination.pageSize, totalRows)} de {totalRows}
            </div>
            <div className="pagination-actions">
              <label htmlFor="page-size-select">Registros:</label>
              <select
                id="page-size-select"
                value={currentPagination.pageSize}
                onChange={(e) => {
                  const pageSize = Number(e.target.value);
                  setPaginationByTab((prev) => ({
                    ...prev,
                    [activeTab]: {
                      ...(prev[activeTab] || { page: 1, pageSize: 20 }),
                      page: 1,
                      pageSize,
                    },
                  }));
                }}
              >
                {PAGE_SIZE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  setPaginationByTab((prev) => ({
                    ...prev,
                    [activeTab]: {
                      ...(prev[activeTab] || { page: 1, pageSize: 20 }),
                      page: Math.max(1, safePage - 1),
                    },
                  }))
                }
                disabled={safePage <= 1}
              >
                Anterior
              </button>
              <span className="pagination-page">
                Página {safePage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() =>
                  setPaginationByTab((prev) => ({
                    ...prev,
                    [activeTab]: {
                      ...(prev[activeTab] || { page: 1, pageSize: 20 }),
                      page: Math.min(totalPages, safePage + 1),
                    },
                  }))
                }
                disabled={safePage >= totalPages}
              >
                Siguiente
              </button>
            </div>
          </div>
        </section>
          </>
        )}
      </main>

      {annulModalRow && (
        <div
          className="dep-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="annul-modal-title"
        >
          <div className="dep-modal annul-modal">
            <h2 id="annul-modal-title">
              Anular {annulModalRow.tipo} N° {annulModalRow.numero}/{annulModalRow.anio}
            </h2>
            <p className="dep-modal-hint">
              Indique el motivo y, si corresponde, una observación. Quedará registrado quien anula el
              recaudo.
            </p>
            <label className="annul-modal-label" htmlFor="annul-motivo">
              Motivo de anulación
            </label>
            <select
              id="annul-motivo"
              className="dep-modal-select"
              value={annulForm.motivo}
              onChange={(e) => setAnnulForm((p) => ({ ...p, motivo: e.target.value }))}
            >
              {MOTIVOS_ANULACION.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <label className="annul-modal-label" htmlFor="annul-obs">
              Observación
            </label>
            <textarea
              id="annul-obs"
              className="annul-modal-textarea"
              rows={4}
              maxLength={400}
              placeholder="Detalle adicional (obligatorio si el motivo es «Otro»)"
              value={annulForm.observacion}
              onChange={(e) => setAnnulForm((p) => ({ ...p, observacion: e.target.value }))}
            />
            <div className="annul-modal-actions">
              <button type="button" className="secondary" onClick={closeAnnulModal}>
                Cancelar
              </button>
              <button type="button" className="primary" onClick={submitAnnulacion}>
                Confirmar anulación
              </button>
            </div>
          </div>
        </div>
      )}

      {multiDepGate === "choose" && (
        <div
          className="dep-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dep-picker-title"
        >
          <div className="dep-modal">
            <h2 id="dep-picker-title">Elegí dependencia</h2>
            <p className="dep-modal-hint">
              Según SIGI tenés más de una dependencia asignada. Elegí en cuál querés cargar y ver los
              datos del Numerador.
            </p>
            <select
              className="dep-modal-select"
              value={depPickerChoice ?? ""}
              onChange={(e) => setDepPickerChoice(Number(e.target.value))}
            >
              {sigiDepOptions.map((o) => (
                <option key={o.dependenciaId} value={o.dependenciaId}>
                  {o.label}
                </option>
              ))}
            </select>
            <button type="button" className="primary dep-modal-submit" onClick={confirmDepPicker}>
              Continuar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
