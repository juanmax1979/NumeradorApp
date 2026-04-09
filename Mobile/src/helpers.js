import dayjs from "dayjs";

export const TYPES = [
  "OFICIO",
  "AUTO",
  "SENTENCIA TRAMITE",
  "SENTENCIA RELATORIA",
];

export const TAB_KEYS = [...TYPES, "BUSCADOR", "ESTADISTICAS"];

export const CAPTCHA_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const PAGE_SIZE_OPTIONS = [10, 20, 50];

export const EXPEDIENTE_REGEX = /^\d{1,8}\/\d{4}-\d{1,4}$/;

export function fmtDate(value) {
  if (!value) return "-";
  return dayjs(value).format("DD/MM/YYYY HH:mm");
}

export function normalizeExpedienteInput(rawValue) {
  const cleaned = String(rawValue || "").replace(/[^\d/-]/g, "");
  let left = "";
  let year = "";
  let circ = "";
  let stage = 0;

  for (const ch of cleaned) {
    if (stage === 0) {
      if (/\d/.test(ch) && left.length < 8) {
        left += ch;
      } else if (ch === "/" && left.length > 0) {
        stage = 1;
      }
      continue;
    }

    if (stage === 1) {
      if (/\d/.test(ch) && year.length < 4) {
        year += ch;
      } else if (ch === "-" && year.length === 4) {
        stage = 2;
      }
      continue;
    }

    if (stage === 2) {
      if (/\d/.test(ch) && circ.length < 4) {
        circ += ch;
      }
    }
  }

  let result = left;
  if (stage >= 1 || year.length > 0) {
    result += `/${year}`;
  }
  if (stage >= 2 || circ.length > 0) {
    result += `-${circ}`;
  }
  return result;
}

export function isValidExpediente(value) {
  return EXPEDIENTE_REGEX.test(String(value || "").trim());
}

export function generateCaptchaCode(length = 6) {
  let value = "";
  for (let i = 0; i < length; i += 1) {
    value += CAPTCHA_CHARS[Math.floor(Math.random() * CAPTCHA_CHARS.length)];
  }
  return value;
}
