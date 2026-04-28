const {
  runSigiUsuarioPorDni,
  runSigiExpediente,
  getSigiAllowedCodDepTokens,
} = require("../sigiController");

module.exports = {
  runUsuario: runSigiUsuarioPorDni,
  runExpediente: runSigiExpediente,
  getAllowedTokens: getSigiAllowedCodDepTokens,
};
