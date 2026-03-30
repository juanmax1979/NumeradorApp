const bcrypt = require("bcryptjs");
const { runQuery } = require("../config/db");
const {
  signAccessToken,
  generateRefreshToken,
  saveRefreshToken,
  revokeRefreshToken,
  consumeRefreshToken,
} = require("../services/tokenService");

function refreshCookieOptions() {
  const secure = String(process.env.COOKIE_SECURE || "false") === "true";
  const days = Number(process.env.JWT_REFRESH_EXPIRES_DAYS || 7);
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    maxAge: days * 24 * 60 * 60 * 1000,
    path: "/api/auth",
  };
}

async function login(req, res, next) {
  try {
    const { usuario, password, pcName, forceSession } = req.body;
    if (!usuario || !password) {
      return res.status(400).json({ message: "Usuario y contraseña son obligatorios" });
    }

    const userRs = await runQuery(
      `SELECT
         u.nombre,
         u.password_hash,
         u.rol,
         u.dependencia,
         u.dependencia_id,
         d.nombre AS dependencia_nombre
       FROM dbo.usuarios u
       LEFT JOIN dbo.dependencias d ON d.id = u.dependencia_id
       WHERE u.nombre = @usuario`,
      { usuario }
    );
    const user = userRs.recordset[0];
    if (!user) {
      return res.status(401).json({ message: "Usuario no encontrado" });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ message: "Contraseña incorrecta" });
    }

    const pc = (pcName || "PC-Desconocida").slice(0, 120);
    const sessionRs = await runQuery(
      "SELECT usuario, pc_name FROM dbo.sesiones WHERE usuario = @usuario",
      { usuario }
    );
    const activeSession = sessionRs.recordset[0];

    if (activeSession && activeSession.pc_name !== pc && !forceSession) {
      return res.status(409).json({
        code: "SESSION_ACTIVE",
        message: `El usuario está activo en ${activeSession.pc_name}`,
        activePc: activeSession.pc_name,
      });
    }

    await runQuery(
      `MERGE dbo.sesiones AS target
       USING (SELECT @usuario AS usuario, @pc_name AS pc_name) AS source
       ON target.usuario = source.usuario
       WHEN MATCHED THEN UPDATE SET pc_name = source.pc_name, fecha_login = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN INSERT (usuario, pc_name, fecha_login) VALUES (source.usuario, source.pc_name, SYSUTCDATETIME());`,
      { usuario, pc_name: pc }
    );

    const token = signAccessToken(user);
    const refreshToken = generateRefreshToken();
    await saveRefreshToken(user.nombre, refreshToken);
    res.cookie("refreshToken", refreshToken, refreshCookieOptions());

    return res.json({
      token,
      user: {
        nombre: user.nombre,
        rol: user.rol,
        dependencia: user.dependencia_nombre || user.dependencia || "GENERAL",
        dependenciaId: Number(user.dependencia_id),
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function changeOwnPassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    const usuario = req.user.nombre;
    const rs = await runQuery(
      "SELECT password_hash FROM dbo.usuarios WHERE nombre = @usuario",
      { usuario }
    );
    const row = rs.recordset[0];
    if (!row) return res.status(404).json({ message: "Usuario no encontrado" });

    const ok = await bcrypt.compare(currentPassword, row.password_hash);
    if (!ok) return res.status(401).json({ message: "Contraseña actual incorrecta" });

    if (!/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res.status(400).json({
        message: "La nueva clave debe incluir al menos una mayúscula y un número",
      });
    }

    const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
    const newHash = await bcrypt.hash(newPassword, rounds);
    await runQuery(
      "UPDATE dbo.usuarios SET password_hash = @hash WHERE nombre = @usuario",
      { hash: newHash, usuario }
    );
    return res.json({ message: "Contraseña actualizada correctamente" });
  } catch (error) {
    return next(error);
  }
}

async function logout(req, res, next) {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
      res.clearCookie("refreshToken", refreshCookieOptions());
    }
    await runQuery("DELETE FROM dbo.sesiones WHERE usuario = @usuario", {
      usuario: req.user.nombre,
    });
    return res.json({ message: "Sesión cerrada" });
  } catch (error) {
    return next(error);
  }
}

async function refresh(req, res, next) {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ message: "No hay refresh token" });
    }

    const usuario = await consumeRefreshToken(refreshToken);
    if (!usuario) {
      return res.status(401).json({ message: "Refresh token inválido o vencido" });
    }

    await revokeRefreshToken(refreshToken);
    const userRs = await runQuery(
      `SELECT
         u.nombre,
         u.rol,
         u.dependencia,
         u.dependencia_id,
         d.nombre AS dependencia_nombre
       FROM dbo.usuarios u
       LEFT JOIN dbo.dependencias d ON d.id = u.dependencia_id
       WHERE u.nombre = @usuario`,
      { usuario }
    );
    const user = userRs.recordset[0];
    if (!user) return res.status(401).json({ message: "Usuario inválido" });

    const newRefresh = generateRefreshToken();
    await saveRefreshToken(user.nombre, newRefresh);
    res.cookie("refreshToken", newRefresh, refreshCookieOptions());

    const token = signAccessToken(user);
    return res.json({
      token,
      user: {
        nombre: user.nombre,
        rol: user.rol,
        dependencia: user.dependencia_nombre || user.dependencia || "GENERAL",
        dependenciaId: Number(user.dependencia_id),
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  login,
  changeOwnPassword,
  logout,
  refresh,
};
