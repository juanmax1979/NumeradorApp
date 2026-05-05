const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { runQuery } = require("../config/db");

function dniForJwtPayload(user) {
  const raw = user?.dni;
  if (raw == null || raw === "") return undefined;
  const n =
    typeof raw === "number" && Number.isInteger(raw)
      ? raw
      : parseInt(String(raw).trim(), 10);
  if (!Number.isInteger(n) || n < 0 || n > 2147483647) return undefined;
  return n;
}

function signAccessToken(user) {
  const rolId = Number(user.rol_id);
  const rolName = String(user.rol || "").trim().toLowerCase();
  const payload = {
    nombre: user.nombre,
    rol: rolName || "user",
    rolId: Number.isInteger(rolId) && rolId > 0 ? rolId : undefined,
    dependencia: user.dependencia,
    dependenciaId: Number(user.dependencia_id),
    fuero: String(user.fuero || "PENAL").trim().toUpperCase(),
    sistemaOrigen: String(user.sistema_origen || "SIGI").trim().toUpperCase(),
  };
  const dni = dniForJwtPayload(user);
  if (dni !== undefined) payload.dni = dni;

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || "20m",
  });
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString("hex");
}

function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getRefreshExpiryDate() {
  const days = Number(process.env.JWT_REFRESH_EXPIRES_DAYS || 7);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt;
}

async function saveRefreshToken(usuario, token) {
  const tokenHash = hashRefreshToken(token);
  const expiresAt = getRefreshExpiryDate();
  await runQuery(
    `INSERT INTO dbo.refresh_tokens (usuario, token_hash, expires_at)
     VALUES (@usuario, @tokenHash, @expiresAt)`,
    { usuario, tokenHash, expiresAt }
  );
}

async function revokeRefreshToken(token) {
  const tokenHash = hashRefreshToken(token);
  await runQuery(
    `UPDATE dbo.refresh_tokens
     SET revoked_at = SYSUTCDATETIME()
     WHERE token_hash = @tokenHash AND revoked_at IS NULL`,
    { tokenHash }
  );
}

async function consumeRefreshToken(token) {
  const tokenHash = hashRefreshToken(token);
  const rs = await runQuery(
    `SELECT TOP (1) id, usuario, expires_at, revoked_at
     FROM dbo.refresh_tokens
     WHERE token_hash = @tokenHash`,
    { tokenHash }
  );
  const row = rs.recordset[0];
  if (!row) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at) <= new Date()) return null;
  return row.usuario;
}

module.exports = {
  signAccessToken,
  generateRefreshToken,
  saveRefreshToken,
  revokeRefreshToken,
  consumeRefreshToken,
};
