USE NumeradorDB;
GO

IF OBJECT_ID('dbo.registros', 'U') IS NULL
BEGIN
    RAISERROR('La tabla dbo.registros no existe en esta base.', 16, 1);
    RETURN;
END;
GO

IF OBJECT_ID('dbo.tipos_recaudo', 'U') IS NULL
BEGIN
    RAISERROR('La tabla dbo.tipos_recaudo no existe. Ejecuta primero create_tipos_recaudo.sql', 16, 1);
    RETURN;
END;
GO

IF COL_LENGTH('dbo.registros', 'tipo_recaudo_id') IS NULL
BEGIN
    ALTER TABLE dbo.registros
    ADD tipo_recaudo_id INT NULL;
END;
GO

/* Backfill inicial desde columna texto existente (registros.tipo). */
UPDATE r
SET r.tipo_recaudo_id = tr.id
FROM dbo.registros r
INNER JOIN dbo.tipos_recaudo tr
    ON UPPER(LTRIM(RTRIM(r.tipo))) = UPPER(LTRIM(RTRIM(tr.nombre)))
WHERE r.tipo_recaudo_id IS NULL
  AND r.tipo IS NOT NULL
  AND LTRIM(RTRIM(r.tipo)) <> '';
GO

/* Mapeos equivalentes comunes (por si difieren los textos históricos). */
UPDATE r
SET r.tipo_recaudo_id = tr.id
FROM dbo.registros r
INNER JOIN dbo.tipos_recaudo tr ON tr.codigo = 'OFICIO'
WHERE r.tipo_recaudo_id IS NULL
  AND UPPER(LTRIM(RTRIM(ISNULL(r.tipo, '')))) IN ('OFICIO', 'OFICIOS');
GO

UPDATE r
SET r.tipo_recaudo_id = tr.id
FROM dbo.registros r
INNER JOIN dbo.tipos_recaudo tr ON tr.codigo = 'AUTO'
WHERE r.tipo_recaudo_id IS NULL
  AND UPPER(LTRIM(RTRIM(ISNULL(r.tipo, '')))) IN ('AUTO', 'AUTOS');
GO

UPDATE r
SET r.tipo_recaudo_id = tr.id
FROM dbo.registros r
INNER JOIN dbo.tipos_recaudo tr ON tr.codigo = 'SENT_RELATORIA'
WHERE r.tipo_recaudo_id IS NULL
  AND UPPER(LTRIM(RTRIM(ISNULL(r.tipo, '')))) IN ('SENTENCIA RELATORIA', 'SENTENCIA DE RELATORIA');
GO

UPDATE r
SET r.tipo_recaudo_id = tr.id
FROM dbo.registros r
INNER JOIN dbo.tipos_recaudo tr ON tr.codigo = 'SENT_TRAMITE'
WHERE r.tipo_recaudo_id IS NULL
  AND UPPER(LTRIM(RTRIM(ISNULL(r.tipo, '')))) IN ('SENTENCIA TRÁMITE', 'SENTENCIA TRAMITE');
GO

UPDATE r
SET r.tipo_recaudo_id = tr.id
FROM dbo.registros r
INNER JOIN dbo.tipos_recaudo tr ON tr.codigo = 'RECAUDO'
WHERE r.tipo_recaudo_id IS NULL
  AND UPPER(LTRIM(RTRIM(ISNULL(r.tipo, '')))) IN ('RECAUDO', 'RECAUDOS');
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE name = 'FK_registros_tipos_recaudo'
      AND parent_object_id = OBJECT_ID('dbo.registros')
)
BEGIN
    ALTER TABLE dbo.registros
    ADD CONSTRAINT FK_registros_tipos_recaudo
        FOREIGN KEY (tipo_recaudo_id) REFERENCES dbo.tipos_recaudo(id);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_registros_tipo_recaudo_id'
      AND object_id = OBJECT_ID('dbo.registros')
)
BEGIN
    CREATE INDEX IX_registros_tipo_recaudo_id
    ON dbo.registros(tipo_recaudo_id);
END;
GO
