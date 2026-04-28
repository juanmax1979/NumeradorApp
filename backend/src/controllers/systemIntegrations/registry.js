const { SISTEMAS } = require("../../config/fueros");
const sigiController = require("./sigiSystemController");
const { createStubController } = require("./stubSystemController");

const DEFAULT_SYSTEM = SISTEMAS.SIGI;

const registry = new Map([
  [SISTEMAS.SIGI, sigiController],

  // Skeletons listos para conectar cuando estén los endpoints reales.
  ["SISTEMA_CIVIL_COMERCIAL", createStubController("SISTEMA_CIVIL_COMERCIAL")],
  ["SISTEMA_LABORAL", createStubController("SISTEMA_LABORAL")],
  ["SISTEMA_FAMILIA", createStubController("SISTEMA_FAMILIA")],
  ["SISTEMA_ADMINISTRATIVO", createStubController("SISTEMA_ADMINISTRATIVO")],
  ["SISTEMA_PAZ_FALTAS", createStubController("SISTEMA_PAZ_FALTAS")],
]);

function normalizeSystem(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return DEFAULT_SYSTEM;
  return raw;
}

function getSystemController(systemCode) {
  const code = normalizeSystem(systemCode);
  return registry.get(code) || createStubController(code);
}

module.exports = {
  DEFAULT_SYSTEM,
  getSystemController,
  normalizeSystem,
};
