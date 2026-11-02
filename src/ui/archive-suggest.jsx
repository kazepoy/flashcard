// Archivage proposé (core/archive.js) : raison en clair, et choix des jeux à archiver depuis la bibliothèque.
import { useState } from 'preact/hooks';
import { Dialog, Icon } from './components.jsx';
import { useApp } from './ctx.js';
import { ago, errorText, t, tn } from './i18n.js';

/** Raison, en clair, de proposer l'archivage d'un jeu. */
export function archiveReasonText(a, created) {
  if (a.reason === 'never') return t('library.archiveNever', { ago: ago(created) });
  if (a.reason === 'idle') return t('library.archiveIdle', { ago: ago(a.last) });
  return t('library.archiveDone');
}

/** Jeux proposés à l'archivage : tous cochés, archivés d'un clic ; restaurables depuis les réglages. */
export function ArchiveSuggestDialog({ rows, onClose }) {
  const { lib, refresh, toast } = useApp();
  const [picked, setPicked] = useState(() => new Set(rows.map((r) => r.id)));
  const [busy, setBusy] = useState(false);
  const toggle = (id) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const archive = async () => {
    setBusy(true);
    let n = 0;
    try {
      for (const id of picked) {
        await lib.archiveSet(id);
        n++;
      }
      toast(tn('library.setsArchived', n));
      onClose();
    } catch (e) {
      toast(errorText(e), 'bad');
      setBusy(false);
    }
    refresh();
  };
  return (
    <Dialog
      title={t('library.archiveSuggestTitle')}
      onClose={onClose}
      footer={
        <>
          <button class="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button class="btn primary" disabled={!picked.size || busy} onClick={archive}>
            <Icon name="archive" /> {tn('library.archiveSelected', picked.size)}
          </button>
        </>
      }
    >
      <p class="muted small">{t('library.archiveSuggestHint')}</p>
      <ul class="archive-pick">
        {rows.map((r) => (
          <li key={r.id}>
            <label class="check">
              <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} />
              <span>
                <strong>{r.title}</strong>{' '}
                <span class="muted small">
                  {tn('common.nCards', r.count)} · {archiveReasonText(r.archive, r.created)}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
