/*
  Importa dependencias desde Dependencias_Numerador.csv a dbo.dependencias.
  - No inserta id (IDENTITY/autoincremental).
  - Hace upsert por nombre para evitar duplicados.
  - Actualiza activa, cod_dep_sigi, fuero, sistema_origen, cod_dep_externo.

  IMPORTANTE:
  1) Cambiar @csvPath por la ruta accesible por SQL Server.
  2) El archivo debe estar en UTF-8.
*/

USE NumeradorDB;
GO

-- Ruta detectada del CSV en este equipo.
-- Si SQL Server corre en otro servidor/usuario de servicio, usar una ruta accesible por ese servicio (ej: carpeta compartida UNC).
DECLARE @csvPath NVARCHAR(4000) = N'C:\Dependencias_Numerador.csv';

IF OBJECT_ID('tempdb..#dependencias_import') IS NOT NULL
    DROP TABLE #dependencias_import;

CREATE TABLE #dependencias_import (
    id_csv NVARCHAR(50) NULL,            -- primera columna del CSV (vacía)
    nombre NVARCHAR(150) NULL,
    activa_raw NVARCHAR(10) NULL,
    cod_dep_sigi NVARCHAR(50) NULL,
    fuero NVARCHAR(50) NULL,
    sistema_origen NVARCHAR(50) NULL,
    cod_dep_externo NVARCHAR(120) NULL
);

DECLARE @sql NVARCHAR(MAX) = N'
BULK INSERT #dependencias_import
FROM ''' + REPLACE(@csvPath, '''', '''''') + N'''
WITH (
    FORMAT = ''CSV'',
    FIELDQUOTE = ''"'',
    ROWTERMINATOR = ''0x0a'',
    CODEPAGE = ''65001'',
    TABLOCK
);';

EXEC sp_executesql @sql;

;WITH normalizado AS (
    SELECT
        NULLIF(LTRIM(RTRIM(nombre)), '') AS nombre,
        CASE
            WHEN TRY_CONVERT(INT, NULLIF(LTRIM(RTRIM(activa_raw)), '')) = 0 THEN CAST(0 AS BIT)
            ELSE CAST(1 AS BIT)
        END AS activa,
        NULLIF(LTRIM(RTRIM(cod_dep_sigi)), '') AS cod_dep_sigi,
        UPPER(ISNULL(NULLIF(LTRIM(RTRIM(fuero)), ''), 'PENAL')) AS fuero,
        UPPER(ISNULL(NULLIF(LTRIM(RTRIM(sistema_origen)), ''), 'SIGI')) AS sistema_origen,
        NULLIF(LTRIM(RTRIM(cod_dep_externo)), '') AS cod_dep_externo
    FROM #dependencias_import
)
MERGE dbo.dependencias AS target
USING (
    SELECT *
    FROM normalizado
    WHERE nombre IS NOT NULL
) AS src
ON target.nombre = src.nombre
WHEN MATCHED THEN
    UPDATE SET
        target.activa = src.activa,
        target.cod_dep_sigi = src.cod_dep_sigi,
        target.fuero = src.fuero,
        target.sistema_origen = src.sistema_origen,
        target.cod_dep_externo = COALESCE(src.cod_dep_externo, src.cod_dep_sigi)
WHEN NOT MATCHED THEN
    INSERT (nombre, activa, cod_dep_sigi, fuero, sistema_origen, cod_dep_externo)
    VALUES (src.nombre, src.activa, src.cod_dep_sigi, src.fuero, src.sistema_origen, COALESCE(src.cod_dep_externo, src.cod_dep_sigi));

SELECT
    COUNT(*) AS total_filas_csv,
    COUNT(CASE WHEN NULLIF(LTRIM(RTRIM(nombre)), '') IS NOT NULL THEN 1 END) AS filas_validas
FROM #dependencias_import;

DROP TABLE #dependencias_import;
