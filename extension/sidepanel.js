import { extractVariables } from "./core/templateParser.js";
import { renderTemplate } from "./core/templateRenderer.js";
import { validateTemplate } from "./core/validation.js";
import { getTemplates, saveTemplates } from "./core/templatesStore.js";
import { serializeTemplates, validateImportPayload } from "./core/importExport.js";

const elements = {
  searchInput: document.getElementById("searchInput"),
  templateList: document.getElementById("templateList"),
  titleInput: document.getElementById("titleInput"),
  bodyInput: document.getElementById("bodyInput"),
  tagsInput: document.getElementById("tagsInput"),
  favoriteInput: document.getElementById("favoriteInput"),
  insertButton: document.getElementById("insertButton"),
  newButton: document.getElementById("newButton"),
  saveButton: document.getElementById("saveButton"),
  deleteButton: document.getElementById("deleteButton"),
  importButton: document.getElementById("importButton"),
  exportButton: document.getElementById("exportButton"),
  copyFallbackButton: document.getElementById("copyFallbackButton"),
  importFileInput: document.getElementById("importFileInput"),
  variableModal: document.getElementById("variableModal"),
  variableForm: document.getElementById("variableForm"),
  variableCancelButton: document.getElementById("variableCancelButton"),
  variableApplyButton: document.getElementById("variableApplyButton"),
  toastContainer: document.getElementById("toastContainer")
};

const state = {
  templates: [],
  selectedId: null,
  lastRenderedPrompt: "",
  variableSession: null
};

function createId() {
  if (crypto?.randomUUID) {
    return crypto.randomUUID();
  }
  return `tmpl_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function showToast(message, kind = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${kind === "error" ? "error" : ""}`.trim();
  toast.textContent = message;
  elements.toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function isTypingTarget(element) {
  if (!element || !(element instanceof HTMLElement)) {
    return false;
  }
  return (
    element.matches("input") ||
    element.matches("textarea") ||
    element.matches("[contenteditable='true']")
  );
}

function parseTagsFromInput(input) {
  return String(input ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function getSelectedTemplate() {
  if (!state.selectedId) {
    return null;
  }
  return state.templates.find((template) => template.id === state.selectedId) ?? null;
}

function getSortedFilteredTemplates() {
  const query = elements.searchInput.value.trim().toLowerCase();
  const filtered = state.templates.filter((template) => {
    if (!query) {
      return true;
    }
    const tags = Array.isArray(template.tags) ? template.tags.join(" ") : "";
    const haystack = `${template.title} ${template.body} ${tags}`.toLowerCase();
    return haystack.includes(query);
  });

  return filtered.sort((a, b) => {
    if (a.favorite !== b.favorite) {
      return a.favorite ? -1 : 1;
    }
    return String(b.updatedAt).localeCompare(String(a.updatedAt));
  });
}

function renderTemplateList() {
  const items = getSortedFilteredTemplates();
  elements.templateList.innerHTML = "";

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "template-item";
    empty.textContent = "No templates found.";
    elements.templateList.appendChild(empty);
    return;
  }

  for (const template of items) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `template-item ${state.selectedId === template.id ? "selected" : ""}`;
    item.innerHTML = `
      <div class="template-item-header">
        <span class="template-title">${template.title}</span>
        <span>${template.favorite ? "★" : ""}</span>
      </div>
      <div class="template-tags">${template.tags.join(", ")}</div>
    `;
    item.addEventListener("click", () => {
      selectTemplate(template.id);
    });
    elements.templateList.appendChild(item);
  }
}

function fillEditor(template) {
  elements.titleInput.value = template?.title ?? "";
  elements.bodyInput.value = template?.body ?? "";
  elements.tagsInput.value = (template?.tags ?? []).join(", ");
  elements.favoriteInput.checked = Boolean(template?.favorite);
}

function selectTemplate(templateId) {
  state.selectedId = templateId;
  fillEditor(getSelectedTemplate());
  renderTemplateList();
}

async function persistTemplates() {
  await saveTemplates(state.templates);
  renderTemplateList();
}

function getEditorDraft() {
  return {
    title: elements.titleInput.value,
    body: elements.bodyInput.value,
    tags: parseTagsFromInput(elements.tagsInput.value),
    favorite: elements.favoriteInput.checked
  };
}

async function onSaveTemplate() {
  const now = new Date().toISOString();
  const draft = getEditorDraft();
  const validation = validateTemplate(draft);
  if (!validation.ok) {
    showToast(validation.errors[0], "error");
    return;
  }

  if (state.selectedId) {
    state.templates = state.templates.map((template) =>
      template.id === state.selectedId
        ? {
            ...template,
            ...validation.normalized,
            updatedAt: now
          }
        : template
    );
    await persistTemplates();
    showToast("Template updated.");
    return;
  }

  const template = {
    id: createId(),
    ...validation.normalized,
    createdAt: now,
    updatedAt: now
  };
  state.templates = [template, ...state.templates];
  state.selectedId = template.id;
  await persistTemplates();
  renderTemplateList();
  showToast("Template created.");
}

async function onDeleteTemplate() {
  const selected = getSelectedTemplate();
  if (!selected) {
    showToast("Select a template to delete.", "error");
    return;
  }
  state.templates = state.templates.filter((template) => template.id !== selected.id);
  state.selectedId = null;
  fillEditor(null);
  await persistTemplates();
  showToast("Template deleted.");
}

function openVariableModal(template, variableNames) {
  elements.variableForm.innerHTML = "";
  const values = {};

  variableNames.forEach((name, index) => {
    const row = document.createElement("label");
    row.textContent = name;
    const input = document.createElement("input");
    input.name = name;
    input.required = true;
    row.appendChild(input);
    elements.variableForm.appendChild(row);
    if (index === 0) {
      input.focus();
    }
    values[name] = "";
  });

  state.variableSession = {
    template,
    variableNames,
    values
  };
  elements.variableModal.classList.remove("hidden");
}

function closeVariableModal() {
  state.variableSession = null;
  elements.variableModal.classList.add("hidden");
}

function setFallbackCopy(promptText) {
  state.lastRenderedPrompt = promptText;
  elements.copyFallbackButton.classList.toggle("hidden", !promptText);
}

async function requestInsert(renderedPrompt) {
  const response = await chrome.runtime.sendMessage({
    type: "INSERT_PROMPT",
    prompt: renderedPrompt
  });

  if (!response?.ok) {
    setFallbackCopy(renderedPrompt);
    showToast(response?.error ?? "Insertion failed. Use copy fallback.", "error");
    return;
  }

  setFallbackCopy("");
  showToast("Prompt inserted.");
}

async function onInsertTemplate() {
  const selected = getSelectedTemplate();
  if (!selected) {
    showToast("Select a template to insert.", "error");
    return;
  }

  const variableNames = extractVariables(selected.body);
  if (variableNames.length === 0) {
    await requestInsert(selected.body);
    return;
  }

  openVariableModal(selected, variableNames);
}

async function applyVariableModal() {
  const session = state.variableSession;
  if (!session) {
    return;
  }

  const values = {};
  for (const variableName of session.variableNames) {
    const input = elements.variableForm.querySelector(`[name="${variableName}"]`);
    const value = String(input?.value ?? "").trim();
    if (!value) {
      showToast(`Variable "${variableName}" is required.`, "error");
      return;
    }
    values[variableName] = value;
  }

  const rendered = renderTemplate(session.template.body, values);
  closeVariableModal();
  await requestInsert(rendered);
}

function downloadJson(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `prompt-library-export-${Date.now()}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function onExportTemplates() {
  downloadJson(serializeTemplates(state.templates));
  showToast("Export complete.");
}

function normalizeImportedTemplate(template) {
  const now = new Date().toISOString();
  return {
    id: template.id ? String(template.id) : createId(),
    title: template.title,
    body: template.body,
    tags: template.tags,
    favorite: Boolean(template.favorite),
    createdAt: template.createdAt ? String(template.createdAt) : now,
    updatedAt: template.updatedAt ? String(template.updatedAt) : now
  };
}

async function onImportFileSelected(file) {
  if (!file) {
    return;
  }

  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    showToast("Import file is not valid JSON.", "error");
    return;
  }

  const result = validateImportPayload(payload);
  if (!result.ok) {
    showToast(result.errors[0], "error");
    return;
  }

  state.templates = result.templates.map(normalizeImportedTemplate);
  state.selectedId = state.templates[0]?.id ?? null;
  await persistTemplates();
  fillEditor(getSelectedTemplate());
  showToast("Import complete.");
}

function onKeyboardShortcuts(event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    elements.searchInput.focus();
    return;
  }

  if (event.key.toLowerCase() === "n" && !isTypingTarget(document.activeElement)) {
    event.preventDefault();
    state.selectedId = null;
    fillEditor(null);
    renderTemplateList();
    return;
  }

  if (event.key === "Enter" && !isTypingTarget(document.activeElement)) {
    event.preventDefault();
    onInsertTemplate();
  }
}

async function initialize() {
  state.templates = await getTemplates();
  state.selectedId = state.templates[0]?.id ?? null;
  fillEditor(getSelectedTemplate());
  renderTemplateList();

  elements.searchInput.addEventListener("input", renderTemplateList);
  elements.newButton.addEventListener("click", () => {
    state.selectedId = null;
    fillEditor(null);
    renderTemplateList();
  });
  elements.saveButton.addEventListener("click", onSaveTemplate);
  elements.deleteButton.addEventListener("click", onDeleteTemplate);
  elements.insertButton.addEventListener("click", onInsertTemplate);
  elements.exportButton.addEventListener("click", onExportTemplates);
  elements.importButton.addEventListener("click", () => elements.importFileInput.click());
  elements.importFileInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    onImportFileSelected(file);
    event.target.value = "";
  });
  elements.variableCancelButton.addEventListener("click", closeVariableModal);
  elements.variableApplyButton.addEventListener("click", applyVariableModal);
  elements.copyFallbackButton.addEventListener("click", async () => {
    if (!state.lastRenderedPrompt) {
      return;
    }
    await navigator.clipboard.writeText(state.lastRenderedPrompt);
    showToast("Prompt copied to clipboard.");
  });
  document.addEventListener("keydown", onKeyboardShortcuts);
}

initialize();
