/**
 * @fileoverview File-based persistence for estado.json.
 * Writes are atomic: data is first written to a .tmp file, then renamed
 * to the target path — preventing partial-write corruption (INVARIANT-3).
 */

import { readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DEFAULT_ESTADO_PATH = fileURLToPath(
  new URL('../../../estado.json', import.meta.url),
);

export class JsonConfigRepository {
  /**
   * @param {string} [estadoPath] - Absolute path to estado.json (injectable for tests).
   */
  constructor(estadoPath = DEFAULT_ESTADO_PATH) {
    this._path = estadoPath;
  }

  /**
   * Reads the full estado object.
   * @returns {Promise<{temas: Array, novedades: Array}>}
   */
  async read() {
    const raw = await readFile(this._path, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.temas) || !Array.isArray(parsed.novedades)) {
      throw new Error('estado.json tiene un formato inesperado.');
    }
    return parsed;
  }

  /**
   * Atomically persists an updated temas array, leaving novedades untouched.
   * @param {Array} temas - Full updated temas array.
   * @returns {Promise<void>}
   */
  async writeTemas(temas) {
    // Read current state to preserve novedades
    const current = await this.read();
    const next = { ...current, temas };
    const tmp = `${this._path}.tmp`;
    await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
    await rename(tmp, this._path); // atomic swap (INVARIANT-3)
  }
}
