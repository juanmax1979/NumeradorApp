const bcrypt = require("bcryptjs");
const { runQuery } = require("../config/db");

async function listUsers(req, res, next) {
  try {
    const rs = await runQuery(
      `SELECT u.nombre, u.rol, u.dependencia_id AS dependenciaId, d.nombre AS dependencia
       FROM dbo.usuarios u
       LEFT JOIN dbo.dependencias d ON d.id = u.dependencia_id
       ORDER BY rol, nombre`,
      {}
    );
    return res.json(rs.recordset);
  } catch (error) {
    return next(error);
  }
}

async function resetPassword(req, res, next) {
  try {
    const { nombre } = req.params;
    const dependenciaId = Number(req.user?.dependenciaId);
    const { newPassword } = req.body;
    if (!/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res.status(400).json({
        message: "La nueva clave debe incluir al menos una mayúscula y un número",
      });
    }

    const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
    const hash = await bcrypt.hash(newPassword, rounds);
    const rs = await runQuery(
      "UPDATE dbo.usuarios SET password_hash = @hash WHERE nombre = @nombre AND dependencia_id = @dependenciaId",
      { hash, nombre, dependenciaId }
    );
    if (rs.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    return res.json({ message: `Clave de ${nombre} actualizada` });
  } catch (error) {
    return next(error);
  }
}

async function updateDependencia(req, res, next) {
  try {
    const { nombre } = req.params;
    const { dependenciaId } = req.body;

    const depRs = await runQuery(
      "SELECT id, nombre FROM dbo.dependencias WHERE id = @dependenciaId AND activa = 1",
      { dependenciaId }
    );
    const dep = depRs.recordset[0];
    if (!dep) {
      return res.status(404).json({ message: "Dependencia no encontrada o inactiva" });
    }

    const rs = await runQuery(
      "UPDATE dbo.usuarios SET dependencia_id = @dependenciaId, dependencia = @dependencia WHERE nombre = @nombre",
      { nombre, dependenciaId: dep.id, dependencia: dep.nombre }
    );
    if (rs.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    return res.json({ message: `Dependencia de ${nombre} actualizada` });
  } catch (error) {
    return next(error);
  }
}

module.exports = { listUsers, resetPassword, updateDependencia };
