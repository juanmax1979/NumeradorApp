const { Client } = require("ldapts");

function isActiveDirectoryAuthEnabled() {
  return String(process.env.AUTH_PROVIDER || "local").toLowerCase() === "ad";
}

function escapeLdapFilter(value) {
  return String(value)
    .replace(/\\/g, "\\5c")
    .replace(/\*/g, "\\2a")
    .replace(/\(/g, "\\28")
    .replace(/\)/g, "\\29")
    .replace(/\0/g, "\\00");
}

function normalizeAdUsername(rawUsername) {
  const raw = String(rawUsername || "").trim();
  if (!raw) return { raw: "", samAccountName: "" };

  // DOMAIN\usuario -> usuario
  if (raw.includes("\\")) {
    const parts = raw.split("\\");
    const sam = String(parts[parts.length - 1] || "").trim();
    return { raw, samAccountName: sam };
  }

  // usuario@dominio -> usuario
  if (raw.includes("@")) {
    const sam = String(raw.split("@")[0] || "").trim();
    return { raw, samAccountName: sam };
  }

  return { raw, samAccountName: raw };
}

function isInvalidCredentialsError(error) {
  const text = `${error?.name || ""} ${error?.message || ""}`.toLowerCase();
  return Number(error?.code) === 49 || text.includes("invalidcredentials");
}

function buildPrincipalFromUsername(username) {
  const raw = String(username || "").trim();
  if (!raw) return raw;
  if (raw.includes("@") || raw.includes("\\")) return raw;

  const upnSuffix = String(process.env.AD_UPN_SUFFIX || "").trim();
  if (upnSuffix) return `${raw}@${upnSuffix}`;
  return raw;
}

function firstAttrValue(entry, key) {
  let value = entry?.[key];
  if (value === undefined && entry && key) {
    const normalized = String(key).toLowerCase();
    const hit = Object.keys(entry).find((k) => String(k).toLowerCase() === normalized);
    if (hit) value = entry[hit];
  }
  if (Array.isArray(value)) return String(value[0] || "").trim();
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function resolveDniFromEntry(entry) {
  const preferred = String(process.env.AD_DNI_ATTRIBUTE || "employeeID").trim();
  const fallbacks = String(process.env.AD_DNI_FALLBACK_ATTRIBUTES || "employeeNumber,serialNumber")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const attrs = [preferred, ...fallbacks];
  const raw = attrs.map((attr) => firstAttrValue(entry, attr)).find((v) => v);
  if (!raw) return null;
  return raw.replace(/\D/g, "") || null;
}

function resolveFullNameFromEntry(entry) {
  const fullNameAttr = String(process.env.AD_FULLNAME_ATTRIBUTE || "displayName").trim();
  const fullName = firstAttrValue(entry, fullNameAttr) || firstAttrValue(entry, "cn");
  return fullName || null;
}

async function authenticateAgainstActiveDirectory(username, password) {
  const url = String(process.env.AD_URL || "").trim();
  const baseDn = String(process.env.AD_BASE_DN || "").trim();
  if (!url || !baseDn) {
    throw new Error("Falta configurar AD_URL o AD_BASE_DN");
  }

  const bindDn = String(process.env.AD_BIND_DN || "").trim();
  const bindPassword = String(process.env.AD_BIND_PASSWORD || "");
  const normalized = normalizeAdUsername(username);
  const userFilterTemplate = String(
    process.env.AD_USER_FILTER ||
      "(|(sAMAccountName={{username}})(userPrincipalName={{username_raw}}))"
  ).trim();
  const escapedSam = escapeLdapFilter(normalized.samAccountName || normalized.raw);
  const escapedRaw = escapeLdapFilter(normalized.raw || normalized.samAccountName);
  const userFilter = userFilterTemplate
    .replace(/\{\{\s*username\s*\}\}/gi, escapedSam)
    .replace(/\{\{\s*username_raw\s*\}\}/gi, escapedRaw);
  const connectTimeout = Number(process.env.AD_CONNECT_TIMEOUT_MS || 5000);
  const operationTimeout = Number(process.env.AD_TIMEOUT_MS || 10000);
  const client = new Client({
    url,
    connectTimeout,
    timeout: operationTimeout,
    idleTimeout: operationTimeout,
  });

  try {
    if (bindDn) {
      await client.bind(bindDn, bindPassword);
      const searchResult = await client.search(baseDn, {
        scope: "sub",
        filter: userFilter,
        attributes: [
          "dn",
          "cn",
          "sAMAccountName",
          "userPrincipalName",
          String(process.env.AD_DNI_ATTRIBUTE || "employeeID").trim(),
          String(process.env.AD_FULLNAME_ATTRIBUTE || "displayName").trim(),
        ],
      });
      const entry = searchResult?.searchEntries?.[0];
      if (!entry?.dn) return { ok: false };

      const candidateName =
        String(entry.sAMAccountName || entry.userPrincipalName || username).trim();
      await client.bind(entry.dn, password);
      return {
        ok: true,
        username: candidateName,
        dni: resolveDniFromEntry(entry),
        fullName: resolveFullNameFromEntry(entry),
      };
    }

    const principal = buildPrincipalFromUsername(username);
    await client.bind(principal, password);
    try {
      const postBindSearch = await client.search(baseDn, {
        scope: "sub",
        filter: userFilter,
        attributes: [
          "cn",
          "sAMAccountName",
          "userPrincipalName",
          String(process.env.AD_DNI_ATTRIBUTE || "employeeID").trim(),
          String(process.env.AD_FULLNAME_ATTRIBUTE || "displayName").trim(),
        ],
      });
      const entry = postBindSearch?.searchEntries?.[0];
      if (entry) {
        const candidateName =
          String(entry.sAMAccountName || entry.userPrincipalName || username).trim();
        return {
          ok: true,
          username: candidateName,
          dni: resolveDniFromEntry(entry),
          fullName: resolveFullNameFromEntry(entry),
        };
      }
    } catch (_) {
      // Algunos AD no permiten búsqueda con credenciales de usuario final.
    }
    return { ok: true, username: String(username).trim(), dni: null, fullName: null };
  } catch (error) {
    if (isInvalidCredentialsError(error)) {
      return { ok: false };
    }
    throw error;
  } finally {
    await client.unbind().catch(() => {});
  }
}

module.exports = {
  isActiveDirectoryAuthEnabled,
  authenticateAgainstActiveDirectory,
};
