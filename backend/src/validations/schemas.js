const { z } = require("zod");

const expedienteRegex = /^\d{1,5}\/\d{4}-\d$/;

const tiposEnum = z.enum([
  "OFICIO",
  "AUTO",
  "SENTENCIA TRAMITE",
  "SENTENCIA RELATORIA",
]);

const loginSchema = z.object({
  usuario: z.string().min(1).max(120),
  password: z.string().min(1).max(128),
  pcName: z.string().max(120).optional(),
  forceSession: z.boolean().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(4).max(128),
  newPassword: z.string().min(8).max(128),
});

const createRecordSchema = z.object({
  tipo: tiposEnum,
  expediente: z
    .string()
    .trim()
    .regex(
      expedienteRegex,
      "Expediente inválido. Debe tener formato NNNNN/AAAA-C (hasta 5 dígitos + '/' + 4 dígitos + '-' + 1 dígito)"
    ),
  detalle: z.string().trim().max(500).optional().default(""),
});

const updateRecordSchema = z.object({
  expediente: z
    .string()
    .trim()
    .regex(
      expedienteRegex,
      "Expediente inválido. Debe tener formato NNNNN/AAAA-C (hasta 5 dígitos + '/' + 4 dígitos + '-' + 1 dígito)"
    ),
  detalle: z.string().trim().max(500),
});

const listRecordsQuerySchema = z.object({
  tipo: z.union([tiposEnum, z.literal("TODOS")]).optional(),
  q: z.string().max(200).optional().default(""),
  from: z.string().max(25).optional(),
  to: z.string().max(25).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(200),
});

const exportRecordsQuerySchema = z.object({
  tipo: z.union([tiposEnum, z.literal("TODOS")]).optional(),
  q: z.string().max(200).optional().default(""),
  from: z.string().max(25).optional(),
  to: z.string().max(25).optional(),
  limit: z.coerce.number().int().min(1).max(2000).optional().default(1000),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8).max(128),
});

const updateDependenciaSchema = z.object({
  dependenciaId: z.coerce.number().int().positive(),
});

module.exports = {
  tiposEnum,
  loginSchema,
  changePasswordSchema,
  createRecordSchema,
  updateRecordSchema,
  listRecordsQuerySchema,
  exportRecordsQuerySchema,
  resetPasswordSchema,
  updateDependenciaSchema,
};
