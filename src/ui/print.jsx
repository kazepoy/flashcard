// Impression / export PDF d'un jeu : le navigateur met en page (toutes écritures, images, styles de
// carte) et « Enregistrer au format PDF » de sa boîte d'impression produit le fichier.
import { useEffect, useState } from 'preact/hooks';
import { Empty, Icon, IndexCard, fileDate } from './components.jsx';
import { href } from './ctx.js';
import { errorText, t, tn } from './i18n.js';
import { CardFace } from './study/face.jsx';
import { useItems, useSetData } from './useSet.js';

const COLS = 2;

/** Découpe en pages de `size` cases, complétées par null pour que rectos et versos se superposent. */
export function paginate(items, size) {
  const pages = [];
  for (let i = 0; i < items.length; i += size) {
    const p = items.slice(i, i + size);
    while (p.length < size) p.push(null);
    pages.push(p);
  }
  return pages;
}

/** Verso d'une page : chaque rangée inversée (retournement sur le bord long). */
export function mirrorRows(page, cols = COLS) {
  const out = [];
  for (let i = 0; i < page.length; i += cols) out.push(...page.slice(i, i + cols).reverse());
  return out;
}

export function PrintPage({ setId }) {
  const data = useSetData(setId);
  const [layout, setLayout] = useState('cards');
  const [direction, setDirection] = useState('term');
  const [perPage, setPerPage] = useState(8);
  const [backs, setBacks] = useState(true);
  const items = useItems(data.set, null, { direction });

  // nom proposé pour le PDF : le titre du document, daté comme les autres exports
  const title = data.set?.title;
  useEffect(() => {
    if (!title) return;
    const prev = document.title;
    document.title = `${fileDate()} ${title}`;
    return () => (document.title = prev);
  }, [title]);

  if (data.loading) return <p class="muted pad">{t('common.loading')}</p>;
  if (data.error || !data.set) {
    return (
      <Empty title={t('common.setNotFound')}>
        <p>{data.error && errorText(data.error)}</p>
        <a class="btn" href={href('')}>
          {t('common.backLibrary')}
        </a>
      </Empty>
    );
  }
  const set = data.set;
  const rows = perPage / COLS;
  const pages = paginate(items, perPage);
  const face = (item, side) => (
    <IndexCard class="print-face" style={item.style} side={side}>
      <CardFace item={item} set={set} side={side} />
    </IndexCard>
  );

  return (
    <div class="print-view">
      <div class="print-bar">
        <a class="btn" href={href(`set/${set.id}`)}>
          <Icon name="back" /> {t('common.back')}
        </a>
        <h1>{t('print.printExportPdf')}</h1>
        <div class="print-opts">
          <label class="field-inline">
            <span>{t('print.layout')}</span>
            <select value={layout} onChange={(e) => setLayout(e.currentTarget.value)}>
              <option value="cards">{t('print.cutCards')}</option>
              <option value="list">{t('print.list')}</option>
            </select>
          </label>
          <label class="field-inline">
            <span>{t('common.direction')}</span>
            <select value={direction} onChange={(e) => setDirection(e.currentTarget.value)}>
              <option value="term">{t('common.directionTermToDef')}</option>
              <option value="def">{t('common.directionDefToTerm')}</option>
              <option value="both">{t('common.directionBoth')}</option>
            </select>
          </label>
          {layout === 'cards' && (
            <>
              <label class="field-inline">
                <span>{t('print.cardsPerPage')}</span>
                <select value={perPage} onChange={(e) => setPerPage(Number(e.currentTarget.value))}>
                  {[4, 6, 8, 10].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label class="check">
                <input type="checkbox" checked={backs} onChange={(e) => setBacks(e.currentTarget.checked)} />
                <span>{t('print.backsReverseDoubleSided')}</span>
              </label>
            </>
          )}
        </div>
        <p class="muted small">
          {tn('print.cards', items.length)}
          {layout === 'cards' && ' · ' + tn('print.pages', pages.length * (backs ? 2 : 1))}
          {' · '}
          {t('print.printDialogChooseSave')}
        </p>
        <button class="btn primary" onClick={() => window.print()}>
          <Icon name="print" /> {t('print.printSavePdf')}
        </button>
      </div>

      <div class="print-scroll">
        {layout === 'list' ? (
          <div class="print-sheet print-list">
            <h2>{set.title}</h2>
            {set.description && <p class="muted">{set.description}</p>}
            <table>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td>
                      <CardFace item={it} set={set} side="prompt" />
                    </td>
                    <td>
                      <CardFace item={it} set={set} side="answer" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          pages.flatMap((page, i) => {
            const sheet = (cells, side, key) => (
              <div class={'print-sheet print-cards ' + side} key={key} style={{ '--rows': rows }}>
                {cells.map((it, j) => (
                  <div class="print-cell" key={j}>
                    {it &&
                      (side === 'both' ? (
                        <>
                          {face(it, 'prompt')}
                          {face(it, 'answer')}
                        </>
                      ) : (
                        face(it, side)
                      ))}
                  </div>
                ))}
              </div>
            );
            if (!backs) return [sheet(page, 'both', i)];
            return [sheet(page, 'prompt', i + 'r'), sheet(mirrorRows(page), 'answer', i + 'v')];
          })
        )}
      </div>
    </div>
  );
}
