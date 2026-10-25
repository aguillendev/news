/**
 * @fileoverview Pure validation functions — no I/O, no side-effects.
 * These are the single source of truth shared by the UI and the API server.
 */

import {
  FRECUENCIA_MIN,
  FRECUENCIA_MAX,
  NOMBRE_MAX_LEN,
  CONSULTA_MAX_LEN,
} from './Config.mjs';

/**
 * Validates a single topic configuration object.
 *
 * @param {{ nombre?: unknown, consulta?: unknown, frecuenciaHoras?: unknown }} tema
 * @returns {{ valid: true } | { valid: false, errors: string[] }}
 */
export function validateTema(tema) {
  const errors = [];

  // --- nombre ---
  if (typeof tema.nombre !== 'string' || tema.nombre.trim().length === 0) {
    errors.push('El nombre del tema no puede estar vacío.');
  } else if (tema.nombre.trim().length > NOMBRE_MAX_LEN) {
    errors.push(`El nombre del tema no puede superar ${NOMBRE_MAX_LEN} caracteres.`);
  }

  // --- consulta ---
  if (typeof tema.consulta !== 'string' || tema.consulta.trim().length === 0) {
    errors.push('La consulta del tema no puede estar vacía.');
  } else if (tema.consulta.trim().length > CONSULTA_MAX_LEN) {
    errors.push(`La consulta no puede superar ${CONSULTA_MAX_LEN} caracteres.`);
  }

  // --- frecuenciaHoras ---
  const freq = tema.frecuenciaHoras;
  if (!Number.isInteger(freq)) {
    errors.push('La frecuencia debe ser un número entero.');
  } else if (freq < FRECUENCIA_MIN) {
    errors.push(`La frecuencia mínima es ${FRECUENCIA_MIN} hora(s).`);
  } else if (freq > FRECUENCIA_MAX) {
    errors.push(`La frecuencia máxima es ${FRECUENCIA_MAX} horas (1 semana).`);
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

/**
 * Validates an id string (slug format, non-empty).
 *
 * @param {unknown} id
 * @returns {{ valid: true } | { valid: false, errors: string[] }}
 */
export function validateId(id) {
  const errors = [];
  if (typeof id !== 'string' || id.trim().length === 0) {
    errors.push('El id del tema no puede estar vacío.');
  } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id.trim())) {
    errors.push('El id solo puede contener letras minúsculas, números y guiones (slug).');
  }
  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}
