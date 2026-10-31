// Champ image / audio de l'éditeur (ajout, aperçu, retrait).
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon, MediaImage } from './components.jsx';
import { useApp } from './ctx.js';
import { errorText, t } from './i18n.js';
import { fileToMedia } from './media.js';

// ------------------------------------------------------------------ média

export function MediaField({ value, onChange, kind = 'image', label }) {
  const { lib, toast } = useApp();
  const input = useRef();
  const pick = async (e) => {
    const f = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!f) return;
    try {
      onChange(await fileToMedia(lib, f, kind));
    } catch (err) {
      toast(errorText(err), 'bad');
    }
  };
  return (
    <div class="media-field">
      <span class="lbl">{label}</span>
      {value && kind === 'image' && <MediaImage path={value} alt="" />}
      {value && kind === 'audio' && <AudioPreview path={value} />}
      <input ref={input} type="file" accept={kind === 'image' ? 'image/*' : 'audio/*'} hidden onChange={pick} />
      <button type="button" class="btn small" onClick={() => input.current.click()}>
        <Icon name={kind === 'image' ? 'image' : 'upload'} /> {value ? t('editor.replace') : t('editor.add')}
      </button>
      {value && (
        <button type="button" class="btn small" onClick={() => onChange(null)}>
          <Icon name="x" /> {t('editor.remove')}
        </button>
      )}
    </div>
  );
}

function AudioPreview({ path }) {
  const { lib } = useApp();
  const [url, setUrl] = useState('');
  useEffect(() => {
    lib.mediaUrl(path).then(setUrl);
  }, [lib, path]);
  return url ? <audio controls src={url} preload="none" /> : null;
}
