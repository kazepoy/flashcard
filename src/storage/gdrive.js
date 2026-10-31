// Dossier distant Google Drive pour la synchronisation (API REST v3, appelée depuis le navigateur).
// Portée « drive.file » : l'application ne voit que les fichiers qu'elle a créés, dans un dossier
// « Flashcard » à la racine du Drive. Un fichier par chemin de la bibliothèque (nom = chemin).
import { AppError } from '../core/errors.js';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const FOLDER_NAME = 'Flashcard';
export const SCOPE = 'https://www.googleapis.com/auth/drive.file';

export class GDriveRemote {
  /**
   * @param {() => Promise<string>} getToken jeton d'accès OAuth valide
   * @param {{fetchImpl?: typeof fetch, folderId?: string|null}} o
   */
  constructor(getToken, { fetchImpl = globalThis.fetch.bind(globalThis), folderId = null } = {}) {
    this.getToken = getToken;
    this.fetch = fetchImpl;
    this.folderId = folderId;
    this.ids = new Map(); // chemin → identifiant Drive (rempli par list)
  }

  async _call(url, init = {}) {
    const res = await this.fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${await this.getToken()}` },
    });
    if (res.status === 401) throw new AppError('syncAuth', 'Connexion à Google Drive expirée');
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      throw new AppError('syncHttp', `Google Drive : erreur ${res.status} ${detail}`, {
        service: 'Google Drive',
        status: res.status,
        detail,
      });
    }
    return res;
  }

  /** Dossier « Flashcard » : retrouvé, ou créé à la première synchronisation. */
  async folder() {
    if (this.folderId) return this.folderId;
    const q = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false`);
    const found = await (await this._call(`${API}/files?q=${q}&fields=files(id)&spaces=drive`)).json();
    if (found.files?.length) return (this.folderId = found.files[0].id);
    const created = await (
      await this._call(`${API}/files?fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
      })
    ).json();
    return (this.folderId = created.id);
  }

  /** Fichiers du dossier : `rev` = empreinte MD5 du contenu calculée par Drive. */
  async list() {
    const folder = await this.folder();
    const q = encodeURIComponent(`'${folder}' in parents and trashed=false`);
    const out = [];
    let page = '';
    do {
      const url = `${API}/files?q=${q}&pageSize=1000&fields=nextPageToken,files(id,name,md5Checksum)${page ? `&pageToken=${page}` : ''}`;
      const r = await (await this._call(url)).json();
      for (const f of r.files || []) {
        this.ids.set(f.name, f.id);
        out.push({ path: f.name, rev: f.md5Checksum || f.id });
      }
      page = r.nextPageToken || '';
    } while (page);
    return out;
  }

  async read(path) {
    const id = this.ids.get(path);
    return new Uint8Array(await (await this._call(`${API}/files/${id}?alt=media`)).arrayBuffer());
  }

  /** Écrit un fichier (création ou nouvelle version) ; renvoie sa nouvelle empreinte. */
  async write(path, bytes) {
    const id = this.ids.get(path);
    const type = path.endsWith('.json') ? 'application/json' : 'application/octet-stream';
    let res;
    if (id) {
      res = await this._call(`${UPLOAD}/files/${id}?uploadType=media&fields=id,md5Checksum`, {
        method: 'PATCH',
        headers: { 'Content-Type': type },
        body: bytes,
      });
    } else {
      const boundary = `flashcard${Date.now().toString(36)}`;
      const meta = JSON.stringify({ name: path, parents: [await this.folder()] });
      const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${type}\r\n\r\n`;
      const body = new Blob([head, bytes, `\r\n--${boundary}--`]);
      res = await this._call(`${UPLOAD}/files?uploadType=multipart&fields=id,md5Checksum`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      });
    }
    const f = await res.json();
    this.ids.set(path, f.id);
    return f.md5Checksum || f.id;
  }

  /** Mise à la corbeille (récupérable depuis Google Drive pendant 30 jours). */
  async remove(path) {
    const id = this.ids.get(path);
    if (!id) return;
    await this._call(`${API}/files/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    });
    this.ids.delete(path);
  }
}
