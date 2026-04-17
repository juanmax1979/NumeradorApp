/**
 * Horas máximas tras la creación en las que aún se permite anular un recaudo.
 * Variable de entorno ANNUL_MAX_HOURS_AFTER_CREATE (por defecto 48; p. ej. 24).
 */
function getAnnulMaxHoursAfterCreate() {
  const raw = process.env.ANNUL_MAX_HOURS_AFTER_CREATE;
  const n = Number(String(raw ?? "").replace(",", ".").trim());
  if (Number.isFinite(n) && n > 0 && n <= 720) {
    return n;
  }
  return 48;
}

module.exports = { getAnnulMaxHoursAfterCreate };
