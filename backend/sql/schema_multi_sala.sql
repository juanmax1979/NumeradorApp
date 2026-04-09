CREATE TABLE usuarios (
  id BIGINT IDENTITY PRIMARY KEY,
  externo_id NVARCHAR(100) NOT NULL UNIQUE,
  username NVARCHAR(120) NOT NULL UNIQUE,
  nombre_completo NVARCHAR(200) NOT NULL,
  dni NVARCHAR(20) NULL,
  email NVARCHAR(200) NULL,
  activo BIT NOT NULL DEFAULT 1,
  updated_at_externo DATETIME2 NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dependencias (
  id BIGINT IDENTITY PRIMARY KEY,
  externo_id NVARCHAR(100) NOT NULL UNIQUE,
  codigo NVARCHAR(50) NULL,
  nombre NVARCHAR(200) NOT NULL,
  tipo NVARCHAR(50) NULL, -- CAMARA, JUZGADO, etc
  activa BIT NOT NULL DEFAULT 1
);

CREATE TABLE subdependencias (
  id BIGINT IDENTITY PRIMARY KEY,
  dependencia_id BIGINT NOT NULL,
  externo_id NVARCHAR(100) NULL UNIQUE,
  nombre NVARCHAR(200) NOT NULL, -- Sala 1, Secretaria A
  tipo NVARCHAR(50) NOT NULL,    -- SALA, SECRETARIA
  activa BIT NOT NULL DEFAULT 1,
  CONSTRAINT FK_subdep_dep FOREIGN KEY (dependencia_id) REFERENCES dependencias(id)
);

CREATE TABLE usuario_asignaciones (
  id BIGINT IDENTITY PRIMARY KEY,
  usuario_id BIGINT NOT NULL,
  dependencia_id BIGINT NOT NULL,
  subdependencia_id BIGINT NULL,
  rol_funcional NVARCHAR(50) NOT NULL, -- operador, secretario, etc
  es_principal BIT NOT NULL DEFAULT 0,
  vigente_desde DATE NULL,
  vigente_hasta DATE NULL,
  activa BIT NOT NULL DEFAULT 1,
  CONSTRAINT FK_ua_user FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  CONSTRAINT FK_ua_dep FOREIGN KEY (dependencia_id) REFERENCES dependencias(id),
  CONSTRAINT FK_ua_subdep FOREIGN KEY (subdependencia_id) REFERENCES subdependencias(id)
);

CREATE INDEX IX_ua_usuario_activa ON usuario_asignaciones(usuario_id, activa);
CREATE INDEX IX_ua_dep_activa ON usuario_asignaciones(dependencia_id, activa);
CREATE INDEX IX_ua_subdep_activa ON usuario_asignaciones(subdependencia_id, activa);

/*dependencias/salas del usuario logueado
SELECT
  u.id AS usuario_id,
  u.username,
  d.id AS dependencia_id,
  d.nombre AS dependencia,
  sd.id AS subdependencia_id,
  sd.nombre AS subdependencia,
  ua.rol_funcional,
  ua.es_principal
FROM usuarios u
JOIN usuario_asignaciones ua ON ua.usuario_id = u.id AND ua.activa = 1
JOIN dependencias d ON d.id = ua.dependencia_id AND d.activa = 1
LEFT JOIN subdependencias sd ON sd.id = ua.subdependencia_id AND sd.activa = 1
WHERE u.username = @username
  AND u.activo = 1
ORDER BY ua.es_principal DESC, d.nombre, sd.nombre;
*/

/* usuarios de una dependencia/sala
SELECT
  u.id, u.username, u.nombre_completo, u.dni,
  ua.rol_funcional
FROM usuario_asignaciones ua
JOIN usuarios u ON u.id = ua.usuario_id AND u.activo = 1
WHERE ua.activa = 1
  AND ua.dependencia_id = @dependencia_id
  AND (@subdependencia_id IS NULL OR ua.subdependencia_id = @subdependencia_id)
ORDER BY u.nombre_completo;
//*