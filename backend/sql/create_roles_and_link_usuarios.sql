USE NumeradorDB;
GO

IF OBJECT_ID('dbo.roles', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.roles (
        id INT IDENTITY(1,1) PRIMARY KEY,
        rol NVARCHAR(30) NOT NULL
    );

    CREATE UNIQUE INDEX UX_roles_rol ON dbo.roles(rol);
END;
GO

MERGE dbo.roles AS target
USING (
    VALUES
        (N'admin'),
        (N'user')
) AS source (rol)
ON target.rol = source.rol
WHEN NOT MATCHED THEN
    INSERT (rol) VALUES (source.rol);
GO

IF OBJECT_ID('dbo.usuarios', 'U') IS NULL
BEGIN
    RAISERROR('La tabla dbo.usuarios no existe.', 16, 1);
    RETURN;
END;
GO

IF COL_LENGTH('dbo.usuarios', 'rol_id') IS NULL
BEGIN
    ALTER TABLE dbo.usuarios
    ADD rol_id INT NULL;
END;
GO

/* Backfill desde columna textual usuarios.rol. */
UPDATE u
SET u.rol_id = r.id
FROM dbo.usuarios u
INNER JOIN dbo.roles r
    ON LOWER(LTRIM(RTRIM(u.rol))) = LOWER(LTRIM(RTRIM(r.rol)))
WHERE u.rol_id IS NULL;
GO

/* Fallback para valores no contemplados: user. */
UPDATE u
SET u.rol_id = r.id
FROM dbo.usuarios u
CROSS JOIN dbo.roles r
WHERE u.rol_id IS NULL
  AND r.rol = N'user';
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE name = 'FK_usuarios_roles'
      AND parent_object_id = OBJECT_ID('dbo.usuarios')
)
BEGIN
    ALTER TABLE dbo.usuarios
    ADD CONSTRAINT FK_usuarios_roles
        FOREIGN KEY (rol_id) REFERENCES dbo.roles(id);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_usuarios_rol_id'
      AND object_id = OBJECT_ID('dbo.usuarios')
)
BEGIN
    CREATE INDEX IX_usuarios_rol_id
    ON dbo.usuarios(rol_id);
END;
GO

/* Opcional: descomentar cuando quieras forzar NOT NULL.
IF EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.usuarios')
      AND name = 'rol_id'
      AND is_nullable = 1
)
BEGIN
    ALTER TABLE dbo.usuarios ALTER COLUMN rol_id INT NOT NULL;
END;
GO
*/
