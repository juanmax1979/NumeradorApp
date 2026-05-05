const jwt = require("jsonwebtoken");

function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ message: "Token no enviado" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Token inválido o vencido" });
  }
}

function requireRole(...roles) {
  const normalized = roles.map((r) => String(r).trim().toLowerCase());
  const isAdminExpected = normalized.includes("admin") || normalized.includes("1");
  return (req, res, next) => {
    const rolId = Number(req.user?.rolId);
    const rolName = String(req.user?.rol || "").trim().toLowerCase();
    const isAdmin = rolId === 1 || rolName === "admin";
    if (!req.user || (isAdminExpected && !isAdmin)) {
      return res.status(403).json({ message: "No autorizado" });
    }
    return next();
  };
}

module.exports = { authRequired, requireRole };
