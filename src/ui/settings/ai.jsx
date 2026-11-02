// Réglages › Intelligence artificielle : fournisseur, modèle, adresse et clé d'API (gardés dans ce navigateur).
import { useState } from 'preact/hooks';
import { AI_PRESETS, aiConfigured, loadAiConfig, saveAiConfig } from '../../ai/client.js';
import { t } from '../i18n.js';

export function AiSettings() {
  const [ai, setAi] = useState(loadAiConfig());
  const setAiCfg = (patch) => {
    const next = { ...ai, ...patch };
    setAi(next);
    saveAiConfig(next);
  };
  return (
    <>
      <p class="muted">{t('settings.usedGenerateCardsNotes')}</p>
      <p class="notice small" role="note">
        {t('settings.aiKeyNeeded')} <strong>{t('settings.aiFreeAlternative')}</strong>
      </p>
      <div class="grid-2">
        <label class="field">
          <span>{t('settings.provider')}</span>
          <select
            value={Object.entries(AI_PRESETS).find(([, p]) => p.baseUrl === ai.baseUrl)?.[0] || 'custom'}
            onChange={(e) => AI_PRESETS[e.currentTarget.value] && setAiCfg({ ...AI_PRESETS[e.currentTarget.value] })}
          >
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
            <option value="ollama">Ollama (local)</option>
            <option value="custom">{t('settings.otherOpenaiCompatible')}</option>
          </select>
        </label>
        <label class="field">
          <span>{t('settings.model')}</span>
          <input value={ai.model} onInput={(e) => setAiCfg({ model: e.currentTarget.value })} />
        </label>
        <label class="field">
          <span>{t('settings.apiAddress')}</span>
          <input
            value={ai.baseUrl}
            placeholder="https://…"
            onInput={(e) =>
              setAiCfg({
                baseUrl: e.currentTarget.value,
                provider: /anthropic/.test(e.currentTarget.value) ? 'anthropic' : 'openai',
              })
            }
          />
        </label>
        <label class="field">
          <span>{t('settings.apiKey')}</span>
          <input
            type="password"
            autocomplete="off"
            value={ai.apiKey}
            onInput={(e) => setAiCfg({ apiKey: e.currentTarget.value })}
          />
        </label>
      </div>
      <p class={'muted small'}>{aiConfigured(ai) ? t('settings.ready') : t('settings.enterKeyLocalAddress')}</p>
    </>
  );
}
