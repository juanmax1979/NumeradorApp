function normalizeSystemCode(value) {
  return String(value || "SISTEMA").trim().toUpperCase();
}

function createStubController(systemCode) {
  const code = normalizeSystemCode(systemCode);

  return {
    async runUsuario(req, res) {
      return res.status(501).json({
        message: `Integración ${code} no implementada: endpoint usuario pendiente.`,
      });
    },
    async runExpediente(req, res) {
      return res.status(501).json({
        message: `Integración ${code} no implementada: endpoint expediente pendiente.`,
      });
    },
    async getAllowedTokens(req, res) {
      return res.json({
        tokens: [],
        dependenciaNombre: "",
        sistemaOrigen: code,
        message: `Integración ${code} no implementada: sin criterios de dependencia externos.`,
      });
    },
  };
}

module.exports = {
  createStubController,
};
