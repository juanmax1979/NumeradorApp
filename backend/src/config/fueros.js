const FUEROS = {
  PENAL: "PENAL",
  CIVIL_Y_COMERCIAL: "CIVIL_Y_COMERCIAL",
  LABORAL: "LABORAL",
  FAMILIA: "FAMILIA",
  ADMINISTRATIVO: "ADMINISTRATIVO",
  PAZ_Y_FALTAS: "PAZ_Y_FALTAS",
};

const SISTEMAS = {
  SIGI: "SIGI",
  OTRO: "OTRO",
};

function normalizeFuero(value) {
  const raw = String(value || "").trim();
  if (!raw) return FUEROS.PENAL;
  const upper = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();

  const aliases = new Map([
    ["PENAL", FUEROS.PENAL],
    ["CIVIL", FUEROS.CIVIL_Y_COMERCIAL],
    ["CIVIL_Y_COMERCIAL", FUEROS.CIVIL_Y_COMERCIAL],
    ["COMERCIAL", FUEROS.CIVIL_Y_COMERCIAL],
    ["LABORAL", FUEROS.LABORAL],
    ["FAMILIA", FUEROS.FAMILIA],
    ["ADMINISTRATIVO", FUEROS.ADMINISTRATIVO],
    ["PAZ_Y_FALTAS", FUEROS.PAZ_Y_FALTAS],
    ["PAZ", FUEROS.PAZ_Y_FALTAS],
    ["FALTAS", FUEROS.PAZ_Y_FALTAS],
  ]);

  return aliases.get(upper) || upper;
}

function normalizeSistemaOrigen(value) {
  const raw = String(value || "").trim();
  if (!raw) return SISTEMAS.SIGI;
  const upper = raw.toUpperCase();
  if (upper === SISTEMAS.SIGI) return SISTEMAS.SIGI;
  return upper;
}

module.exports = {
  FUEROS,
  SISTEMAS,
  normalizeFuero,
  normalizeSistemaOrigen,
};
