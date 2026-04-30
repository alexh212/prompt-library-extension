import { validateTemplate } from "./validation.js";

export function serializeTemplates(templates) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    templates: Array.isArray(templates) ? templates : []
  };
}

export function validateImportPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object") {
    return { ok: false, errors: ["Import payload must be an object."] };
  }

  if (payload.version !== 1) {
    errors.push("Import payload version must be 1.");
  }

  if (typeof payload.exportedAt !== "string" || Number.isNaN(Date.parse(payload.exportedAt))) {
    errors.push("Import payload exportedAt must be a valid ISO date string.");
  }

  if (!Array.isArray(payload.templates)) {
    errors.push("Import payload templates must be an array.");
  }

  const normalizedTemplates = [];
  if (Array.isArray(payload.templates)) {
    payload.templates.forEach((template, index) => {
      const result = validateTemplate(template);
      if (!result.ok) {
        errors.push(`Template ${index + 1} is invalid: ${result.errors.join(" ")}`);
      } else {
        normalizedTemplates.push(result.normalized);
      }
    });
  }

  return {
    ok: errors.length === 0,
    errors,
    templates: normalizedTemplates
  };
}
