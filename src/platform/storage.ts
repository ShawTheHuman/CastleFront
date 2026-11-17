import type { SaveStorage } from '../core/save';

const KEY = 'castlefront.save';

export const localSaveStorage: SaveStorage = {
  load() {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  store(data) {
    try {
      localStorage.setItem(KEY, data);
    } catch {
      // Storage unavailable (private mode, quota): play on without saving.
    }
  },
};
