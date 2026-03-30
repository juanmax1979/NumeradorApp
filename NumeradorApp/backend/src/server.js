require("dotenv").config();
const app = require("./app");
const { runQuery } = require("./config/db");
const { seedUsersIfEmpty } = require("./config/defaultUsers");

async function bootstrap() {
  await runQuery("SELECT 1 AS ok");
  await runQuery(`
    IF OBJECT_ID('dbo.refresh_tokens', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.refresh_tokens (
        id INT IDENTITY(1,1) PRIMARY KEY,
        usuario NVARCHAR(120) NOT NULL,
        token_hash NVARCHAR(128) NOT NULL UNIQUE,
        expires_at DATETIME2 NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        revoked_at DATETIME2 NULL
      );
      CREATE INDEX IX_refresh_tokens_usuario ON dbo.refresh_tokens(usuario, revoked_at);
    END
  `);

  await runQuery(`
    IF OBJECT_ID('dbo.dependencias', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.dependencias (
        id INT IDENTITY(1,1) PRIMARY KEY,
        nombre NVARCHAR(150) NOT NULL UNIQUE,
        activa BIT NOT NULL DEFAULT 1
      );
    END
  `);
  await runQuery(`
    IF NOT EXISTS (SELECT 1 FROM dbo.dependencias WHERE nombre = 'GENERAL')
      INSERT INTO dbo.dependencias (nombre, activa) VALUES ('GENERAL', 1);
    IF NOT EXISTS (SELECT 1 FROM dbo.dependencias WHERE nombre = 'Juzgado Correccional - Charata')
      INSERT INTO dbo.dependencias (nombre, activa) VALUES ('Juzgado Correccional - Charata', 1);
  `);

  // Compatibilidad con instalaciones previas (texto)
  await runQuery(`
    IF OBJECT_ID('dbo.usuarios', 'U') IS NOT NULL AND COL_LENGTH('dbo.usuarios', 'dependencia') IS NULL
    BEGIN
      ALTER TABLE dbo.usuarios ADD dependencia NVARCHAR(150) NOT NULL CONSTRAINT DF_usuarios_dependencia DEFAULT 'GENERAL';
    END
  `);
  await runQuery(`
    IF OBJECT_ID('dbo.usuarios', 'U') IS NOT NULL AND COL_LENGTH('dbo.usuarios', 'dependencia') IS NOT NULL
    BEGIN
      EXEC('UPDATE dbo.usuarios SET dependencia = ''GENERAL'' WHERE dependencia IS NULL');
    END
  `);
  await runQuery(`
    IF OBJECT_ID('dbo.registros', 'U') IS NOT NULL AND COL_LENGTH('dbo.registros', 'dependencia') IS NULL
    BEGIN
      ALTER TABLE dbo.registros ADD dependencia NVARCHAR(150) NOT NULL CONSTRAINT DF_registros_dependencia DEFAULT 'GENERAL';
    END
  `);
  await runQuery(`
    IF OBJECT_ID('dbo.registros', 'U') IS NOT NULL AND COL_LENGTH('dbo.registros', 'dependencia') IS NOT NULL
    BEGIN
      EXEC('UPDATE dbo.registros SET dependencia = ''GENERAL'' WHERE dependencia IS NULL');
    END
  `);
  await runQuery(`
    IF OBJECT_ID('dbo.log_auditoria', 'U') IS NOT NULL AND COL_LENGTH('dbo.log_auditoria', 'dependencia') IS NULL
    BEGIN
      ALTER TABLE dbo.log_auditoria ADD dependencia NVARCHAR(150) NOT NULL CONSTRAINT DF_log_auditoria_dependencia DEFAULT 'GENERAL';
    END
  `);
  await runQuery(`
    IF OBJECT_ID('dbo.log_auditoria', 'U') IS NOT NULL AND COL_LENGTH('dbo.log_auditoria', 'dependencia') IS NOT NULL
    BEGIN
      EXEC('UPDATE dbo.log_auditoria SET dependencia = ''GENERAL'' WHERE dependencia IS NULL');
    END
  `);

  // Nuevo modelo relacional por ID
  await runQuery(`
    IF OBJECT_ID('dbo.usuarios', 'U') IS NOT NULL AND COL_LENGTH('dbo.usuarios', 'dependencia_id') IS NULL
      ALTER TABLE dbo.usuarios ADD dependencia_id INT NULL;
    IF OBJECT_ID('dbo.registros', 'U') IS NOT NULL AND COL_LENGTH('dbo.registros', 'dependencia_id') IS NULL
      ALTER TABLE dbo.registros ADD dependencia_id INT NULL;
    IF OBJECT_ID('dbo.log_auditoria', 'U') IS NOT NULL AND COL_LENGTH('dbo.log_auditoria', 'dependencia_id') IS NULL
      ALTER TABLE dbo.log_auditoria ADD dependencia_id INT NULL;
  `);

  await runQuery(`
    IF OBJECT_ID('dbo.usuarios', 'U') IS NOT NULL
      INSERT INTO dbo.dependencias (nombre, activa)
      SELECT DISTINCT u.dependencia, 1
      FROM dbo.usuarios u
      LEFT JOIN dbo.dependencias d ON d.nombre = u.dependencia
      WHERE u.dependencia IS NOT NULL AND LTRIM(RTRIM(u.dependencia)) <> '' AND d.id IS NULL;

    IF OBJECT_ID('dbo.registros', 'U') IS NOT NULL
      INSERT INTO dbo.dependencias (nombre, activa)
      SELECT DISTINCT r.dependencia, 1
      FROM dbo.registros r
      LEFT JOIN dbo.dependencias d ON d.nombre = r.dependencia
      WHERE r.dependencia IS NOT NULL AND LTRIM(RTRIM(r.dependencia)) <> '' AND d.id IS NULL;

    IF OBJECT_ID('dbo.log_auditoria', 'U') IS NOT NULL
      INSERT INTO dbo.dependencias (nombre, activa)
      SELECT DISTINCT l.dependencia, 1
      FROM dbo.log_auditoria l
      LEFT JOIN dbo.dependencias d ON d.nombre = l.dependencia
      WHERE l.dependencia IS NOT NULL AND LTRIM(RTRIM(l.dependencia)) <> '' AND d.id IS NULL;
  `);

  await runQuery(`
    IF OBJECT_ID('dbo.usuarios', 'U') IS NOT NULL
    BEGIN
      UPDATE u
      SET dependencia_id = d.id
      FROM dbo.usuarios u
      INNER JOIN dbo.dependencias d ON d.nombre = u.dependencia
      WHERE u.dependencia_id IS NULL;

      UPDATE dbo.usuarios
      SET dependencia_id = (SELECT TOP 1 id FROM dbo.dependencias WHERE nombre = 'GENERAL')
      WHERE dependencia_id IS NULL;
    END
  `);
  await runQuery(`
    IF OBJECT_ID('dbo.registros', 'U') IS NOT NULL
    BEGIN
      UPDATE r
      SET dependencia_id = d.id
      FROM dbo.registros r
      INNER JOIN dbo.dependencias d ON d.nombre = r.dependencia
      WHERE r.dependencia_id IS NULL;

      UPDATE dbo.registros
      SET dependencia_id = (SELECT TOP 1 id FROM dbo.dependencias WHERE nombre = 'GENERAL')
      WHERE dependencia_id IS NULL;
    END
  `);
  await runQuery(`
    IF OBJECT_ID('dbo.log_auditoria', 'U') IS NOT NULL
    BEGIN
      UPDATE l
      SET dependencia_id = d.id
      FROM dbo.log_auditoria l
      INNER JOIN dbo.dependencias d ON d.nombre = l.dependencia
      WHERE l.dependencia_id IS NULL;

      UPDATE dbo.log_auditoria
      SET dependencia_id = (SELECT TOP 1 id FROM dbo.dependencias WHERE nombre = 'GENERAL')
      WHERE dependencia_id IS NULL;
    END
  `);

  await runQuery(`
    IF OBJECT_ID('dbo.usuarios', 'U') IS NOT NULL
      IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.usuarios') AND name = 'dependencia_id' AND is_nullable = 1)
        ALTER TABLE dbo.usuarios ALTER COLUMN dependencia_id INT NOT NULL;

    IF OBJECT_ID('dbo.registros', 'U') IS NOT NULL
      IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.registros') AND name = 'dependencia_id' AND is_nullable = 1)
        ALTER TABLE dbo.registros ALTER COLUMN dependencia_id INT NOT NULL;

    IF OBJECT_ID('dbo.log_auditoria', 'U') IS NOT NULL
      IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.log_auditoria') AND name = 'dependencia_id' AND is_nullable = 1)
        ALTER TABLE dbo.log_auditoria ALTER COLUMN dependencia_id INT NOT NULL;
  `);

  await runQuery(`
    IF OBJECT_ID('dbo.usuarios', 'U') IS NOT NULL
      IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_usuarios_dependencias')
        ALTER TABLE dbo.usuarios ADD CONSTRAINT FK_usuarios_dependencias FOREIGN KEY (dependencia_id) REFERENCES dbo.dependencias(id);

    IF OBJECT_ID('dbo.registros', 'U') IS NOT NULL
      IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_registros_dependencias')
        ALTER TABLE dbo.registros ADD CONSTRAINT FK_registros_dependencias FOREIGN KEY (dependencia_id) REFERENCES dbo.dependencias(id);

    IF OBJECT_ID('dbo.log_auditoria', 'U') IS NOT NULL
      IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_log_auditoria_dependencias')
        ALTER TABLE dbo.log_auditoria ADD CONSTRAINT FK_log_auditoria_dependencias FOREIGN KEY (dependencia_id) REFERENCES dbo.dependencias(id);
  `);

  await seedUsersIfEmpty();
}

const PORT = Number(process.env.PORT || 4000);

bootstrap()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Backend Numerador corriendo en http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("No se pudo iniciar el backend:", error.message);
    process.exit(1);
  });
