/**
 * @fileoverview ConfigService — single source of truth for topic configuration.
 *
 * Responsibilities:
 *  - Validate incoming changes (pure, via ConfigValidator).
 *  - Persist atomically via the injected ConfigRepository.
 *  - Emit 'configChanged' events so reactive consumers (scheduler, UI) stay in sync.
 *
 * INVARIANT-5: All state mutations go through this service.
 */

import { EventEmitter } from 'node:events';
import { validateTema, validateId } from './ConfigValidator.mjs';

export class ConfigService extends EventEmitter {
  /**
   * @param {import('../../infrastructure/config/JsonConfigRepository.mjs').JsonConfigRepository} repository
   */
  constructor(repository) {
    super();
    this._repo = repository;
    /** @type {Array} */
    this._temas = [];
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  /**
   * Loads the current temas from disk and caches them in memory.
   * @returns {Promise<Array>}
   */
  async loadTemas() {
    const estado = await this._repo.read();
    this._temas = estado.temas;
    return this._getTemasSnapshot();
  }

  /**
   * Returns the in-memory snapshot (defensive copy — callers cannot mutate state).
   * @returns {Array}
   */
  getTemas() {
    return this._getTemasSnapshot();
  }

  // ---------------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------------

  /**
   * Adds a new topic.
   * @param {{ id: string, nombre: string, consulta: string, frecuenciaHoras: number }} tema
   * @returns {Promise<void>}
   * @throws {Error} if validation fails or the id already exists.
   */
  async addTema(tema) {
    const idResult = validateId(tema.id);
    if (!idResult.valid) throw new Error(idResult.errors.join(' | '));

    const bodyResult = validateTema(tema);
    if (!bodyResult.valid) throw new Error(bodyResult.errors.join(' | '));

    if (this._temas.some((t) => t.id === tema.id.trim())) {
      throw new Error(`Ya existe un tema con el id "${tema.id}".`);
    }

    const newTema = {
      id: tema.id.trim(),
      nombre: tema.nombre.trim(),
      consulta: tema.consulta.trim(),
      frecuenciaHoras: tema.frecuenciaHoras,
      ultimaEjecucion: new Date(0).toISOString(),
    };

    this._temas = [...this._temas, newTema];
    await this._persist();
  }

  /**
   * Updates an existing topic (partial patch).
   * @param {string} id - Existing topic id.
   * @param {{ nombre?: string, consulta?: string, frecuenciaHoras?: number }} patch
   * @returns {Promise<void>}
   * @throws {Error} if topic not found or validation fails.
   */
  async updateTema(id, patch) {
    const index = this._temas.findIndex((t) => t.id === id);
    if (index === -1) throw new Error(`No se encontró el tema con id "${id}".`);

    const current = this._temas[index];
    const merged = {
      ...current,
      nombre: patch.nombre !== undefined ? patch.nombre : current.nombre,
      consulta: patch.consulta !== undefined ? patch.consulta : current.consulta,
      frecuenciaHoras:
        patch.frecuenciaHoras !== undefined
          ? patch.frecuenciaHoras
          : current.frecuenciaHoras,
    };

    const result = validateTema(merged);
    if (!result.valid) throw new Error(result.errors.join(' | '));

    const updated = {
      ...current,
      nombre: merged.nombre.trim(),
      consulta: merged.consulta.trim(),
      frecuenciaHoras: merged.frecuenciaHoras,
    };

    this._temas = [
      ...this._temas.slice(0, index),
      updated,
      ...this._temas.slice(index + 1),
    ];
    await this._persist();
  }

  /**
   * Removes a topic by id.
   * @param {string} id
   * @returns {Promise<void>}
   * @throws {Error} if topic not found.
   */
  async deleteTema(id) {
    if (!this._temas.some((t) => t.id === id)) {
      throw new Error(`No se encontró el tema con id "${id}".`);
    }
    this._temas = this._temas.filter((t) => t.id !== id);
    await this._persist();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** @returns {Array} */
  _getTemasSnapshot() {
    return this._temas.map((t) => ({ ...t }));
  }

  /** Persists current in-memory temas and emits configChanged. */
  async _persist() {
    await this._repo.writeTemas(this._temas);
    this.emit('configChanged', this._getTemasSnapshot());
  }
}
