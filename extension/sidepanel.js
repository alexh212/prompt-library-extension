import { extractVariables } from "./core/templateParser.js";
import { renderTemplate } from "./core/templateRenderer.js";
import { validateTemplate } from "./core/validation.js";
import {
  DEFAULT_FOLDER_NAME,
  loadState,
  saveTemplatesAndFolders
} from "./core/templatesStore.js";
import { serializeTemplates, validateImportPayload } from "./core/importExport.js";

const ALL_TAB_ID = "__all";

const elements = {
  headerMeta: document.getElementById("headerMeta"),
  folderTabs: document.getElementById("folderTabs"),
  searchInput: document.getElementById("searchInput"),
  newButton: document.getElementById("newButton"),
  importButton: document.getElementById("importButton"),
  exportButton: document.getElementById("exportButton"),
  importFileInput: document.getElementById("importFileInput"),
  templateList: document.getElementById("templateList"),
  editorSheet: document.getElementById("editorSheet"),
  sheetTitle: document.getElementById("sheetTitle"),
  sheetCloseButton: document.getElementById("sheetCloseButton"),
  titleInput: document.getElementById("titleInput"),
  folderSelect: document.getElementById("folderSelect"),
  bodyInput: document.getElementById("bodyInput"),
  tagsInput: document.getElementById("tagsInput"),
  favoriteInput: document.getElementById("favoriteInput"),
  deleteButton: document.getElementById("deleteButton"),
  saveButton: document.getElementById("saveButton"),
  saveInsertButton: document.getElementById("saveInsertButton"),
  copyFallbackButton: document.getElementById("copyFallbackButton"),
  variableModal: document.getElementById("variableModal"),
  variableForm: document.getElementById("variableForm"),
  variableCancelButton: document.getElementById("variableCancelButton"),
  variableApplyButton: document.getElementById("variableApplyButton"),
  toastContainer: document.getElementById("toastContainer")
};

const state = {
  folders: [],
  templates: [],
  activeFolderId: ALL_TAB_ID,
  editingId: null,
  searchQuery: "",
  searchTimer: null,
  variableSession: null,
  lastRenderedPrompt: ""
};

function createId(prefix) {
  if (crypto?.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function showToast(message, kind = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${kind === "error" ? "error" : ""}`.trim();
  toast.textContent = message;
  elements.toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 2400);
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

function getDefaultFolder() {
  return (
    state.folders.find((folder) => folder.name === DEFAULT_FOLDER_NAME) ?? state.folders[0] ?? null
  );
}

function getFolderById(folderId) {
  return state.folders.find((folder) => folder.id === folderId) ?? null;
}

function templatesInFolder(folderId) {
  if (folderId === ALL_TAB_ID) {
    return state.templates;
  }
  return state.templates.filter((template) => template.folderId === folderId);
}

function getVisibleTemplates() {
  const folderTemplates = templatesInFolder(state.activeFolderId);
  const query = state.searchQuery;
  const filtered = folderTemplates.filter((template) => {
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

function renderHeaderMeta() {
  const total = state.templates.length;
  const folder = state.folders.length;
  elements.headerMeta.textContent = `${total} prompts · ${folder} folders`;
}

function renderFolderTabs() {
  elements.folderTabs.innerHTML = "";

  const allTab = createFolderTab({
    id: ALL_TAB_ID,
    name: "All",
    count: state.templates.length,
    isProtected: true
  });
  elements.folderTabs.appendChild(allTab);

  for (const folder of state.folders) {
    const count = templatesInFolder(folder.id).length;
    const isProtected = folder.name === DEFAULT_FOLDER_NAME;
    elements.folderTabs.appendChild(
      createFolderTab({
        id: folder.id,
        name: folder.name,
        count,
        isProtected
      })
    );
  }

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "folder-tab-add";
  addButton.textContent = "+ Folder";
  addButton.addEventListener("click", onAddFolder);
  elements.folderTabs.appendChild(addButton);
}

function createFolderTab({ id, name, count, isProtected }) {
  const tab = document.createElement("button");
  tab.type = "button";
  tab.className = "folder-tab";
  tab.setAttribute("aria-selected", state.activeFolderId === id ? "true" : "false");
  tab.dataset.folderId = id;

  const label = document.createElement("span");
  label.className = "folder-tab-label";
  label.textContent = name;
  tab.appendChild(label);

  const counter = document.createElement("span");
  counter.className = "count";
  counter.textContent = String(count);
  tab.appendChild(counter);

  tab.addEventListener("click", () => {
    state.activeFolderId = id;
    renderFolderTabs();
    renderTemplateList();
  });

  if (id !== ALL_TAB_ID) {
    label.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      startInlineRename(tab, id, name);
    });

    if (!isProtected) {
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "tab-action";
      removeButton.textContent = "×";
      removeButton.title = "Delete folder";
      removeButton.addEventListener("click", (event) => {
        event.stopPropagation();
        onDeleteFolder(id);
      });
      tab.appendChild(removeButton);
    }
  }

  return tab;
}

function startInlineRename(tab, folderId, currentName) {
  const label = tab.querySelector(".folder-tab-label");
  if (!label) {
    return;
  }

  const input = document.createElement("input");
  input.type = "text";
  input.value = currentName;
  input.className = "folder-rename-input";
  input.maxLength = 40;
  label.replaceWith(input);
  input.focus();
  input.select();

  const finalize = async (commit) => {
    const value = input.value.trim();
    if (commit && value && value !== currentName) {
      await renameFolder(folderId, value);
    } else {
      renderFolderTabs();
    }
  };

  input.addEventListener("blur", () => finalize(true));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      finalize(false);
    }
  });
}

async function onAddFolder() {
  const name = window.prompt("Name this folder", "");
  if (name === null) {
    return;
  }
  const trimmed = name.trim();
  if (!trimmed) {
    showToast("Folder name is required.", "error");
    return;
  }
  if (trimmed.length > 40) {
    showToast("Folder name must be 40 characters or fewer.", "error");
    return;
  }
  if (state.folders.some((folder) => folder.name.toLowerCase() === trimmed.toLowerCase())) {
    showToast("A folder with that name already exists.", "error");
    return;
  }

  const folder = {
    id: createId("folder"),
    name: trimmed,
    createdAt: new Date().toISOString()
  };
  state.folders = [...state.folders, folder];
  state.activeFolderId = folder.id;
  await persistAll();
  renderAll();
  showToast("Folder added.");
}

async function renameFolder(folderId, newName) {
  if (state.folders.some((folder) => folder.id !== folderId && folder.name.toLowerCase() === newName.toLowerCase())) {
    showToast("Another folder already uses that name.", "error");
    renderFolderTabs();
    return;
  }
  state.folders = state.folders.map((folder) =>
    folder.id === folderId ? { ...folder, name: newName } : folder
  );
  await persistAll();
  renderAll();
}

async function onDeleteFolder(folderId) {
  const folder = getFolderById(folderId);
  if (!folder) {
    return;
  }

  const defaultFolder = getDefaultFolder();
  if (defaultFolder?.id === folderId) {
    showToast(`The ${DEFAULT_FOLDER_NAME} folder cannot be deleted.`, "error");
    return;
  }

  const moves = templatesInFolder(folderId).length;
  const message =
    moves > 0
      ? `Delete "${folder.name}"? ${moves} prompt(s) will move to ${DEFAULT_FOLDER_NAME}.`
      : `Delete "${folder.name}"?`;
  if (!window.confirm(message)) {
    return;
  }

  state.folders = state.folders.filter((entry) => entry.id !== folderId);
  state.templates = state.templates.map((template) =>
    template.folderId === folderId
      ? { ...template, folderId: defaultFolder?.id ?? null }
      : template
  );
  if (state.activeFolderId === folderId) {
    state.activeFolderId = ALL_TAB_ID;
  }
  await persistAll();
  renderAll();
  showToast("Folder deleted.");
}

function renderTemplateList() {
  elements.templateList.innerHTML = "";
  const items = getVisibleTemplates();

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent =
      state.activeFolderId === ALL_TAB_ID
        ? "No prompts yet. Click New Prompt to get started."
        : "This folder is empty.";
    elements.templateList.appendChild(empty);
    return;
  }

  for (const template of items) {
    elements.templateList.appendChild(buildCard(template));
  }
}

function buildCard(template) {
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.templateId = template.id;

  const header = document.createElement("div");
  header.className = "card-header";

  const title = document.createElement("h3");
  title.className = "card-title";
  title.textContent = template.title;
  header.appendChild(title);

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const favoriteButton = document.createElement("button");
  favoriteButton.type = "button";
  favoriteButton.className = "icon-button";
  favoriteButton.textContent = template.favorite ? "★" : "☆";
  favoriteButton.title = "Toggle favorite";
  favoriteButton.setAttribute("aria-pressed", template.favorite ? "true" : "false");
  favoriteButton.addEventListener("click", async (event) => {
    event.stopPropagation();
    await toggleFavorite(template.id);
  });
  actions.appendChild(favoriteButton);

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "icon-button";
  editButton.textContent = "Edit";
  editButton.title = "Edit prompt";
  editButton.addEventListener("click", (event) => {
    event.stopPropagation();
    openEditor(template.id);
  });
  actions.appendChild(editButton);

  const insertButton = document.createElement("button");
  insertButton.type = "button";
  insertButton.className = "icon-button primary";
  insertButton.textContent = "Insert";
  insertButton.addEventListener("click", async (event) => {
    event.stopPropagation();
    await onInsertTemplate(template.id);
  });
  actions.appendChild(insertButton);

  header.appendChild(actions);
  card.appendChild(header);

  const body = document.createElement("p");
  body.className = "card-body";
  body.textContent = template.body;
  card.appendChild(body);

  if (template.tags?.length) {
    const meta = document.createElement("div");
    meta.className = "card-meta";
    for (const tag of template.tags) {
      const pill = document.createElement("span");
      pill.className = "tag-pill";
      pill.textContent = tag;
      meta.appendChild(pill);
    }
    card.appendChild(meta);
  }

  card.addEventListener("click", () => openEditor(template.id));
  return card;
}

function renderFolderSelect(selectedFolderId) {
  elements.folderSelect.innerHTML = "";
  for (const folder of state.folders) {
    const option = document.createElement("option");
    option.value = folder.id;
    option.textContent = folder.name;
    if (folder.id === selectedFolderId) {
      option.selected = true;
    }
    elements.folderSelect.appendChild(option);
  }
}

function openEditor(templateId) {
  const template = templateId
    ? state.templates.find((entry) => entry.id === templateId)
    : null;

  state.editingId = template?.id ?? null;
  elements.sheetTitle.textContent = template ? "Edit Prompt" : "New Prompt";
  elements.titleInput.value = template?.title ?? "";
  elements.bodyInput.value = template?.body ?? "";
  elements.tagsInput.value = (template?.tags ?? []).join(", ");
  elements.favoriteInput.checked = Boolean(template?.favorite);

  const targetFolderId =
    template?.folderId ??
    (state.activeFolderId !== ALL_TAB_ID ? state.activeFolderId : getDefaultFolder()?.id);
  renderFolderSelect(targetFolderId);

  elements.deleteButton.classList.toggle("hidden", !template);
  elements.copyFallbackButton.classList.add("hidden");
  state.lastRenderedPrompt = "";

  elements.editorSheet.classList.remove("hidden");
  elements.titleInput.focus();
}

function closeEditor() {
  state.editingId = null;
  elements.editorSheet.classList.add("hidden");
}

function getEditorDraft() {
  return {
    title: elements.titleInput.value,
    body: elements.bodyInput.value,
    tags: elements.tagsInput.value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    favorite: elements.favoriteInput.checked,
    folderId: elements.folderSelect.value
  };
}

async function persistAll() {
  await saveTemplatesAndFolders(state.templates, state.folders);
}

function renderAll() {
  renderHeaderMeta();
  renderFolderTabs();
  renderTemplateList();
}

async function saveDraft({ keepOpen }) {
  const now = new Date().toISOString();
  const draft = getEditorDraft();
  const validation = validateTemplate(draft);
  if (!validation.ok) {
    showToast(validation.errors[0], "error");
    return null;
  }

  const folderId = draft.folderId || getDefaultFolder()?.id;
  if (!folderId) {
    showToast("Pick a folder for this prompt.", "error");
    return null;
  }

  let savedTemplate;
  if (state.editingId) {
    state.templates = state.templates.map((template) =>
      template.id === state.editingId
        ? {
            ...template,
            ...validation.normalized,
            folderId,
            updatedAt: now
          }
        : template
    );
    savedTemplate = state.templates.find((template) => template.id === state.editingId) ?? null;
  } else {
    savedTemplate = {
      id: createId("tmpl"),
      ...validation.normalized,
      folderId,
      createdAt: now,
      updatedAt: now
    };
    state.templates = [savedTemplate, ...state.templates];
    state.editingId = savedTemplate.id;
  }

  await persistAll();
  renderAll();

  if (!keepOpen) {
    closeEditor();
    showToast("Prompt saved.");
  }

  return savedTemplate;
}

async function onSaveClicked() {
  await saveDraft({ keepOpen: false });
}

async function onSaveAndInsertClicked() {
  const saved = await saveDraft({ keepOpen: true });
  if (!saved) {
    return;
  }
  await onInsertTemplate(saved.id);
}

async function onDeleteClicked() {
  if (!state.editingId) {
    return;
  }
  if (!window.confirm("Delete this prompt?")) {
    return;
  }
  state.templates = state.templates.filter((template) => template.id !== state.editingId);
  await persistAll();
  closeEditor();
  renderAll();
  showToast("Prompt deleted.");
}

async function toggleFavorite(templateId) {
  const now = new Date().toISOString();
  state.templates = state.templates.map((template) =>
    template.id === templateId
      ? { ...template, favorite: !template.favorite, updatedAt: now }
      : template
  );
  await persistAll();
  renderTemplateList();
}

async function requestInsert(renderedPrompt) {
  const response = await chrome.runtime.sendMessage({
    type: "INSERT_PROMPT",
    prompt: renderedPrompt
  });
  if (!response?.ok) {
    state.lastRenderedPrompt = renderedPrompt;
    elements.copyFallbackButton.classList.remove("hidden");
    elements.editorSheet.classList.remove("hidden");
    showToast(response?.error ?? "Insertion failed. Use copy fallback.", "error");
    return;
  }
  state.lastRenderedPrompt = "";
  elements.copyFallbackButton.classList.add("hidden");
  showToast("Prompt inserted.");
}

async function onInsertTemplate(templateId) {
  const template = state.templates.find((entry) => entry.id === templateId);
  if (!template) {
    showToast("Select a prompt to insert.", "error");
    return;
  }

  const variableNames = extractVariables(template.body);
  if (variableNames.length === 0) {
    await requestInsert(template.body);
    return;
  }

  openVariableModal(template, variableNames);
}

function openVariableModal(template, variableNames) {
  elements.variableForm.innerHTML = "";

  variableNames.forEach((name, index) => {
    const row = document.createElement("label");
    row.textContent = name;
    const input = document.createElement("input");
    input.name = name;
    input.required = true;
    row.appendChild(input);
    elements.variableForm.appendChild(row);
    if (index === 0) {
      requestAnimationFrame(() => input.focus());
    }
  });

  state.variableSession = { template, variableNames };
  elements.variableModal.classList.remove("hidden");
}

function closeVariableModal() {
  state.variableSession = null;
  elements.variableModal.classList.add("hidden");
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
  downloadJson(serializeTemplates(state.templates, state.folders));
  showToast("Export complete.");
}

function normalizeImportedTemplate(template) {
  const now = new Date().toISOString();
  return {
    id: template.id ? String(template.id) : createId("tmpl"),
    title: template.title,
    body: template.body,
    tags: template.tags,
    favorite: Boolean(template.favorite),
    folderId: template.folderId ?? null,
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

  const importedFolders = result.folders.length
    ? result.folders
    : [
        {
          id: createId("folder"),
          name: DEFAULT_FOLDER_NAME,
          createdAt: new Date().toISOString()
        }
      ];

  const folderIdSet = new Set(importedFolders.map((folder) => folder.id));
  const fallbackFolderId =
    importedFolders.find((folder) => folder.name === DEFAULT_FOLDER_NAME)?.id ??
    importedFolders[0].id;

  state.folders = importedFolders;
  state.templates = result.templates.map(normalizeImportedTemplate).map((template) => ({
    ...template,
    folderId: folderIdSet.has(template.folderId) ? template.folderId : fallbackFolderId
  }));
  state.activeFolderId = ALL_TAB_ID;
  state.editingId = null;
  await persistAll();
  renderAll();
  showToast("Import complete.");
}

function onSearchInputChanged(event) {
  const value = event.target.value.trim().toLowerCase();
  if (state.searchTimer) {
    clearTimeout(state.searchTimer);
  }
  state.searchTimer = setTimeout(() => {
    state.searchQuery = value;
    renderTemplateList();
  }, 100);
}

function onKeyboardShortcuts(event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    elements.searchInput.focus();
    return;
  }

  if (event.key.toLowerCase() === "n" && !isTypingTarget(document.activeElement)) {
    event.preventDefault();
    openEditor(null);
    return;
  }

  if (event.key === "Escape" && !elements.editorSheet.classList.contains("hidden")) {
    event.preventDefault();
    closeEditor();
  }
}

async function copyFallback() {
  if (!state.lastRenderedPrompt) {
    return;
  }
  await navigator.clipboard.writeText(state.lastRenderedPrompt);
  showToast("Prompt copied to clipboard.");
}

async function initialize() {
  const persisted = await loadState();
  state.folders = persisted.folders;
  state.templates = persisted.templates;
  state.activeFolderId = ALL_TAB_ID;

  renderAll();

  elements.searchInput.addEventListener("input", onSearchInputChanged);
  elements.newButton.addEventListener("click", () => openEditor(null));
  elements.importButton.addEventListener("click", () => elements.importFileInput.click());
  elements.exportButton.addEventListener("click", onExportTemplates);
  elements.importFileInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    onImportFileSelected(file);
    event.target.value = "";
  });
  elements.sheetCloseButton.addEventListener("click", closeEditor);
  elements.saveButton.addEventListener("click", onSaveClicked);
  elements.saveInsertButton.addEventListener("click", onSaveAndInsertClicked);
  elements.deleteButton.addEventListener("click", onDeleteClicked);
  elements.copyFallbackButton.addEventListener("click", copyFallback);
  elements.variableCancelButton.addEventListener("click", closeVariableModal);
  elements.variableApplyButton.addEventListener("click", applyVariableModal);
  document.addEventListener("keydown", onKeyboardShortcuts);
}

initialize();
