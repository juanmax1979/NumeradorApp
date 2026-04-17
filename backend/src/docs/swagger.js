const swaggerJSDoc = require("swagger-jsdoc");

const PORT = Number(process.env.PORT || 4000);
const BASE_URL = process.env.BACKEND_PUBLIC_URL || `http://localhost:${PORT}`;

const tipoExpediente = {
  type: "string",
  pattern: "^\\d{1,5}/\\d{4}-\\d$",
  example: "12345/2026-1",
  description:
    "Formato NNNNN/AAAA-C (hasta 5 dígitos antes de la barra)",
};

const options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Numerador Backend API",
      version: "1.0.0",
      description:
        "API del backend Numerador. Usa Authorize con el token JWT (Bearer) devuelto por POST /api/auth/login. " +
        "El refresh usa cookie httpOnly; en Swagger puede que debas iniciar sesión desde el mismo navegador o repetir login.",
    },
    servers: [{ url: BASE_URL }],
    tags: [
      { name: "Auth", description: "Login, refresh y sesión" },
      { name: "Records", description: "Registros / numeración" },
      { name: "Stats", description: "Estadísticas" },
      { name: "Users", description: "Usuarios (admin)" },
      { name: "Meta", description: "Salud, catálogos y dependencias" },
      { name: "SIGI", description: "Procedimientos almacenados SIGI" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        ErrorResponse: {
          type: "object",
          properties: {
            message: { type: "string" },
            errors: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  path: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
        LoginRequest: {
          type: "object",
          required: ["usuario", "password"],
          properties: {
            usuario: { type: "string", maxLength: 120 },
            password: { type: "string", maxLength: 128 },
            pcName: { type: "string", maxLength: 120 },
            forceSession: { type: "boolean" },
          },
        },
        ChangePasswordRequest: {
          type: "object",
          required: ["currentPassword", "newPassword"],
          properties: {
            currentPassword: { type: "string", minLength: 4, maxLength: 128 },
            newPassword: { type: "string", minLength: 8, maxLength: 128 },
          },
        },
        CreateRecordRequest: {
          type: "object",
          required: ["tipo", "expediente"],
          properties: {
            tipo: {
              type: "string",
              enum: [
                "OFICIO",
                "AUTO",
                "SENTENCIA TRAMITE",
                "SENTENCIA RELATORIA",
              ],
            },
            expediente: tipoExpediente,
            detalle: { type: "string", maxLength: 500, default: "" },
          },
        },
        UpdateRecordRequest: {
          type: "object",
          required: ["expediente", "detalle"],
          properties: {
            expediente: tipoExpediente,
            detalle: { type: "string", maxLength: 500 },
          },
        },
        ResetPasswordRequest: {
          type: "object",
          required: ["newPassword"],
          properties: {
            newPassword: { type: "string", minLength: 8, maxLength: 128 },
          },
        },
        UpdateDependenciaRequest: {
          type: "object",
          required: ["dependenciaId"],
          properties: {
            dependenciaId: { type: "integer", minimum: 1 },
          },
        },
        UpdateDniRequest: {
          type: "object",
          required: ["dni"],
          properties: {
            dni: {
              type: "string",
              maxLength: 20,
              pattern: "^\\d*$",
              example: "12345678",
            },
          },
        },
        SigiUsuarioRequest: {
          type: "object",
          description:
            "Usá `dni` o `dniUsuarioSigi` (uno solo). El SP usa @dniUsuarioSigi INT; el backend envía el valor como entero SQL. Podés mandar string o número en JSON.",
          properties: {
            dni: {
              oneOf: [
                { type: "string", pattern: "^\\d{7,8}$", example: "27324828" },
                { type: "integer", minimum: 1000000, example: 27324828 },
              ],
            },
            dniUsuarioSigi: {
              oneOf: [
                { type: "string", pattern: "^\\d{7,8}$", example: "27324828" },
                { type: "integer", minimum: 1000000, example: 27324828 },
              ],
            },
          },
        },
        SigiExpedienteRequest: {
          type: "object",
          description:
            "Usá `expediente` o `NroExpediente` (uno solo). El SP usa @NroExpediente VARCHAR(50).",
          properties: {
            expediente: {
              type: "string",
              maxLength: 50,
              pattern: "^\\d{1,8}/\\d{4}-\\d{1,4}$",
              example: "3500384/2026-91",
            },
            NroExpediente: {
              type: "string",
              maxLength: 50,
              pattern: "^\\d{1,8}/\\d{4}-\\d{1,4}$",
              example: "3500384/2026-91",
            },
          },
        },
      },
    },
    paths: {
      "/api/auth/login": {
        post: {
          tags: ["Auth"],
          summary: "Iniciar sesión",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LoginRequest" },
              },
            },
          },
          responses: {
            200: { description: "OK — devuelve token y usuario; puede fijar cookie de refresh" },
            400: {
              description: "Datos inválidos",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            401: { description: "Credenciales inválidas" },
            409: {
              description: "Sesión activa (code SESSION_ACTIVE si aplica)",
            },
          },
        },
      },
      "/api/auth/refresh": {
        post: {
          tags: ["Auth"],
          summary: "Renovar access token",
          description:
            "Envía la cookie httpOnly de refresh (path /api/auth) si existe tras el login.",
          responses: {
            200: { description: "Nuevo token" },
            401: { description: "Refresh inválido o ausente" },
          },
        },
      },
      "/api/auth/change-password": {
        post: {
          tags: ["Auth"],
          summary: "Cambiar contraseña del usuario actual",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ChangePasswordRequest" },
              },
            },
          },
          responses: {
            200: { description: "OK" },
            400: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            401: { description: "No autenticado" },
          },
        },
      },
      "/api/auth/logout": {
        post: {
          tags: ["Auth"],
          summary: "Cerrar sesión",
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: "OK" },
            401: { description: "No autenticado" },
          },
        },
      },

      "/api/records": {
        get: {
          tags: ["Records"],
          summary: "Listar registros",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "tipo",
              in: "query",
              schema: {
                type: "string",
                enum: [
                  "OFICIO",
                  "AUTO",
                  "SENTENCIA TRAMITE",
                  "SENTENCIA RELATORIA",
                  "TODOS",
                ],
              },
            },
            { name: "q", in: "query", schema: { type: "string", maxLength: 200 } },
            { name: "from", in: "query", schema: { type: "string", maxLength: 25 } },
            { name: "to", in: "query", schema: { type: "string", maxLength: 25 } },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 500, default: 200 },
            },
          ],
          responses: {
            200: { description: "Lista de registros" },
            400: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            401: { description: "No autenticado" },
          },
        },
        post: {
          tags: ["Records"],
          summary: "Crear registro",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateRecordRequest" },
              },
            },
          },
          responses: {
            201: { description: "Creado" },
            400: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            401: { description: "No autenticado" },
          },
        },
      },
      "/api/records/export.xlsx": {
        get: {
          tags: ["Records"],
          summary: "Exportar registros a Excel",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "tipo",
              in: "query",
              schema: {
                type: "string",
                enum: [
                  "OFICIO",
                  "AUTO",
                  "SENTENCIA TRAMITE",
                  "SENTENCIA RELATORIA",
                  "TODOS",
                ],
              },
            },
            { name: "q", in: "query", schema: { type: "string", maxLength: 200 } },
            { name: "from", in: "query", schema: { type: "string", maxLength: 25 } },
            { name: "to", in: "query", schema: { type: "string", maxLength: 25 } },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 2000, default: 1000 },
            },
          ],
          responses: {
            200: { description: "Archivo xlsx (binario)" },
            400: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            401: { description: "No autenticado" },
          },
        },
      },
      "/api/records/next-number/{tipo}": {
        get: {
          tags: ["Records"],
          summary: "Próximo número sugerido por tipo",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "tipo",
              in: "path",
              required: true,
              schema: {
                type: "string",
                enum: [
                  "OFICIO",
                  "AUTO",
                  "SENTENCIA TRAMITE",
                  "SENTENCIA RELATORIA",
                ],
              },
            },
          ],
          responses: {
            200: { description: "Ej. { proximo: ... }" },
            401: { description: "No autenticado" },
          },
        },
      },
      "/api/records/{id}": {
        put: {
          tags: ["Records"],
          summary: "Actualizar registro",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UpdateRecordRequest" },
              },
            },
          },
          responses: {
            200: { description: "OK" },
            400: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            401: { description: "No autenticado" },
            404: { description: "No encontrado" },
          },
        },
        delete: {
          tags: ["Records"],
          summary: "Eliminar registro (solo admin)",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "OK" },
            401: { description: "No autenticado" },
            403: { description: "No autorizado" },
            404: { description: "No encontrado" },
          },
        },
      },
      "/api/records/{id}/toggle-remitido": {
        post: {
          tags: ["Records"],
          summary: "Alternar remitido",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "OK" },
            401: { description: "No autenticado" },
            404: { description: "No encontrado" },
          },
        },
      },
      "/api/records/{id}/annul": {
        post: {
          tags: ["Records"],
          summary: "Anular registro",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["motivo"],
                  properties: {
                    motivo: {
                      type: "string",
                      enum: [
                        "Decreto no firmado",
                        "Rechazado por incongruencias",
                        "Otro",
                      ],
                    },
                    observacion: { type: "string", maxLength: 400 },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "OK" },
            400: { description: "Motivo inválido o registro ya anulado" },
            401: { description: "No autenticado" },
            403: { description: "No autorizado" },
            404: { description: "No encontrado" },
          },
        },
      },

      "/api/stats": {
        get: {
          tags: ["Stats"],
          summary: "Estadísticas por año",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "year",
              in: "query",
              schema: { type: "integer", example: 2026 },
              description: "Año (por defecto año actual en servidor)",
            },
          ],
          responses: {
            200: { description: "Totales, mensual, ranking, auditoría (admin)" },
            400: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            401: { description: "No autenticado" },
          },
        },
      },

      "/api/users": {
        get: {
          tags: ["Users"],
          summary: "Listar usuarios (admin)",
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: "Lista" },
            401: { description: "No autenticado" },
            403: { description: "No autorizado" },
          },
        },
      },
      "/api/users/{nombre}/password": {
        put: {
          tags: ["Users"],
          summary: "Resetear contraseña de usuario (admin)",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "nombre", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ResetPasswordRequest" },
              },
            },
          },
          responses: {
            200: { description: "OK" },
            400: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            401: { description: "No autenticado" },
            403: { description: "No autorizado" },
            404: { description: "Usuario no encontrado" },
          },
        },
      },
      "/api/users/{nombre}/dependencia": {
        put: {
          tags: ["Users"],
          summary: "Actualizar dependencia de usuario (admin)",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "nombre", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UpdateDependenciaRequest" },
              },
            },
          },
          responses: {
            200: { description: "OK" },
            400: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            401: { description: "No autenticado" },
            403: { description: "No autorizado" },
            404: { description: "Usuario no encontrado" },
          },
        },
      },
      "/api/users/{nombre}/dni": {
        put: {
          tags: ["Users"],
          summary: "Actualizar DNI de usuario (admin)",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "nombre", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UpdateDniRequest" },
              },
            },
          },
          responses: {
            200: { description: "OK" },
            400: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            401: { description: "No autenticado" },
            403: { description: "No autorizado" },
            404: { description: "Usuario no encontrado" },
          },
        },
      },

      "/api/meta/health": {
        get: {
          tags: ["Meta"],
          summary: "Health check",
          responses: {
            200: { description: "Servicio OK" },
          },
        },
      },
      "/api/meta/categorias": {
        get: {
          tags: ["Meta"],
          summary: "Catálogo de categorías",
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: "JSON de categorías" },
            401: { description: "No autenticado" },
          },
        },
      },
      "/api/meta/dependencias": {
        get: {
          tags: ["Meta"],
          summary: "Listar dependencias",
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: "Lista" },
            401: { description: "No autenticado" },
          },
        },
      },

      "/api/sigi/usuario": {
        post: {
          tags: ["SIGI"],
          summary: "procNumeradorDatosUsuarioSIGI_DepsCircNomyApe — por DNI",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SigiUsuarioRequest" },
              },
            },
          },
          responses: {
            200: { description: "Resultado del SP" },
            400: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            401: { description: "No autenticado" },
          },
        },
      },
      "/api/sigi/expediente": {
        post: {
          tags: ["SIGI"],
          summary: "procNumeradorDatosExpteCaratProcDepRadic — por expediente",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SigiExpedienteRequest" },
              },
            },
          },
          responses: {
            200: { description: "Resultado del SP" },
            400: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            401: { description: "No autenticado" },
          },
        },
      },
      "/api/sigi/sp1": {
        post: {
          tags: ["SIGI"],
          summary: "Alias de /api/sigi/usuario",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SigiUsuarioRequest" },
              },
            },
          },
          responses: {
            200: { description: "Resultado del SP" },
            401: { description: "No autenticado" },
          },
        },
      },
      "/api/sigi/sp2": {
        post: {
          tags: ["SIGI"],
          summary: "Alias de /api/sigi/expediente",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SigiExpedienteRequest" },
              },
            },
          },
          responses: {
            200: { description: "Resultado del SP" },
            401: { description: "No autenticado" },
          },
        },
      },
    },
  },
  apis: [],
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = {
  swaggerSpec,
};
