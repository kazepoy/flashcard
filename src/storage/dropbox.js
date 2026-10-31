// Dossier distant Dropbox pour la synchronisation (API HTTP v2, appelée depuis le navigateur).
// Application de type « dossier d'application » : elle ne voit que « Applications/Flashcard » dans le
// Dropbox de l'utilisateur ; les chemins de la bibliothèque y sont reproduits tels quels.
import { AppError } from '../core/errors.js';

const API = 'https://api.dropboxapi.com/2';
const CONTENT = 'https://content.dropboxapi.com/2';

export class DropboxRemote {
  /**
   * @param {() => Promise<string>} getToken jeton d'accès OAuth valide
   * @param {{fetchImpl?: typeof fetch}} o
   */
  constructor(getToken, { fetchImpl = globalThis.fetch.bind(globalThis) } = {}) {
    this.getToken = getToken;
    this.fetch = fetchImpl;
  }

  async _call(url, { body, args, headers = {} } = {}) {
    const res = await this.fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await this.getToken()}`,
        ...(args ? { 'Dropbox-API-Arg': JSON.stringify(args) } : {}),
        ...headers,
      },
      body,
    });
    if (res.status === 401) throw new AppError('syncAuth', 'Connexion à Dropbox expirée');
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      throw new AppError('syncHttp', `Dropbox : erreur ${res.status} ${detail}`, {
        service: 'Dropbox',
        status: res.status,
        detail,
      });
    }
    return res;
  }
  _json(url, payload) {
    return this._call(url, { body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } }).then(
      (r) => r.json(),
    );
  }

  /** Tous les fichiers du dossier d'application : `rev` change à chaque nouvelle version. */
  async list() {
    const out = [];
    let r = await this._json(`${API}/files/list_folder`, { path: '', recursive: true });
    for (;;) {
      for (const e of r.entries || [])
        if (e['.tag'] === 'file') out.push({ path: e.path_display.replace(/^\//, ''), rev: e.rev });
      if (!r.has_more) break;
      r = await this._json(`${API}/files/list_folder/continue`, { cursor: r.cursor });
    }
    return out;
  }

  async read(path) {
    const res = await this._call(`${CONTENT}/files/download`, { args: { path: `/${path}` } });
    return new Uint8Array(await res.arrayBuffer());
  }

  /** Écrit un fichier (création ou remplacement) ; renvoie sa nouvelle révision. */
  async write(path, bytes) {
    const res = await this._call(`${CONTENT}/files/upload`, {
      args: { path: `/${path}`, mode: 'overwrite', mute: true },
      headers: { 'Content-Type': 'application/octet-stream' },
      body: bytes,
    });
    return (await res.json()).rev;
  }

  /** Suppression : le fichier reste récupérable dans les fichiers supprimés de Dropbox. */
  async remove(path) {
    await this._json(`${API}/files/delete_v2`, { path: `/${path}` });
  }
}
