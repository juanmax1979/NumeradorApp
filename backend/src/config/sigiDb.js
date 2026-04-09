const sql = require("mssql");

const sigiSqlConfig = {
  server: process.env.SIGI_SQLSERVER_HOST,
  port: Number(process.env.SIGI_SQLSERVER_PORT || 1433),
  database: process.env.SIGI_SQLSERVER_DATABASE,
  user: process.env.SIGI_SQLSERVER_USER,
  password: process.env.SIGI_SQLSERVER_PASSWORD,
  options: {
    encrypt: String(process.env.SIGI_SQLSERVER_ENCRYPT || "false") === "true",
    trustServerCertificate:
      String(process.env.SIGI_SQLSERVER_TRUST_CERT || "true") === "true",
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let sigiPool;

async function getSigiPool() {
  if (!sigiPool) {
    sigiPool = await new sql.ConnectionPool(sigiSqlConfig).connect();
  }
  return sigiPool;
}

async function executeSigiProcedure(procedureName, inputParams = {}) {
  const pool = await getSigiPool();
  const request = pool.request();

  Object.entries(inputParams).forEach(([key, value]) => {
    if (
      value !== null &&
      typeof value === "object" &&
      Object.prototype.hasOwnProperty.call(value, "type") &&
      Object.prototype.hasOwnProperty.call(value, "value")
    ) {
      request.input(key, value.type, value.value);
    } else {
      request.input(key, value);
    }
  });

  return request.execute(procedureName);
}

module.exports = {
  sql,
  executeSigiProcedure,
};

