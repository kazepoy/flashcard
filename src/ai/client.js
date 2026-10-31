// Génération de cartes et explications via un fournisseur d'IA configurable.
// Deux protocoles : « openai » (API compatible : OpenAI, Ollama, LM Studio, OpenRouter, vLLM…)
// et « anthropic » (API Messages). La clé reste dans le stockage local du navigateur.
// Consignes : clés « ai.* » des fichiers de langue, dans la langue de l'interface.
import { AppError } from '../core/errors.js';
import { getLang, t } from '../ui/i18n.js';

const aiHttpError = (status, body) =>
  new AppError('aiHttp', `IA : erreur ${status} ${body.slice(0, 200)}`, { status, detail: body.slice(0, 200) });

export const DEFAULT_AI = {
  provider: 'anthropic',
  baseUrl: '',
  model: 'claude-sonnet-5-5',
  apiKey: '',
};

export const AI_PRESETS = {
  anthropic: { provider: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5-5' },
  openai: { provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  ollama: { provider: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'llama3.1' },
};

const KEY = 'flashcard.ai';

export function loadAiConfig(storage = globalThis.localStorage) {
  try {
    return { ...DEFAULT_AI, ...JSON.parse(storage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULT_AI };
  }
}

export function saveAiConfig(cfg, storage = globalThis.localStorage) {
  storage.setItem(KEY, JSON.stringify(cfg));
}

export const aiConfigured = (cfg) =>
  !!(cfg && cfg.model && (cfg.apiKey || /localhost|127\.0\.0\.1|\[::1\]/.test(cfg.baseUrl || '')));

/** Outil imposé à l'API Anthropic pour la génération : la réponse suit le schéma, sans JSON à extraire du texte. */
const CARDS_TOOL = {
  name: 'cartes',
  description: 'Enregistre les cartes de révision créées.',
  input_schema: {
    type: 'object',
    properties: {
      cards: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['basic', 'cloze'] },
            term: { type: 'string' },
            definition: { type: 'string' },
            hint: { type: 'string' },
            example: { type: 'string' },
          },
          required: ['type', 'term', 'definition'],
        },
      },
    },
    required: ['cards'],
  },
};

/** Une requête ; `cardsTool` : génération de cartes (réponse rendue sous forme de tableau JSON). */
async function complete(cfg, system, user, { maxTokens = 8192, cardsTool = false, fetchImpl = globalThis.fetch } = {}) {
  if (cfg.provider === 'anthropic') {
    const res = await fetchImpl(`${(cfg.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
        ...(cardsTool ? { tools: [CARDS_TOOL], tool_choice: { type: 'tool', name: CARDS_TOOL.name } } : {}),
      }),
    });
    if (!res.ok) throw aiHttpError(res.status, await res.text());
    const j = await res.json();
    const used = (j.content || []).find((b) => b.type === 'tool_use');
    if (used) return JSON.stringify(used.input?.cards ?? []);
    return (j.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
  }
  const res = await fetchImpl(`${(cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw aiHttpError(res.status, await res.text());
  const j = await res.json();
  return j.choices?.[0]?.message?.content ?? '';
}

/** Extrait un tableau JSON d'une réponse (tolère les blocs ```json et le texte autour). */
export function parseJsonArray(text) {
  const s = String(text).replace(/```(?:json)?/gi, '');
  const a = s.indexOf('[');
  const b = s.lastIndexOf(']');
  if (a < 0 || b <= a) throw new AppError('aiNoJson', "Réponse de l'IA illisible (pas de tableau JSON)");
  const arr = JSON.parse(s.slice(a, b + 1));
  if (!Array.isArray(arr)) throw new AppError('aiInvalid', "Réponse de l'IA invalide");
  return arr;
}

/** Découpe un long texte en morceaux d'au plus `max` caractères, en coupant sur les paragraphes. */
export function chunkText(text, max = 12000) {
  const out = [];
  let cur = '';
  for (const para of String(text).split(/\n{2,}/)) {
    if ((cur + '\n\n' + para).length > max && cur) {
      out.push(cur);
      cur = '';
    }
    if (para.length > max) {
      for (let i = 0; i < para.length; i += max) out.push(para.slice(i, i + max));
    } else cur = cur ? cur + '\n\n' + para : para;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** Nom d'une langue (code BCP-47) dans la langue de l'interface, pour la consigne. */
const langName = (code) => {
  try {
    return new Intl.DisplayNames([getLang()], { type: 'language' }).of(code) || code;
  } catch {
    return code;
  }
};

/** Quelques mots sur une ligne : un sujet à traiter plutôt qu'un texte dont tirer les cartes. */
export const isTopic = (text) => String(text).trim().length <= 160 && !String(text).trim().includes('\n');

/**
 * Demande pour un morceau de texte, un sujet, ou (`attached`) les fichiers joints dans l'assistant.
 * `languages` : {term, definition} (codes) ; `notes` : précisions de l'utilisateur ; `avoid` : termes déjà créés.
 */
function cardsRequest(chunk, { count, kind = 'mixed', languages = {}, notes = '', attached = false, avoid = [] }) {
  const kindTxt = t({ basic: 'ai.kindBasic', cloze: 'ai.kindCloze', mixed: 'ai.kindMixed' }[kind]);
  const lines = [t('ai.count', { n: count, kind: kindTxt })];
  const { term, definition } = languages;
  if (term && definition && term !== definition)
    lines.push(t('ai.langPair', { term: langName(term), definition: langName(definition) }));
  else if (term || definition) lines.push(t('ai.langOne', { lang: langName(term || definition) }));
  else lines.push(t('ai.langSource'));
  if (notes.trim()) lines.push(t('ai.notes', { notes: notes.trim() }));
  if (avoid.length) lines.push(t('ai.avoid', { list: avoid.join(' ; ') }));
  if (attached) {
    lines.push(t('ai.attached'));
    if (chunk.trim()) lines.push(`${t('ai.complement')}\n<source>\n${chunk.trim()}\n</source>`);
  } else if (isTopic(chunk)) lines.push(`${t('ai.topic')} <source>${chunk.trim()}</source>`);
  else lines.push(`${t('ai.document')}\n<source>\n${chunk}\n</source>`);
  return lines.join('\n');
}

/** Garde les cartes exploitables d'une réponse, au format des cartes Flashcard. */
export function cleanCards(arr) {
  const out = [];
  for (const c of arr) {
    if (!c || typeof c.term !== 'string' || !c.term.trim()) continue;
    const type = c.type === 'cloze' && /\{\{c\d+::/.test(c.term) ? 'cloze' : 'basic';
    if (type === 'basic' && !String(c.definition ?? '').trim()) continue;
    out.push({
      type,
      term: c.term.trim(),
      definition: String(c.definition ?? '').trim(),
      hint: String(c.hint ?? '').trim(),
      example: String(c.example ?? '').trim(),
    });
  }
  return out;
}

/**
 * @param {{text:string, count?:number, kind?:'basic'|'cloze'|'mixed', languages?:{term?:string, definition?:string},
 *          notes?:string}} req
 * @returns {Promise<Array>} cartes {type, term, definition, hint, example}
 */
export async function generateCards({ text, count = 20, ...req }, cfg, opts = {}) {
  const chunks = chunkText(text);
  const per = Math.max(3, Math.ceil(count / chunks.length));
  const out = [];
  for (const chunk of chunks) {
    // les morceaux suivants connaissent les cartes déjà faites (pas de doublon d'un morceau à l'autre)
    const avoid = out.map((c) => c.term.slice(0, 80)).slice(-80);
    const reply = await complete(cfg, t('ai.system'), cardsRequest(chunk, { ...req, count: per, avoid }), {
      ...opts,
      cardsTool: true,
    });
    out.push(...cleanCards(parseJsonArray(reply)));
  }
  return out.slice(0, Math.max(count, 1));
}

// ------------------------------------------------------------------ sans clé : copier-coller avec un assistant en ligne

/** Consigne complète à coller dans ChatGPT, Claude, Gemini… (texte entier, sans découpage). */
export function chatPrompt({ text = '', count = 20, ...req }) {
  return `${t('ai.system')}\n\n${cardsRequest(text, { ...req, count })}`;
}

/** Cartes tirées de la réponse collée par l'utilisateur. */
export const parseChatReply = (reply) => cleanCards(parseJsonArray(reply));

/** Assistants proposés ; `q` : l'adresse accepte la consigne pré-remplie (sinon, elle est collée). */
export const CHATBOTS = [
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/', q: 'https://chatgpt.com/?q=' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai/new', q: 'https://claude.ai/new?q=' },
  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/app' },
  { id: 'lechat', name: 'Le Chat', url: 'https://chat.mistral.ai/chat' },
];

/** Adresse à ouvrir : consigne dans l'URL si l'assistant l'accepte et qu'elle reste courte. */
export function chatbotUrl(bot, prompt, maxUrl = 6000) {
  const withQ = bot.q && bot.q + encodeURIComponent(prompt);
  return withQ && withQ.length <= maxUrl ? withQ : bot.url;
}

/** Explication brève d'une réponse ratée (tuteur), dans la langue de l'interface. */
export async function explainAnswer({ prompt, expected, given }, cfg, opts = {}) {
  const user = t('ai.explainUser', { prompt, expected, given: given || t('ai.noAnswer') });
  return (await complete(cfg, t('ai.explain'), user, { maxTokens: 400, ...opts })).trim();
}
