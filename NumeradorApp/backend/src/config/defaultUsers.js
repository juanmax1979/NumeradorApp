const bcrypt = require("bcryptjs");
const { runQuery } = require("./db");

const DEFAULT_USERS = [
  { nombre: "Ayala Sartor Renzo E.", pass: "admin123", rol: "admin", dependencia: "Juzgado Correccional Charata" },
  { nombre: "Mujica Jorge", pass: "admin123", rol: "admin", dependencia: "Juzgado Correccional Charata" },
  { nombre: "Unger Nancy B.", pass: "1234", rol: "user", dependencia: "Juzgado Correccional Charata" },
  { nombre: "Igich Patricia", pass: "1234", rol: "user", dependencia: "Juzgado Correccional Charata" },
  { nombre: "Oleschuk Micaela", pass: "1234", rol: "user", dependencia: "Juzgado Correccional Charata" },
  { nombre: "Berndt Lucas", pass: "1234", rol: "user", dependencia: "Juzgado Correccional Charata" },
  { nombre: "Alvarez Matias", pass: "1234", rol: "user", dependencia: "Juzgado Correccional Charata" },
  { nombre: "Bazan Facundo", pass: "1234", rol: "user", dependencia: "Juzgado Correccional Charata" },
  { nombre: "Proteus (Robot)", pass: "robot", rol: "robot", dependencia: "Juzgado Correccional Charata" },
];

async function seedUsersIfEmpty() {
  const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
  const existing = await runQuery("SELECT COUNT(*) AS total FROM dbo.usuarios");
  if (existing.recordset[0].total > 0) {
    return;
  }

  for (const user of DEFAULT_USERS) {
    const hash = await bcrypt.hash(user.pass, rounds);
    await runQuery(
      `INSERT INTO dbo.usuarios (nombre, password_hash, rol, dependencia, dependencia_id)
       VALUES (
         @nombre,
         @password_hash,
         @rol,
         @dependencia,
         (SELECT TOP 1 id FROM dbo.dependencias WHERE nombre = @dependencia)
       )`,
      {
        nombre: user.nombre,
        password_hash: hash,
        rol: user.rol,
        dependencia: user.dependencia,
      }
    );
  }
}

module.exports = { seedUsersIfEmpty };
