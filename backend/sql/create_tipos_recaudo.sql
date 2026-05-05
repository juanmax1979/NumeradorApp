USE NumeradorDB;
GO

IF OBJECT_ID('dbo.tipos_recaudo', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.tipos_recaudo (
        id INT IDENTITY(1,1) PRIMARY KEY,
        codigo NVARCHAR(50) NOT NULL,
        nombre NVARCHAR(120) NOT NULL,
        activo BIT NOT NULL CONSTRAINT DF_tipos_recaudo_activo DEFAULT 1,
        orden INT NOT NULL CONSTRAINT DF_tipos_recaudo_orden DEFAULT 0,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_tipos_recaudo_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_tipos_recaudo_updated_at DEFAULT SYSUTCDATETIME()
    );

    CREATE UNIQUE INDEX UX_tipos_recaudo_codigo ON dbo.tipos_recaudo(codigo);
    CREATE UNIQUE INDEX UX_tipos_recaudo_nombre ON dbo.tipos_recaudo(nombre);
END;
GO

MERGE dbo.tipos_recaudo AS target
USING (
    VALUES
        (N'OFICIO', N'Oficios', 1, 10),
        (N'AUTO', N'Autos', 1, 20),
        (N'SENT_RELATORIA', N'Sentencia Relatoria', 1, 30),
        (N'SENT_TRAMITE', N'Sentencia Trámite', 1, 40),
        (N'RECAUDO', N'Recaudos', 1, 50)
) AS source (codigo, nombre, activo, orden)
ON target.codigo = source.codigo
WHEN MATCHED THEN
    UPDATE SET
        target.nombre = source.nombre,
        target.activo = source.activo,
        target.orden = source.orden,
        target.updated_at = SYSUTCDATETIME()
WHEN NOT MATCHED THEN
    INSERT (codigo, nombre, activo, orden)
    VALUES (source.codigo, source.nombre, source.activo, source.orden);
GO
