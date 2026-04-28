require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const swaggerUi = require("swagger-ui-express");
const { swaggerSpec } = require("./docs/swagger");

const authRoutes = require("./routes/authRoutes");
const recordRoutes = require("./routes/recordRoutes");
const statsRoutes = require("./routes/statsRoutes");
const userRoutes = require("./routes/userRoutes");
const metaRoutes = require("./routes/metaRoutes");
const sigiRoutes = require("./routes/sigiRoutes");
const systemIntegrationRoutes = require("./routes/systemIntegrationRoutes");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const app = express();

const defaultAllowedOrigins = [
  "http://localhost:5173",
  "http://192.168.56.1:5174",
  "http://localhost:4000",
];

const allowedOrigins = (
  process.env.FRONTEND_URLS ||
  process.env.FRONTEND_URL ||
  defaultAllowedOrigins.join(",")
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use("/api/auth", authRoutes);
app.use("/api/records", recordRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/users", userRoutes);
app.use("/api/meta", metaRoutes);
app.use("/api/sigi", sigiRoutes);
app.use("/api/integraciones", systemIntegrationRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
