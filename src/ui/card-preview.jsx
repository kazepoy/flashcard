// Aperçu d'une carte telle qu'elle sera étudiée : apparence effective (réglages, jeu, carte), fiche à retourner,
// pied (indice, exemple), un élément par trou ou groupe de masques, et le sens inverse d'une carte simple.
import { useState } from 'preact/hooks';
import { expandCard } from '../core/items.js';
import { mergeStyle } from '../core/style.js';
import { Dialog, FlipCard } from './components.jsx';
import { useApp } from './ctx.js';
import { t } from './i18n.js';
import { CardFace } from './study/face.jsx';

export function CardPreviewDialog({ card, set, onClose }) {
  const { settings } = useApp();
  const [reverse, setReverse] = useState(false);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const items = expandCard(card, reverse ? 'def' : 'term', mergeStyle(settings.cardStyle, set.style));
  const item = items[Math.min(pos, items.length - 1)];
  const go = (d) => {
    setPos((p) => Math.max(0, Math.min(items.length - 1, p + d)));
    setFlipped(false);
  };
  return (
    <Dialog
      title={t('preview.title')}
      onClose={onClose}
      wide
      footer={
        <>
          {items.length > 1 && (
            <>
              <button class="btn" disabled={pos === 0} onClick={() => go(-1)}>
                {t('study.previous')}
              </button>
              <span class="muted small">{t('preview.position', { n: pos + 1, total: items.length })}</span>
              <button class="btn" disabled={pos >= items.length - 1} onClick={() => go(1)}>
                {t('preview.next')}
              </button>
            </>
          )}
          <button class="btn primary" disabled={!item} onClick={() => setFlipped(!flipped)}>
            {t('study.flip')}
          </button>
        </>
      }
    >
      {card.type === 'basic' && (
        <label class="check">
          <input
            type="checkbox"
            checked={reverse}
            onChange={(e) => (setReverse(e.currentTarget.checked), setPos(0), setFlipped(false))}
          />
          <span>{t('preview.reverse')}</span>
        </label>
      )}
      {item ? (
        <div class="card-preview">
          <FlipCard
            flipped={flipped}
            onFlip={() => setFlipped(!flipped)}
            frontStyle={item.style}
            backStyle={item.style}
            front={<CardFace item={item} set={set} side="prompt" showHint />}
            back={<CardFace item={item} set={set} side="answer" recall />}
          />
        </div>
      ) : (
        <p class="notice">{t('preview.empty')}</p>
      )}
    </Dialog>
  );
}
