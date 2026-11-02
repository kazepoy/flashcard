// Jeux d'exemple proposés à la demande (examples/<langue>/catalog.json, générés par scripts/gen-examples.mjs) :
// galerie de l'onglet « Jeux d'exemple » d'Importer, et annonce de la bibliothèque à la première ouverture.
import { useState } from 'preact/hooks';
import { importBundle } from '../io/bundle.js';
import { Icon } from './components.jsx';
import { useApp, useAsync } from './ctx.js';
import { errorText, getLang, t, tn } from './i18n.js';
import { readLocal, writeLocal } from './local.js';

const NOTICE_KEY = 'flashcard.examplesNotice';
const base = () => `./examples/${getLang()}/`;

async function fetchOk(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} : ${res.status}`);
  return res;
}

/** L'annonce des jeux d'exemple a été vue (galerie ouverte ou annonce fermée) : elle ne revient plus. */
export const examplesNoticeSeen = () => writeLocal(NOTICE_KEY, 'seen');
/** L'annonce reste à montrer (ni vue, ni fermée). */
export const examplesNoticeShown = () => readLocal(NOTICE_KEY) !== 'seen';

/** Annonce de la bibliothèque (première ouverture) : invite à parcourir les jeux d'exemple. */
export function ExamplesNotice({ onOpen, onHide }) {
  const hide = () => (examplesNoticeSeen(), onHide());
  return (
    <div class="notice examples-notice" role="note">
      <Icon name="books" size={20} />
      <span>{t('examples.notice')}</span>
      <button class="btn small primary" onClick={() => (hide(), onOpen())}>
        {t('examples.browse')}
      </button>
      <button class="icon-btn" aria-label={t('app.hideMessage')} onClick={hide}>
        <Icon name="x" />
      </button>
    </div>
  );
}

/** Galerie : un jeu par vignette, ajouté (ou mis à jour s'il est déjà là) d'un clic. */
export function ExampleGallery() {
  const { lib, version, refresh, toast } = useApp();
  const lang = getLang();
  const { data: catalog, error } = useAsync(async () => (await fetchOk(`${base()}catalog.json`)).json(), [lang]);
  const { data: owned } = useAsync(async () => new Set((await lib.listSets()).sets.map((s) => s.id)), [lib, version]);
  const [busy, setBusy] = useState(null);

  const add = async (entry) => {
    setBusy(entry.id);
    try {
      const bytes = new Uint8Array(await (await fetchOk(base() + entry.file)).arrayBuffer());
      const b = await importBundle(bytes);
      await lib.addSets(b.sets, b.media);
      toast(t('examples.added', { title: entry.title }));
      refresh();
    } catch (e) {
      toast(errorText(e), 'bad');
    }
    setBusy(null);
  };

  if (error) return <p class="notice">{t('examples.unavailable')}</p>;
  if (!catalog) return <p class="muted">{t('common.loading')}</p>;
  return (
    <>
      <p class="muted small">{t('examples.intro')}</p>
      <ul class="example-grid">
        {catalog.map((e) => {
          const has = owned?.has(e.id);
          return (
            <li key={e.id} class="example-card" style={e.color ? { '--tab': e.color } : undefined}>
              <strong>{e.title}</strong>
              <span class="muted small">
                {tn('common.nCards', e.cards)} · {e.description}
              </span>
              <span class="example-features">
                {e.features.map((f) => (
                  <span key={f} class="chip">
                    {f}
                  </span>
                ))}
              </span>
              <button
                class={'btn small' + (has ? '' : ' primary')}
                disabled={busy !== null}
                aria-label={t(has ? 'examples.updateLabel' : 'examples.addLabel', { title: e.title })}
                onClick={() => add(e)}
              >
                <Icon name={has ? 'check' : 'plus'} />{' '}
                {busy === e.id ? t('common.loading') : has ? t('examples.update') : t('examples.add')}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
