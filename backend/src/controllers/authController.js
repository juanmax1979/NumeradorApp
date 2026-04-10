const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { runQuery } = require("../config/db");
const {
  signAccessToken,
  generateRefreshToken,
  saveRefreshToken,
  revokeRefreshToken,
  consumeRefreshToken,
} = require("../services/tokenService");
const {
  isActiveDirectoryAuthEnabled,
  authenticateAgainstActiveDirectory,
} = require("../services/adAuthService");
const {
  resolveDniIntForRequest,
  getAllowedDependenciaIdsForDni,
} = require("./sigiController");

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

async function resolveDefaultDependencia() {
  const configured = String(process.env.AD_DEFAULT_DEPENDENCIA || "GENERAL").trim();
  const rsByName = await runQuery(
    "SELECT TOP 1 id, nombre FROM dbo.dependencias WHERE nombre = @nombre AND activa = 1",
    { nombre: configured }
  );
  if (rsByName.recordset[0]) return rsByName.recordset[0];

  const rsFallback = await runQuery(
    "SELECT TOP 1 id, nombre FROM dbo.dependencias WHERE activa = 1 ORDER BY id ASC",
    {}
  );
  return rsFallback.recordset[0] || null;
}

async function ensureLocalUserForAdLogin(usuario, fullName = null, dni = null) {
  const role = String(process.env.AD_DEFAULT_ROLE || "user").trim() || "user";
  const dep = await resolveDefaultDependencia();
  if (!dep) {
    throw new Error("No hay dependencias activas para aprovisionar usuario AD");
  }

  const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
  const placeholder = `ad:${crypto.randomUUID()}`;
  const hash = await bcrypt.hash(placeholder, rounds);
  await runQuery(
    `INSERT INTO dbo.usuarios (nombre, usuario, nombre_completo, dni, password_hash, rol, dependencia, dependencia_id)
     VALUES (@nombre, @usuario, @nombre_completo, @dni, @password_hash, @rol, @dependencia, @dependencia_id)`,
    {
      nombre: usuario,
      usuario,
      nombre_completo: fullName,
      dni,
      password_hash: hash,
      rol: role,
      dependencia: dep.nombre,
      dependencia_id: dep.id,
    }
  );
}

async function syncLocalUserFromAd(loginName, fullName, dni) {
  await runQuery(
    `UPDATE dbo.usuarios
     SET
       usuario = COALESCE(NULLIF(usuario, ''), @usuario),
       nombre_completo = CASE
         WHEN @nombre_completo IS NOT NULL AND LTRIM(RTRIM(@nombre_completo)) <> '' THEN @nombre_completo
         ELSE nombre_completo
       END,
       dni = CASE
         WHEN @dni IS NOT NULL AND LTRIM(RTRIM(@dni)) <> '' THEN @dni
         ELSE dni
       END
     WHERE nombre = @usuario OR usuario = @usuario`,
    {
      usuario: loginName,
      nombre_completo: fullName,
      dni,
    }
  );
}

async function login(req, res, next) {
  try {
    const { usuario, password, pcName, forceSession } = req.body;
    if (!usuario || !password) {
      return res.status(400).json({ message: "Usuario y contraseña son obligatorios" });
    }

    if (isActiveDirectoryAuthEnabled()) {
      const adResult = await authenticateAgainstActiveDirectory(usuario, password);
      if (!adResult.ok) {
        return res.status(401).json({ message: "Credenciales inválidas" });
      }
      const loginName = String(adResult.username || usuario).trim();
      const loginFullName = adResult.fullName || null;
      const loginDni = adResult.dni || null;
      const autoProvisionEnabled =
        String(process.env.AD_AUTO_PROVISION || "true").toLowerCase() === "true";

      let userRs = await runQuery(
        `SELECT
           u.nombre,
           u.usuario,
           u.nombre_completo,
           u.dni,
           u.password_hash,
           u.rol,
           u.dependencia,
           u.dependencia_id,
           d.nombre AS dependencia_nombre
         FROM dbo.usuarios u
         LEFT JOIN dbo.dependencias d ON d.id = u.dependencia_id
         WHERE u.nombre = @usuario OR u.usuario = @usuario`,
        { usuario: loginName }
      );
      let user = userRs.recordset[0];

      if (!user && autoProvisionEnabled) {
        try {
          await ensureLocalUserForAdLogin(loginName, loginFullName, loginDni);
        } catch (provisionError) {
          if (Number(provisionError?.number) === 2601 || Number(provisionError?.number) === 2627) {
            return res.status(409).json({
              message: "No se pudo auto-crear el usuario porque el DNI ya existe",
            });
          }
          throw provisionError;
        }
        userRs = await runQuery(
          `SELECT
             u.nombre,
             u.usuario,
             u.nombre_completo,
             u.dni,
             u.password_hash,
             u.rol,
             u.dependencia,
             u.dependencia_id,
             d.nombre AS dependencia_nombre
           FROM dbo.usuarios u
           LEFT JOIN dbo.dependencias d ON d.id = u.dependencia_id
           WHERE u.nombre = @usuario OR u.usuario = @usuario`,
          { usuario: loginName }
        );
        user = userRs.recordset[0];
      }

      if (!user) {
        return res.status(403).json({
          message: "Usuario autenticado en AD, pero sin alta local",
        });
      }

      await syncLocalUserFromAd(loginName, loginFullName, loginDni);
      userRs = await runQuery(
        `SELECT
           u.nombre,
           u.usuario,
           u.nombre_completo,
           u.dni,
           u.password_hash,
           u.rol,
           u.dependencia,
           u.dependencia_id,
           d.nombre AS dependencia_nombre
         FROM dbo.usuarios u
         LEFT JOIN dbo.dependencias d ON d.id = u.dependencia_id
         WHERE u.nombre = @usuario OR u.usuario = @usuario`,
        { usuario: loginName }
      );
      user = userRs.recordset[0];

      const pc = (pcName || "PC-Desconocida").slice(0, 120);
      const sessionRs = await runQuery(
        "SELECT usuario, pc_name FROM dbo.sesiones WHERE usuario = @usuario",
        { usuario: loginName }
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
        { usuario: loginName, pc_name: pc }
      );

      const token = signAccessToken(user);
      const refreshToken = generateRefreshToken();
      await saveRefreshToken(user.nombre, refreshToken);
      res.cookie("refreshToken", refreshToken, refreshCookieOptions());

      return res.json({
        token,
        user: {
          nombre: user.nombre,
          usuario: user.usuario || user.nombre,
          nombreCompleto: user.nombre_completo || user.nombre,
          dni: user.dni || null,
          rol: user.rol,
          dependencia: user.dependencia_nombre || user.dependencia || "GENERAL",
          dependenciaId: Number(user.dependencia_id),
        },
      });
    } else {
      const userRs = await runQuery(
        `SELECT
           u.nombre,
           u.usuario,
           u.nombre_completo,
           u.dni,
           u.password_hash,
           u.rol,
           u.dependencia,
           u.dependencia_id,
           d.nombre AS dependencia_nombre
         FROM dbo.usuarios u
         LEFT JOIN dbo.dependencias d ON d.id = u.dependencia_id
         WHERE u.nombre = @usuario OR u.usuario = @usuario`,
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
          usuario: user.usuario || user.nombre,
          nombreCompleto: user.nombre_completo || user.nombre,
          dni: user.dni || null,
          rol: user.rol,
          dependencia: user.dependencia_nombre || user.dependencia || "GENERAL",
          dependenciaId: Number(user.dependencia_id),
        },
      });
    }
  } catch (error) {
    return next(error);
  }
}

async function changeOwnPassword(req, res, next) {
  try {
    if (isActiveDirectoryAuthEnabled()) {
      return res.status(400).json({
        message: "El cambio de contraseña se gestiona desde Active Directory",
      });
    }

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

async function switchDependencia(req, res, next) {
  try {
    const targetId = Number(req.body?.dependenciaId);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      return res.status(400).json({ message: "dependenciaId inválido" });
    }

    const dniInt = await resolveDniIntForRequest(req);
    let allowedIds = [];
    if (dniInt != null) {
      try {
        allowedIds = await getAllowedDependenciaIdsForDni(dniInt);
      } catch {
        return res.status(503).json({
          message: "No se pudo consultar SIGI para validar dependencias. Intente más tarde.",
        });
      }
    }

    const currentId = Number(req.user?.dependenciaId);
    if (allowedIds.length === 0) {
      if (targetId !== currentId) {
        return res.status(403).json({
          message:
            "Sin asignación SIGI reconocible (COD_DEP / cod_dep_sigi). Solo puede operar con su dependencia actual del Numerador.",
        });
      }
    } else if (!allowedIds.includes(targetId)) {
      return res.status(403).json({
        message: "No puede operar en la dependencia elegida según su alta en SIGI.",
      });
    }

    const depRs = await runQuery(
      `SELECT id, nombre FROM dbo.dependencias WHERE id = @id AND activa = 1`,
      { id: targetId }
    );
    const dep = depRs.recordset[0];
    if (!dep) {
      return res.status(404).json({ message: "Dependencia no encontrada o inactiva" });
    }

    await runQuery(
      `UPDATE dbo.usuarios
       SET dependencia_id = @depId, dependencia = @depNombre
       WHERE nombre = @nombre OR usuario = @nombre`,
      { depId: targetId, depNombre: dep.nombre, nombre: req.user.nombre }
    );

    const userRs = await runQuery(
      `SELECT
         u.nombre,
         u.usuario,
         u.nombre_completo,
         u.dni,
         u.rol,
         u.dependencia,
         u.dependencia_id,
         d.nombre AS dependencia_nombre
       FROM dbo.usuarios u
       LEFT JOIN dbo.dependencias d ON d.id = u.dependencia_id
       WHERE u.nombre = @nombre OR u.usuario = @nombre`,
      { nombre: req.user.nombre }
    );
    const user = userRs.recordset[0];
    if (!user) {
      return res.status(500).json({ message: "Usuario no encontrado tras actualizar dependencia" });
    }

    const token = signAccessToken(user);
    return res.json({
      token,
      user: {
        nombre: user.nombre,
        usuario: user.usuario || user.nombre,
        nombreCompleto: user.nombre_completo || user.nombre,
        dni: user.dni || null,
        rol: user.rol,
        dependencia: user.dependencia_nombre || user.dependencia || "GENERAL",
        dependenciaId: Number(user.dependencia_id),
      },
    });
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
         u.usuario,
         u.nombre_completo,
         u.dni,
         u.rol,
         u.dependencia,
         u.dependencia_id,
         d.nombre AS dependencia_nombre
       FROM dbo.usuarios u
       LEFT JOIN dbo.dependencias d ON d.id = u.dependencia_id
       WHERE u.nombre = @usuario OR u.usuario = @usuario`,
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
        usuario: user.usuario || user.nombre,
        nombreCompleto: user.nombre_completo || user.nombre,
        dni: user.dni || null,
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
  switchDependencia,
};
