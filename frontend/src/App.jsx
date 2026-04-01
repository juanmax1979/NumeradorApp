import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import api, { setAuthToken, setOnAuthFailure } from "./api";

const TYPES = [
  "OFICIO",
  "AUTO",
  "SENTENCIA TRAMITE",
  "SENTENCIA RELATORIA",
];

const TAB_KEYS = [...TYPES, "BUSCADOR", "ESTADISTICAS"];
const CAPTCHA_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PAGE_SIZE_OPTIONS = [10, 20, 50];

function fmtDate(value) {
  if (!value) return "-";
  return dayjs(value).format("DD/MM/YYYY HH:mm");
}

const EXPEDIENTE_REGEX = /^\d{1,5}\/\d{4}-\d$/;

function normalizeExpedienteInput(rawValue) {
  const cleaned = String(rawValue || "").replace(/[^\d/-]/g, "");
  let left = "";
  let year = "";
  let circ = "";
  let stage = 0; // 0: numero, 1: anio, 2: circunscripcion

  for (const ch of cleaned) {
    if (stage === 0) {
      if (/\d/.test(ch) && left.length < 5) {
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
      if (/\d/.test(ch) && circ.length < 1) {
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
  const [paginationByTab, setPaginationByTab] = useState(() =>
    Object.fromEntries(
      TAB_KEYS.map((tab) => [tab, { page: 1, pageSize: 20 }])
    )
  );

  function localLogout() {
    setToken("");
    setUser(null);
    setAuthToken("");
    localStorage.removeItem("numerador_token");
    localStorage.removeItem("numerador_user");
  }

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  useEffect(() => {
    setOnAuthFailure(localLogout);
    return () => setOnAuthFailure(() => {});
  }, []);

  useEffect(() => {
    if (!token) return;
    loadCategorias();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (!TYPES.includes(activeTab)) return;
    loadTipoRows(activeTab, tipoSearch);
    loadNextNumber(activeTab);
  }, [activeTab, token]);

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
    const { data } = await api.get("/meta/categorias");
    setCategorias(data);
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
      return alert("Expediente inválido. Formato obligatorio: hasta 5 dígitos + '/' + 4 dígitos + '-' + 1 dígito (ej: 12345/2026-1)");
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

  async function actionEdit(row) {
    const expediente = prompt("Nuevo expediente (formato 12345/2026-1):", row.expediente);
    if (!expediente) return;
    if (!isValidExpediente(expediente)) {
      alert("Expediente inválido. Formato obligatorio: hasta 5 dígitos + '/' + 4 dígitos + '-' + 1 dígito.");
      return;
    }
    const detalle = prompt("Nuevo detalle:", row.detalle || "");
    if (detalle === null) return;
    await api.put(`/records/${row.id}`, { expediente: expediente.trim(), detalle });
    await refreshCurrentView();
  }

  async function actionAnnul(row) {
    if (!confirm(`¿Anular ${row.tipo} N° ${row.numero}?`)) return;
    await api.post(`/records/${row.id}/annul`);
    await refreshCurrentView();
  }

  async function actionDelete(row) {
    if (!confirm(`¿Borrar DEFINITIVAMENTE ${row.tipo} N° ${row.numero}?`)) return;
    await api.delete(`/records/${row.id}`);
    await refreshCurrentView();
  }

  async function actionToggleRemitido(row) {
    await api.post(`/records/${row.id}/toggle-remitido`);
    await refreshCurrentView();
  }

  async function refreshCurrentView() {
    if (TYPES.includes(activeTab)) {
      await loadTipoRows(activeTab, tipoSearch);
      await loadNextNumber(activeTab);
      return;
    }
    if (activeTab === "BUSCADOR") await loadGlobalRows();
    if (activeTab === "ESTADISTICAS") await loadStats();
  }

  async function adminSetDependencia() {
    if (user?.rol !== "admin") return;
    const [{ data: users }, { data: dependencias }] = await Promise.all([
      api.get("/users"),
      api.get("/meta/dependencias"),
    ]);

    const listado = users
      .map((u) => `${u.nombreCompleto || u.nombre} (${u.usuario || u.nombre}) [${u.dependencia || "GENERAL"}]`)
      .join("\n");
    const nombre = prompt(`Usuarios disponibles:\n\n${listado}\n\nUsuario a cambiar de dependencia:`);
    if (!nombre) return;

    const depsTxt = dependencias
      .filter((d) => d.activa)
      .map((d) => `${d.id} - ${d.nombre}`)
      .join("\n");
    const dependenciaIdTxt = prompt(
      `Dependencias disponibles (ingresar ID):\n\n${depsTxt}\n\nNueva dependencia para ${nombre}:`
    );
    const dependenciaId = Number(dependenciaIdTxt);
    if (!Number.isInteger(dependenciaId) || dependenciaId <= 0) return;

    await api.put(`/users/${encodeURIComponent(nombre)}/dependencia`, { dependenciaId });
    alert("Dependencia actualizada");
  }

  async function adminSetDni() {
    if (user?.rol !== "admin") return;
    const { data: users } = await api.get("/users");
    const listado = users
      .map((u) => `${u.nombreCompleto || u.nombre} (${u.usuario || u.nombre}) [DNI: ${u.dni || "-"}]`)
      .join("\n");
    const nombre = prompt(`Usuarios disponibles:\n\n${listado}\n\nUsuario a cargar DNI:`);
    if (!nombre) return;

    const current = users.find((u) => u.nombre === nombre)?.dni || "";
    const dni = prompt(
      `DNI para ${nombre} (solo numeros). Dejar vacio para limpiar:`,
      current
    );
    if (dni === null) return;
    if (dni.trim() && !/^\d+$/.test(dni.trim())) {
      alert("El DNI debe contener solo numeros");
      return;
    }

    await api.put(`/users/${encodeURIComponent(nombre)}/dni`, { dni: dni.trim() });
    alert("DNI actualizado");
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
            <strong>{displayName}</strong> ({displayUser}) - ({user?.rol}) - {user?.dependencia || "GENERAL"}
          </div>
        </div>
        <div className="topbar-actions">
          {user?.rol === "admin" && <button onClick={adminSetDependencia}>Set Dependencia</button>}
          {user?.rol === "admin" && <button onClick={adminSetDni}>Set DNI</button>}
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
                maxLength={12}
                inputMode="numeric"
                pattern="^\d{1,5}/\d{4}-\d$"
                title="Formato: hasta 5 dígitos + '/' + 4 dígitos + '-' + 1 dígito (ej: 12345/2026-1)"
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
              <button type="submit">Guardar</button>
            </form>
            <div className="form-row">
              <input
                placeholder="Filtrar"
                value={tipoSearch}
                onChange={(e) => setTipoSearch(e.target.value)}
              />
              <button onClick={() => loadTipoRows(activeTab, tipoSearch)}>Buscar</button>
            </div>
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
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((row) => (
                <tr key={row.id} className={row.expediente === "ANULADO" ? "anulado" : ""}>
                  <td>{row.tipo}</td>
                  <td>{row.numero}/{row.anio}</td>
                  <td>{row.expediente}</td>
                  <td>{row.detalle}</td>
                  <td>{row.remitido ? "SI" : "-"}</td>
                  <td>{fmtDate(row.fecha)}</td>
                  <td>{row.usuario}</td>
                  <td className="actions">
                    <button onClick={() => actionEdit(row)}>Modificar</button>
                    <button onClick={() => actionAnnul(row)}>Anular</button>
                    {row.tipo === "OFICIO" && (
                      <button onClick={() => actionToggleRemitido(row)}>Remitido</button>
                    )}
                    {user?.rol === "admin" && (
                      <button className="danger" onClick={() => actionDelete(row)}>
                        Borrar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
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
      </main>
    </div>
  );
}

export default App;
