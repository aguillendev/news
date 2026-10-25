/**
 * ConfigValidator.mjs
 * Pure, side-effect-free validation for NewsConfig fields.
 * Used by both the API server and the client-side admin panel.
 */

/** Minimum allowed frequency in hours */
export const FREQUENCY_MIN_HOURS = 1;
/** Maximum allowed frequency in hours (7 days) */
export const FREQUENCY_MAX_HOURS = 168;
/** Maximum topic name length */
export const TOPIC_MAX_LENGTH = 100;
/** Maximum query length */
export const QUERY_MAX_LENGTH = 300;
/** Allowed characters in topic id */
export const TOPIC_ID_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validates a single topic entry.
 * @param {object} topic
 * @returns {{ valid: boolean, errors: Record<string, string> }}
 */
export function validateTopic(topic) {
  const errors = {};

  if (!topic || typeof topic !== "object" || Array.isArray(topic)) {
    return { valid: false, errors: { topic: "Topic must be a plain object." } };
  }

  // id
  if (typeof topic.id !== "string" || topic.id.trim().length === 0) {
    errors.id = "Topic id must be a non-empty string.";
  } else if (!TOPIC_ID_REGEX.test(topic.id.trim())) {
    errors.id =
      "Topic id must be lowercase alphanumeric words separated by hyphens (e.g. mi-tema).";
  }

  // nombre
  if (typeof topic.nombre !== "string" || topic.nombre.trim().length === 0) {
    errors.nombre = "Topic name (nombre) must be a non-empty string.";
  } else if (topic.nombre.trim().length > TOPIC_MAX_LENGTH) {
    errors.nombre = `Topic name must be ${TOPIC_MAX_LENGTH} characters or fewer.`;
  }

  // consulta
  if (typeof topic.consulta !== "string" || topic.consulta.trim().length === 0) {
    errors.consulta = "Topic query (consulta) must be a non-empty string.";
  } else if (topic.consulta.trim().length > QUERY_MAX_LENGTH) {
    errors.consulta = `Topic query must be ${QUERY_MAX_LENGTH} characters or fewer.`;
  }

  // frecuenciaHoras
  const freq = topic.frecuenciaHoras;
  if (!Number.isFinite(freq) || !Number.isInteger(freq)) {
    errors.frecuenciaHoras = "Frequency (frecuenciaHoras) must be a whole number.";
  } else if (freq < FREQUENCY_MIN_HOURS) {
    errors.frecuenciaHoras = `Frequency must be at least ${FREQUENCY_MIN_HOURS} hour.`;
  } else if (freq > FREQUENCY_MAX_HOURS) {
    errors.frecuenciaHoras = `Frequency must not exceed ${FREQUENCY_MAX_HOURS} hours (7 days).`;
  }

  const valid = Object.keys(errors).length === 0;
  return { valid, errors };
}

/**
 * Validates a full temas array.
 * @param {unknown} temas
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateTemas(temas) {
  const errors = [];

  if (!Array.isArray(temas)) {
    return { valid: false, errors: ["temas must be an array."] };
  }

  if (temas.length === 0) {
    return { valid: false, errors: ["At least one topic is required."] };
  }

  const ids = new Set();
  for (let i = 0; i < temas.length; i++) {
    const result = validateTopic(temas[i]);
    if (!result.valid) {
      for (const [field, msg] of Object.entries(result.errors)) {
        errors.push(`temas[${i}].${field}: ${msg}`);
      }
    } else {
      const id = temas[i].id.trim();
      if (ids.has(id)) {
        errors.push(`temas[${i}].id: Duplicate topic id "${id}".`);
      }
      ids.add(id);
    }
  }

  return { valid: errors.length === 0, errors };
}
