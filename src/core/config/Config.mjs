/**
 * @fileoverview Core domain types and defaults for news configuration.
 * INVARIANT-1: topic must be a non-empty, trimmed string (≤ 100 chars).
 * INVARIANT-2: frecuenciaHoras must be a positive integer in [1, 168] (1 h – 1 week).
 */

/** @type {Readonly<{id: string, nombre: string, consulta: string, frecuenciaHoras: number, ultimaEjecucion: string}>} */
export const TEMA_DEFAULTS = Object.freeze({
  id: '',
  nombre: '',
  consulta: '',
  frecuenciaHoras: 12,
  ultimaEjecucion: new Date(0).toISOString(),
});

export const FRECUENCIA_MIN = 1;    // hours
export const FRECUENCIA_MAX = 168;  // hours (1 week)
export const NOMBRE_MAX_LEN = 100;
export const CONSULTA_MAX_LEN = 500;
