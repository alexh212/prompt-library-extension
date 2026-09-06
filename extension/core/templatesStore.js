const STORAGE_KEY = "promptLibraryStateV1";
const DEFAULT_FOLDER_NAME = "General";

function getStorage() {
  return chrome.storage.local;
}

function createId(prefix) {
  if (crypto?.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function ensureDefaultFolder(state) {
  const now = new Date().toISOString();
  const folders = Array.isArray(state.folders) ? [...state.folders] : [];
  const templates = Array.isArray(state.templates) ? [...state.templates] : [];

  let defaultFolder = folders.find((folder) => folder.name === DEFAULT_FOLDER_NAME);
  if (!defaultFolder) {
    defaultFolder = {
      id: createId("folder"),
      name: DEFAULT_FOLDER_NAME,
      createdAt: now
    };
    folders.unshift(defaultFolder);
  }

  const reconciledTemplates = templates.map((template) => {
    const folderId = folders.some((folder) => folder.id === template.folderId)
      ? template.folderId
      : defaultFolder.id;
    return { ...template, folderId };
  });

  return { folders, templates: reconciledTemplates };
}

export async function loadState() {
  const result = await getStorage().get(STORAGE_KEY);
  const raw = result[STORAGE_KEY];
  const baseState = raw && typeof raw === "object" ? raw : {};
  return ensureDefaultFolder(baseState);
}

export async function saveState(state) {
  const nextState = ensureDefaultFolder(state ?? {});
  await getStorage().set({ [STORAGE_KEY]: nextState });
  return nextState;
}

export async function getTemplates() {
  const state = await loadState();
  return state.templates;
}

export async function getFolders() {
  const state = await loadState();
  return state.folders;
}

export async function saveTemplatesAndFolders(templates, folders) {
  return saveState({
    folders: Array.isArray(folders) ? folders : [],
    templates: Array.isArray(templates) ? templates : []
  });
}

export { STORAGE_KEY, DEFAULT_FOLDER_NAME };
