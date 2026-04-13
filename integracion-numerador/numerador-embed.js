/**
 * Numerador — integración embebida para otras aplicaciones.
 * No modifica el proyecto principal: copiá esta carpeta o serví estos archivos estáticos.
 *
 * Uso:
 *   NumeradorEmbed.open({
 *     apiBaseUrl: 'http://localhost:4000/api',
 *     accessToken: '<JWT del usuario en Numerador>',
 *     usuario: 'Apellido, Nombre',
 *     dependencia: 'Texto de la dependencia',
 *     expediente: '12345/2026-1',
 *     onSuccess: (res) => {},
 *     onClose: () => {},
 *   });
 *
 * El JWT debe incluir nombre, dependenciaId y dependencia coherentes con el numerador;
 * usuario/dependencia mostrados son informativos (los envía la app anfitriona).
 */
(function (global) {
  "use strict";

  var TYPES = [
    "OFICIO",
    "AUTO",
    "SENTENCIA TRAMITE",
    "SENTENCIA RELATORIA",
  ];

  var EXPEDIENTE_REGEX = /^\d{1,8}\/\d{4}-\d{1,4}$/;

  function normalizeApiBase(url) {
    var s = String(url || "").replace(/\/+$/, "");
    if (!s) return "/api";
    return s;
  }

  function normalizeExpedienteInput(rawValue) {
    var cleaned = String(rawValue || "").replace(/[^\d/-]/g, "");
    var left = "";
    var year = "";
    var circ = "";
    var stage = 0;
    for (var i = 0; i < cleaned.length; i++) {
      var ch = cleaned[i];
      if (stage === 0) {
        if (/\d/.test(ch) && left.length < 8) left += ch;
        else if (ch === "/" && left.length > 0) stage = 1;
        continue;
      }
      if (stage === 1) {
        if (/\d/.test(ch) && year.length < 4) year += ch;
        else if (ch === "-" && year.length === 4) stage = 2;
        continue;
      }
      if (stage === 2) {
        if (/\d/.test(ch) && circ.length < 4) circ += ch;
      }
    }
    var result = left;
    if (stage >= 1 || year.length > 0) result += "/" + year;
    if (stage >= 2 || circ.length > 0) result += "-" + circ;
    return result;
  }

  function buildCategoryOptions(activeTab, categorias) {
    var catByType = categorias && categorias[activeTab];
    if (!catByType || typeof catByType !== "object") return [];
    var opts = [];
    Object.keys(catByType).forEach(function (categoria) {
      var subs = catByType[categoria];
      if (!subs || !subs.length) {
        opts.push({
          value: activeTab === "OFICIO" ? "Of. " + categoria : categoria,
          label: categoria,
        });
      } else {
        for (var j = 0; j < subs.length; j++) {
          var sub = subs[j];
          opts.push({
            value:
              activeTab === "OFICIO"
                ? "Of. " + categoria + " (" + sub + ")"
                : categoria + " (" + sub + ")",
            label: categoria + " → " + sub,
          });
        }
      }
    });
    opts.push({ value: "__OTROS__", label: "OTROS (especificar)" });
    return opts;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function apiFetch(apiBase, token, path, options) {
    var opts = options || {};
    var headers = Object.assign(
      { Accept: "application/json", Authorization: "Bearer " + token },
      opts.headers || {}
    );
    if (opts.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    return fetch(apiBase + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body,
      credentials: opts.credentials || "omit",
    }).then(function (res) {
      var ct = res.headers.get("content-type") || "";
      var isJson = ct.indexOf("application/json") !== -1;
      return (isJson ? res.json() : res.text()).then(function (data) {
        if (!res.ok) {
          var err = new Error(
            (data && data.message) || res.statusText || "Error de red"
          );
          err.status = res.status;
          err.body = data;
          throw err;
        }
        return data;
      });
    });
  }

  var openState = null;

  function destroy() {
    if (openState && openState.root && openState.root.parentNode) {
      openState.root.parentNode.removeChild(openState.root);
    }
    openState = null;
  }

  function open(config) {
    if (!config || !config.accessToken) {
      throw new Error("NumeradorEmbed.open: accessToken es obligatorio");
    }
    var apiBase = normalizeApiBase(config.apiBaseUrl);
    var token = config.accessToken;
    var usuario = config.usuario || "";
    var dependencia = config.dependencia || "";
    var expedienteInicial = config.expediente != null ? String(config.expediente) : "";

    destroy();

    var root = document.createElement("div");
    root.className = "numerador-embed-overlay";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "numerador-embed-title");

    root.innerHTML =
      '<div class="numerador-embed-dialog">' +
      '<div class="numerador-embed-header">' +
      '<div>' +
      '<h2 id="numerador-embed-title">Numerador</h2>' +
      '<p class="numerador-embed-meta">' +
      esc(usuario) +
      (dependencia ? " · " + esc(dependencia) : "") +
      "</p>" +
      "</div>" +
      '<button type="button" class="numerador-embed-close" aria-label="Cerrar" title="Cerrar">×</button>' +
      "</div>" +
      '<div class="numerador-embed-body">' +
      '<div id="ne-form-panel">' +
      '<div class="numerador-embed-field">' +
      '<label for="ne-tipo">Tipo</label>' +
      '<select id="ne-tipo"></select>' +
      "</div>" +
      '<div class="numerador-embed-field">' +
      '<label for="ne-proximo">Próximo número</label>' +
      '<input id="ne-proximo" type="text" readonly class="numerador-embed-proximo" value="—" />' +
      "</div>" +
      '<div class="numerador-embed-field">' +
      '<label for="ne-expediente">Expediente</label>' +
      '<input id="ne-expediente" type="text" maxlength="50" inputmode="text" />' +
      "</div>" +
      '<div class="numerador-embed-field">' +
      '<label for="ne-detalle">Detalle</label>' +
      '<select id="ne-detalle"><option value="">Seleccione detalle</option></select>' +
      "</div>" +
      '<div class="numerador-embed-field" id="ne-otros-wrap" style="display:none">' +
      '<label for="ne-detalle-otro">Especificar detalle</label>' +
      '<input id="ne-detalle-otro" type="text" maxlength="500" />' +
      "</div>" +
      '<div class="numerador-embed-actions">' +
      '<button type="button" class="numerador-embed-btn-primary" id="ne-guardar">Guardar</button>' +
      "</div>" +
      '<div id="ne-msg" style="display:none" class="numerador-embed-msg"></div>' +
      "</div>" +
      '<div id="ne-success-panel" class="numerador-embed-success-panel" style="display:none">' +
      '<p class="numerador-embed-success-title">Registro guardado</p>' +
      '<p class="numerador-embed-success-lead">Se grabó correctamente con los siguientes datos:</p>' +
      '<dl class="numerador-embed-success-dl">' +
      "<dt>Tipo</dt><dd id=\"ne-s-tipo\"></dd>" +
      "<dt>Número</dt><dd id=\"ne-s-numero\"></dd>" +
      "<dt>Expediente</dt><dd id=\"ne-s-expediente\"></dd>" +
      "<dt>Detalle</dt><dd id=\"ne-s-detalle\"></dd>" +
      "</dl>" +
      '<div class="numerador-embed-actions numerador-embed-success-actions">' +
      '<button type="button" class="numerador-embed-btn-primary" id="ne-success-cerrar">Cerrar</button>' +
      "</div>" +
      "</div>" +
      "</div>" +
      "</div>";

    document.body.appendChild(root);

    var elTipo = root.querySelector("#ne-tipo");
    var elProximo = root.querySelector("#ne-proximo");
    var elExpediente = root.querySelector("#ne-expediente");
    var elDetalle = root.querySelector("#ne-detalle");
    var elOtrosWrap = root.querySelector("#ne-otros-wrap");
    var elDetalleOtro = root.querySelector("#ne-detalle-otro");
    var elGuardar = root.querySelector("#ne-guardar");
    var elMsg = root.querySelector("#ne-msg");
    var elFormPanel = root.querySelector("#ne-form-panel");
    var elSuccessPanel = root.querySelector("#ne-success-panel");
    var elSTipo = root.querySelector("#ne-s-tipo");
    var elSNumero = root.querySelector("#ne-s-numero");
    var elSExpediente = root.querySelector("#ne-s-expediente");
    var elSDetalle = root.querySelector("#ne-s-detalle");
    var btnSuccessCerrar = root.querySelector("#ne-success-cerrar");
    var btnClose = root.querySelector(".numerador-embed-close");

    TYPES.forEach(function (t) {
      var o = document.createElement("option");
      o.value = t;
      o.textContent = t;
      elTipo.appendChild(o);
    });

    elExpediente.value = normalizeExpedienteInput(expedienteInicial);

    elExpediente.addEventListener("input", function () {
      elExpediente.value = normalizeExpedienteInput(elExpediente.value);
    });

    var categorias = {};
    var currentNext = null;

    function setMsg(text, kind) {
      if (!text) {
        elMsg.style.display = "none";
        elMsg.textContent = "";
        elMsg.className = "numerador-embed-msg";
        return;
      }
      elMsg.style.display = "block";
      elMsg.textContent = text;
      elMsg.className = "numerador-embed-msg " + (kind === "ok" ? "ok" : "err");
    }

    function fillDetalleOptions(tipo) {
      elDetalle.innerHTML = "";
      var ph = document.createElement("option");
      ph.value = "";
      ph.textContent = "Seleccione detalle";
      elDetalle.appendChild(ph);
      buildCategoryOptions(tipo, categorias).forEach(function (opt) {
        var o = document.createElement("option");
        o.value = opt.value;
        o.textContent = opt.label;
        elDetalle.appendChild(o);
      });
      elDetalle.value = "";
      elDetalleOtro.value = "";
      elOtrosWrap.style.display = "none";
    }

    function onDetalleChange() {
      elOtrosWrap.style.display =
        elDetalle.value === "__OTROS__" ? "block" : "none";
    }
    elDetalle.addEventListener("change", onDetalleChange);

    function loadNext() {
      var tipo = elTipo.value;
      elProximo.value = "…";
      currentNext = null;
      setMsg("");
      return apiFetch(apiBase, token, "/records/next-number/" + encodeURIComponent(tipo))
        .then(function (data) {
          currentNext = data;
          elProximo.value =
            data.proximo != null && data.anio != null
              ? String(data.proximo) + "/" + String(data.anio)
              : "—";
        })
        .catch(function (err) {
          elProximo.value = "—";
          setMsg(err.message || "No se pudo obtener el próximo número", "err");
        });
    }

    elTipo.addEventListener("change", function () {
      fillDetalleOptions(elTipo.value);
      loadNext();
    });

    function close() {
      destroy();
      if (typeof config.onClose === "function") config.onClose();
    }

    btnClose.addEventListener("click", close);
    btnSuccessCerrar.addEventListener("click", close);
    root.addEventListener("click", function (e) {
      if (e.target === root) close();
    });

    elGuardar.addEventListener("click", function () {
      setMsg("");
      var tipo = elTipo.value;
      var ex = String(elExpediente.value || "").trim();
      var detalleSel = elDetalle.value;
      var detalle =
        detalleSel === "__OTROS__"
          ? String(elDetalleOtro.value || "").trim()
          : String(detalleSel || "").trim();

      if (!EXPEDIENTE_REGEX.test(ex)) {
        setMsg(
          "Expediente inválido. Formato N°/aaaa-circ (ej. 12345/2026-1).",
          "err"
        );
        return;
      }
      if (!detalle) {
        setMsg("Debe seleccionar o ingresar detalle.", "err");
        return;
      }

      elGuardar.disabled = true;
      apiFetch(apiBase, token, "/records", {
        method: "POST",
        body: JSON.stringify({ tipo: tipo, expediente: ex, detalle: detalle }),
      })
        .then(function (created) {
          var n = created.numero;
          var a = created.anio;
          elSTipo.textContent = tipo;
          elSNumero.textContent = "N° " + n + "/" + a;
          elSExpediente.textContent = ex;
          elSDetalle.textContent = detalle;
          elFormPanel.style.display = "none";
          elSuccessPanel.style.display = "block";
          try {
            btnSuccessCerrar.focus();
          } catch (e) {}
          if (typeof config.onSuccess === "function") {
            config.onSuccess(created);
          }
        })
        .catch(function (err) {
          setMsg(err.message || "No se pudo guardar", "err");
        })
        .finally(function () {
          elGuardar.disabled = false;
        });
    });

    openState = { root: root, close: close };

    apiFetch(apiBase, token, "/meta/categorias")
      .then(function (data) {
        categorias = data || {};
        fillDetalleOptions(elTipo.value);
        return loadNext();
      })
      .catch(function (err) {
        setMsg(
          err.message ||
            "No se pudieron cargar categorías. Verificá el token y la URL del API.",
          "err"
        );
      });

    return { close: close };
  }

  global.NumeradorEmbed = { open: open, close: function () { destroy(); } };
})(typeof window !== "undefined" ? window : this);
