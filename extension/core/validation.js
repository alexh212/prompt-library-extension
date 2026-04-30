const TITLE_MAX = 120;
const BODY_MAX = 10000;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 30;

export function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }
  const deduped = new Set();
  for (const rawTag of tags) {
    const normalized = String(rawTag ?? "").trim().toLowerCase();
    if (!normalized) {
      continue;
    }
    if (!deduped.has(normalized)) {
      deduped.add(normalized);
    }
  }
  return Array.from(deduped);
}

export function validateTemplate(template) {
  const errors = [];
  const value = template ?? {};

  const title = String(value.title ?? "").trim();
  const body = String(value.body ?? "").trim();
  const tags = normalizeTags(value.tags);

  if (!title) {
    errors.push("Title is required.");
  } else if (title.length > TITLE_MAX) {
    errors.push(`Title must be ${TITLE_MAX} characters or fewer.`);
  }

  if (!body) {
    errors.push("Body is required.");
  } else if (body.length > BODY_MAX) {
    errors.push(`Body must be ${BODY_MAX} characters or fewer.`);
  }

  if (tags.length > MAX_TAGS) {
    errors.push(`Tags must contain ${MAX_TAGS} items or fewer.`);
  }

  for (const tag of tags) {
    if (tag.length > MAX_TAG_LENGTH) {
      errors.push(`Each tag must be ${MAX_TAG_LENGTH} characters or fewer.`);
      break;
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    normalized: {
      ...value,
      title,
      body,
      tags
    }
  };
}
