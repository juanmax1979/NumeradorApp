param(
    [string]$SqlServer = "localhost",
    [string]$Database = "NumeradorDB",
    [string]$CsvPath = "C:\temp\Dependencias_Numerador.csv",
    [switch]$UseTrustedConnection = $true,
    [string]$SqlUser = "",
    [string]$SqlPassword = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $CsvPath)) {
    throw "No existe el archivo CSV en: $CsvPath"
}

# Importa CSV localmente (con tu usuario), evitando permisos de archivo en el servicio SQL Server.
$rows = Import-Csv -Path $CsvPath -Header "id_csv","nombre","activa","cod_dep_sigi","fuero","sistema_origen","cod_dep_externo"

if (-not $rows -or $rows.Count -eq 0) {
    throw "El CSV no contiene filas para importar."
}

function Get-TrimmedValue {
    param([object]$Value)
    if ($null -eq $Value) { return "" }
    return ([string]$Value).Trim()
}

$connectionString =
    if ($UseTrustedConnection) {
        "Server=$SqlServer;Database=$Database;Integrated Security=True;TrustServerCertificate=True"
    } else {
        if ([string]::IsNullOrWhiteSpace($SqlUser) -or [string]::IsNullOrWhiteSpace($SqlPassword)) {
            throw "Si no usas autenticacion integrada, debes indicar -SqlUser y -SqlPassword."
        }
        "Server=$SqlServer;Database=$Database;User ID=$SqlUser;Password=$SqlPassword;TrustServerCertificate=True"
    }

$conn = New-Object System.Data.SqlClient.SqlConnection($connectionString)
$conn.Open()

try {
    $createTemp = @"
IF OBJECT_ID('tempdb..#dependencias_import') IS NOT NULL
    DROP TABLE #dependencias_import;

CREATE TABLE #dependencias_import (
    nombre NVARCHAR(150) NULL,
    activa BIT NOT NULL,
    cod_dep_sigi NVARCHAR(50) NULL,
    fuero NVARCHAR(50) NOT NULL,
    sistema_origen NVARCHAR(50) NOT NULL,
    cod_dep_externo NVARCHAR(120) NULL
);
"@

    $cmd = $conn.CreateCommand()
    $cmd.CommandText = $createTemp
    [void]$cmd.ExecuteNonQuery()

    $table = New-Object System.Data.DataTable
    [void]$table.Columns.Add("nombre", [string])
    [void]$table.Columns.Add("activa", [bool])
    [void]$table.Columns.Add("cod_dep_sigi", [string])
    [void]$table.Columns.Add("fuero", [string])
    [void]$table.Columns.Add("sistema_origen", [string])
    [void]$table.Columns.Add("cod_dep_externo", [string])

    foreach ($r in $rows) {
        $nombre = Get-TrimmedValue $r.nombre
        if ([string]::IsNullOrWhiteSpace($nombre)) { continue }

        $activaRaw = Get-TrimmedValue $r.activa
        $activa = $true
        if ($activaRaw -eq "0") { $activa = $false }

        $codSigi = Get-TrimmedValue $r.cod_dep_sigi
        if ($codSigi -eq "") { $codSigi = $null }

        $fuero = (Get-TrimmedValue $r.fuero).ToUpperInvariant()
        if ($fuero -eq "") { $fuero = "PENAL" }

        $sistema = (Get-TrimmedValue $r.sistema_origen).ToUpperInvariant()
        if ($sistema -eq "") { $sistema = "SIGI" }

        $codExterno = Get-TrimmedValue $r.cod_dep_externo
        if ($codExterno -eq "") { $codExterno = $codSigi }

        [void]$table.Rows.Add($nombre, $activa, $codSigi, $fuero, $sistema, $codExterno)
    }

    $bulk = New-Object Data.SqlClient.SqlBulkCopy($conn)
    $bulk.DestinationTableName = "#dependencias_import"
    $bulk.BulkCopyTimeout = 120
    $bulk.WriteToServer($table)

    $mergeSql = @"
MERGE dbo.dependencias AS target
USING #dependencias_import AS src
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

SELECT COUNT(*) AS filas_importadas FROM #dependencias_import;
"@

    $cmd2 = $conn.CreateCommand()
    $cmd2.CommandText = $mergeSql
    $reader = $cmd2.ExecuteReader()
    while ($reader.Read()) {
        Write-Host ("Filas importadas: " + $reader["filas_importadas"])
    }
    $reader.Close()

    Write-Host "Importacion finalizada correctamente."
}
finally {
    $conn.Close()
}
