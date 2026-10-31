// Dossier distant OneDrive pour la synchronisation (Microsoft Graph, appelé depuis le navigateur).
// Permission « Files.ReadWrite.AppFolder » : l'application ne voit que son dossier d'application,
// « Applications/Flashcard » dans le OneDrive de l'utilisateur. Les chemins de la bibliothèque y sont
// reproduits tels quels (sets/…, progress/…, logs/…, media/…).
import { AppError } from '../core/errors.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const APPROOT = `${GRAPH}/me/drive/special/approot`;
const DIRS = ['sets', 'progress', 'logs', 'media'];
const SIMPLE_MAX = 4 * 1024 * 1024; // au-delà : envoi par morceaux (session de téléversement)
const CHUNK = 320 * 1024 * 16; // multiple de 320 Kio, comme l'exige Graph

export class OneDriveRemote {
  /**
   * @param {() => Promise<string>} getToken jeton d'accès OAuth valide
   * @param {{fetchImpl?: typeof fetch}} o
   */
  constructor(getToken, { fetchImpl = globalThis.fetch.bind(globalThis) } = {}) {
    this.getToken = getToken;
    this.fetch = fetchImpl;
    this.ids = new Map(); // chemin → identifiant OneDrive (rempli par list)
    this.dirs = new Set(); // sous-dossiers existants
  }

  async _call(url, init = {}, { allow404 = false } = {}) {
    const res = await this.fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${await this.getToken()}` },
    });
    if (allow404 && res.status === 404) return null;
    if (res.status === 401) throw new AppError('syncAuth', 'Connexion à OneDrive expirée');
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      throw new AppError('syncHttp', `OneDrive : erreur ${res.status} ${detail}`, {
        service: 'OneDrive',
        status: res.status,
        detail,
      });
    }
    return res;
  }

  /** Fichiers des sous-dossiers : `rev` = cTag (change avec le contenu). */
  async list() {
    const out = [];
    for (const dir of DIRS) {
      let url = `${APPROOT}:/${dir}:/children?$select=id,name,cTag,file&$top=999`;
      while (url) {
        const res = await this._call(url, {}, { allow404: true });
        if (!res) break; // dossier pas encore créé
        this.dirs.add(dir);
        const r = await res.json();
        for (const f of r.value || []) {
          if (!f.file) continue;
          this.ids.set(`${dir}/${f.name}`, f.id);
          out.push({ path: `${dir}/${f.name}`, rev: f.cTag });
        }
        url = r['@odata.nextLink'] || null;
      }
    }
    return out;
  }

  async read(path) {
    // l'adresse de téléchargement est pré-authentifiée (pas d'en-tête Authorization vers un autre domaine)
    const meta = await (
      await this._call(`${GRAPH}/me/drive/items/${this.ids.get(path)}?$select=id,@microsoft.graph.downloadUrl`)
    ).json();
    const res = await this.fetch(meta['@microsoft.graph.downloadUrl']);
    if (!res.ok)
      throw new AppError('syncHttp', `OneDrive : erreur ${res.status}`, {
        service: 'OneDrive',
        status: res.status,
        detail: '',
      });
    return new Uint8Array(await res.arrayBuffer());
  }

  async _dir(dir) {
    if (this.dirs.has(dir)) return;
    const res = await this.fetch(`${APPROOT}/children`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.getToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: dir, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
    });
    if (!res.ok && res.status !== 409)
      throw new AppError('syncHttp', `OneDrive : erreur ${res.status}`, {
        service: 'OneDrive',
        status: res.status,
        detail: '',
      });
    this.dirs.add(dir);
  }

  /** Écrit un fichier (création ou remplacement) ; renvoie son nouveau cTag. */
  async write(path, bytes) {
    await this._dir(path.split('/')[0]);
    let item;
    if (bytes.length <= SIMPLE_MAX) {
      item = await (
        await this._call(`${APPROOT}:/${path}:/content`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: bytes,
        })
      ).json();
    } else {
      const { uploadUrl } = await (
        await this._call(`${APPROOT}:/${path}:/createUploadSession`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }),
        })
      ).json();
      for (let start = 0; start < bytes.length; start += CHUNK) {
        const part = bytes.subarray(start, Math.min(start + CHUNK, bytes.length));
        const res = await this.fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Range': `bytes ${start}-${start + part.length - 1}/${bytes.length}` },
          body: part,
        });
        if (!res.ok)
          throw new AppError('syncHttp', `OneDrive : erreur ${res.status}`, {
            service: 'OneDrive',
            status: res.status,
            detail: '',
          });
        if (start + part.length >= bytes.length) item = await res.json();
      }
    }
    this.ids.set(path, item.id);
    return item.cTag;
  }

  /** Suppression : le fichier part dans la corbeille de OneDrive. */
  async remove(path) {
    const id = this.ids.get(path);
    if (!id) return;
    await this._call(`${GRAPH}/me/drive/items/${id}`, { method: 'DELETE' });
    this.ids.delete(path);
  }
}
