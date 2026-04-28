const { getSystemController, normalizeSystem } = require("./systemIntegrations/registry");

function resolveSystemFromRequest(req) {
  const fromParam = req.params?.sistema;
  if (fromParam != null && String(fromParam).trim() !== "") {
    return normalizeSystem(fromParam);
  }
  return normalizeSystem(req.user?.sistemaOrigen);
}

async function runUsuarioBySystem(req, res, next) {
  try {
    const systemCode = resolveSystemFromRequest(req);
    const controller = getSystemController(systemCode);
    return controller.runUsuario(req, res, next);
  } catch (error) {
    return next(error);
  }
}

async function runExpedienteBySystem(req, res, next) {
  try {
    const systemCode = resolveSystemFromRequest(req);
    const controller = getSystemController(systemCode);
    return controller.runExpediente(req, res, next);
  } catch (error) {
    return next(error);
  }
}

async function getAllowedTokensBySystem(req, res, next) {
  try {
    const systemCode = resolveSystemFromRequest(req);
    const controller = getSystemController(systemCode);
    return controller.getAllowedTokens(req, res, next);
  } catch (error) {
    return next(error);
  }
}

function getSessionIntegrationContext(req, res) {
  return res.json({
    fuero: String(req.user?.fuero || "PENAL").trim().toUpperCase(),
    sistemaOrigen: resolveSystemFromRequest(req),
  });
}

module.exports = {
  runUsuarioBySystem,
  runExpedienteBySystem,
  getAllowedTokensBySystem,
  getSessionIntegrationContext,
};
