// Action d'une rubrique des réglages : bouton occupé pendant l'action, message de réussite, erreur affichée.
import { useState } from 'preact/hooks';
import { useApp } from '../ctx.js';
import { errorText } from '../i18n.js';

/** `run(fn, okMsg)` : okMsg est un texte, ou une fonction du résultat de fn. */
export function useRun() {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      const r = await fn();
      if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg);
    } catch (e) {
      if (e?.name !== 'AbortError') toast(errorText(e), 'bad');
    }
    setBusy(false);
  };
  return { busy, run };
}
