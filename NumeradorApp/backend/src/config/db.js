const sql = require("mssql");

const sqlConfig = {
  server: process.env.SQLSERVER_HOST,
  port: Number(process.env.SQLSERVER_PORT || 1433),
  database: process.env.SQLSERVER_DATABASE,
  user: process.env.SQLSERVER_USER,
  password: process.env.SQLSERVER_PASSWORD,
  options: {
    encrypt: String(process.env.SQLSERVER_ENCRYPT || "false") === "true",
    trustServerCertificate:
      String(process.env.SQLSERVER_TRUST_CERT || "true") === "true",
  },
  pool: {
    max: 15,
    min: 1,
    idleTimeoutMillis: 30000,
  },
};

let pool;

async function getPool() {
  if (!pool) {
    pool = await sql.connect(sqlConfig);
  }
  return pool;
}

async function runQuery(queryText, bindings = {}) {
  const activePool = await getPool();
  const request = activePool.request();
  Object.entries(bindings).forEach(([key, value]) => {
    request.input(key, value);
  });
  return request.query(queryText);
}

module.exports = {
  sql,
  getPool,
  runQuery,
};
