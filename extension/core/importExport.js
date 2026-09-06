import { validateTemplate } from "./validation.js";

export function serializeTemplates(templates, folders) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    folders: Array.isArray(folders) ? folders : [],
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

  if (payload.folders !== undefined && !Array.isArray(payload.folders)) {
    errors.push("Import payload folders must be an array when present.");
  }

  const normalizedTemplates = [];
  if (Array.isArray(payload.templates)) {
    payload.templates.forEach((template, index) => {
      const result = validateTemplate(template);
      if (!result.ok) {
        errors.push(`Template ${index + 1} is invalid: ${result.errors.join(" ")}`);
      } else {
        normalizedTemplates.push({
          ...result.normalized,
          folderId: template?.folderId ?? null
        });
      }
    });
  }

  const normalizedFolders = [];
  if (Array.isArray(payload.folders)) {
    payload.folders.forEach((folder, index) => {
      if (!folder || typeof folder !== "object") {
        errors.push(`Folder ${index + 1} is invalid: must be an object.`);
        return;
      }
      const name = String(folder.name ?? "").trim();
      const id = folder.id ? String(folder.id) : "";
      if (!name) {
        errors.push(`Folder ${index + 1} is invalid: name is required.`);
        return;
      }
      if (!id) {
        errors.push(`Folder ${index + 1} is invalid: id is required.`);
        return;
      }
      normalizedFolders.push({
        id,
        name,
        createdAt: folder.createdAt ? String(folder.createdAt) : new Date().toISOString()
      });
    });
  }

  return {
    ok: errors.length === 0,
    errors,
    templates: normalizedTemplates,
    folders: normalizedFolders
  };
}
