-- Datos de anulación (motivo, observación, usuario y fecha). Ejecutar en bases ya creadas antes de este cambio.
IF COL_LENGTH('dbo.registros', 'anulado_por') IS NULL
BEGIN
    ALTER TABLE dbo.registros ADD anulado_por NVARCHAR(120) NOT NULL DEFAULT '';
END;
IF COL_LENGTH('dbo.registros', 'anulacion_motivo') IS NULL
BEGIN
    ALTER TABLE dbo.registros ADD anulacion_motivo NVARCHAR(80) NOT NULL DEFAULT '';
END;
IF COL_LENGTH('dbo.registros', 'anulacion_observacion') IS NULL
BEGIN
    ALTER TABLE dbo.registros ADD anulacion_observacion NVARCHAR(400) NOT NULL DEFAULT '';
END;
IF COL_LENGTH('dbo.registros', 'anulacion_fecha') IS NULL
BEGIN
    ALTER TABLE dbo.registros ADD anulacion_fecha DATETIME2 NULL;
END;
GO
