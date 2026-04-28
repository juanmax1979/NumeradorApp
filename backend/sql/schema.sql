IF DB_ID('NumeradorDB') IS NULL
BEGIN
    CREATE DATABASE NumeradorDB;
END;
GO

USE NumeradorDB;
GO

IF OBJECT_ID('dbo.dependencias', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.dependencias (
        id INT IDENTITY(1,1) PRIMARY KEY,
        nombre NVARCHAR(150) NOT NULL UNIQUE,
        activa BIT NOT NULL DEFAULT 1,
        fuero NVARCHAR(50) NOT NULL DEFAULT 'PENAL',
        sistema_origen NVARCHAR(50) NOT NULL DEFAULT 'SIGI',
        cod_dep_sigi NVARCHAR(50) NULL,
        cod_dep_externo NVARCHAR(120) NULL
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.dependencias WHERE nombre = 'GENERAL')
BEGIN
    INSERT INTO dbo.dependencias (nombre, activa, fuero, sistema_origen) VALUES ('GENERAL', 1, 'PENAL', 'SIGI');
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.dependencias WHERE nombre = 'Juzgado Correccional - Charata')
BEGIN
    INSERT INTO dbo.dependencias (nombre, activa, fuero, sistema_origen) VALUES ('Juzgado Correccional - Charata', 1, 'PENAL', 'SIGI');
END;
GO

IF COL_LENGTH('dbo.dependencias', 'fuero') IS NULL
BEGIN
    ALTER TABLE dbo.dependencias ADD fuero NVARCHAR(50) NULL;
END;
GO

IF COL_LENGTH('dbo.dependencias', 'sistema_origen') IS NULL
BEGIN
    ALTER TABLE dbo.dependencias ADD sistema_origen NVARCHAR(50) NULL;
END;
GO

IF COL_LENGTH('dbo.dependencias', 'cod_dep_sigi') IS NULL
BEGIN
    ALTER TABLE dbo.dependencias ADD cod_dep_sigi NVARCHAR(50) NULL;
END;
GO

IF COL_LENGTH('dbo.dependencias', 'cod_dep_externo') IS NULL
BEGIN
    ALTER TABLE dbo.dependencias ADD cod_dep_externo NVARCHAR(120) NULL;
END;
GO

UPDATE dbo.dependencias
SET fuero = ISNULL(NULLIF(LTRIM(RTRIM(fuero)), ''), 'PENAL');
GO

UPDATE dbo.dependencias
SET sistema_origen = ISNULL(NULLIF(LTRIM(RTRIM(sistema_origen)), ''), 'SIGI');
GO

UPDATE dbo.dependencias
SET cod_dep_externo = LTRIM(RTRIM(cod_dep_sigi))
WHERE (cod_dep_externo IS NULL OR LTRIM(RTRIM(cod_dep_externo)) = '')
  AND cod_dep_sigi IS NOT NULL
  AND LTRIM(RTRIM(cod_dep_sigi)) <> '';
GO

IF OBJECT_ID('dbo.registros', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.registros (
        id INT IDENTITY(1,1) PRIMARY KEY,
        dependencia_id INT NOT NULL,
        dependencia NVARCHAR(150) NOT NULL DEFAULT 'GENERAL',
        tipo NVARCHAR(80) NOT NULL,
        numero INT NOT NULL,
        anio INT NOT NULL,
        expediente NVARCHAR(120) NOT NULL,
        detalle NVARCHAR(500) NOT NULL DEFAULT '',
        usuario NVARCHAR(120) NOT NULL,
        fecha DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        remitido BIT NOT NULL DEFAULT 0,
        remitido_por NVARCHAR(120) NOT NULL DEFAULT '',
        remitido_fecha DATETIME2 NULL,
        anulado_por NVARCHAR(120) NOT NULL DEFAULT '',
        anulacion_motivo NVARCHAR(80) NOT NULL DEFAULT '',
        anulacion_observacion NVARCHAR(400) NOT NULL DEFAULT '',
        anulacion_fecha DATETIME2 NULL,
        CONSTRAINT FK_registros_dependencias
            FOREIGN KEY (dependencia_id) REFERENCES dbo.dependencias(id)
    );
    CREATE INDEX IX_registros_dep_tipo_anio_numero ON dbo.registros(dependencia_id, tipo, anio, numero DESC);
    CREATE INDEX IX_registros_fecha ON dbo.registros(fecha DESC);
END;
GO

IF OBJECT_ID('dbo.usuarios', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.usuarios (
        nombre NVARCHAR(120) PRIMARY KEY,
        usuario NVARCHAR(120) NULL,
        nombre_completo NVARCHAR(200) NULL,
        dni NVARCHAR(20) NULL,
        password_hash NVARCHAR(255) NOT NULL,
        rol NVARCHAR(20) NOT NULL,
        dependencia NVARCHAR(150) NOT NULL DEFAULT 'GENERAL',
        dependencia_id INT NOT NULL,
        CONSTRAINT FK_usuarios_dependencias
            FOREIGN KEY (dependencia_id) REFERENCES dbo.dependencias(id)
    );
END;
GO

IF COL_LENGTH('dbo.usuarios', 'dni') IS NULL
BEGIN
    ALTER TABLE dbo.usuarios
    ADD dni NVARCHAR(20) NULL;
END;
GO

IF COL_LENGTH('dbo.usuarios', 'usuario') IS NULL
BEGIN
    ALTER TABLE dbo.usuarios
    ADD usuario NVARCHAR(120) NULL;
END;
GO

IF COL_LENGTH('dbo.usuarios', 'nombre_completo') IS NULL
BEGIN
    ALTER TABLE dbo.usuarios
    ADD nombre_completo NVARCHAR(200) NULL;
END;
GO

UPDATE dbo.usuarios
SET usuario = nombre
WHERE usuario IS NULL OR LTRIM(RTRIM(usuario)) = '';
GO

UPDATE dbo.usuarios
SET nombre_completo = nombre
WHERE nombre_completo IS NULL OR LTRIM(RTRIM(nombre_completo)) = '';
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'UX_usuarios_dni'
      AND object_id = OBJECT_ID('dbo.usuarios')
)
BEGIN
    CREATE UNIQUE INDEX UX_usuarios_dni
    ON dbo.usuarios(dni)
    WHERE dni IS NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'UX_usuarios_usuario'
      AND object_id = OBJECT_ID('dbo.usuarios')
)
BEGIN
    CREATE UNIQUE INDEX UX_usuarios_usuario
    ON dbo.usuarios(usuario)
    WHERE usuario IS NOT NULL;
END;
GO

IF OBJECT_ID('dbo.sesiones', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.sesiones (
        usuario NVARCHAR(120) PRIMARY KEY,
        pc_name NVARCHAR(120) NOT NULL,
        fecha_login DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END;
GO

IF OBJECT_ID('dbo.log_auditoria', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.log_auditoria (
        id INT IDENTITY(1,1) PRIMARY KEY,
        registro_id INT NULL,
        dependencia_id INT NOT NULL,
        dependencia NVARCHAR(150) NOT NULL DEFAULT 'GENERAL',
        accion NVARCHAR(80) NOT NULL,
        campo_modificado NVARCHAR(120) NOT NULL,
        valor_anterior NVARCHAR(MAX) NULL,
        valor_nuevo NVARCHAR(MAX) NULL,
        usuario NVARCHAR(120) NOT NULL,
        fecha DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_log_auditoria_dependencias
            FOREIGN KEY (dependencia_id) REFERENCES dbo.dependencias(id)
    );
    CREATE INDEX IX_log_auditoria_fecha ON dbo.log_auditoria(fecha DESC);
END;
GO

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
END;
GO
