// Génération de cartes et explications via un fournisseur d'IA configurable.
// Deux protocoles : « openai » (API compatible : OpenAI, Ollama, LM Studio, OpenRouter, vLLM…)
// et « anthropic » (API Messages). La clé reste dans le stockage local du navigateur.
import { AppError } from '../core/errors.js';

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

async function complete(cfg, system, user, { maxTokens = 4096, fetchImpl = globalThis.fetch } = {}) {
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
      }),
    });
    if (!res.ok) throw aiHttpError(res.status, await res.text());
    const j = await res.json();
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
  const t = String(text).replace(/```(?:json)?/gi, '');
  const a = t.indexOf('[');
  const b = t.lastIndexOf(']');
  if (a < 0 || b <= a) throw new AppError('aiNoJson', "Réponse de l'IA illisible (pas de tableau JSON)");
  const arr = JSON.parse(t.slice(a, b + 1));
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

const SYSTEM_CARDS = `Tu es un assistant qui crée des cartes de révision (flashcards) de grande qualité.
Règles : une idée par carte ; énoncés courts et sans ambiguïté ; réponses brèves ; à partir d'un texte, rien
d'inventé hors du texte ; à partir d'un sujet, seulement des faits sûrs et vérifiables ; même langue que la
demande, sauf indication contraire. Réponds UNIQUEMENT par un tableau JSON, sans texte autour.
Chaque élément : {"type":"basic"|"cloze","term":"...","definition":"...","hint":"(optionnel)","example":"(optionnel)"}.
Pour "cloze", "term" est une phrase contenant {{c1::réponse}} (ou {{c1::réponse::indice}}) et "definition" un complément facultatif.`;

/** Quelques mots sur une ligne : un sujet à traiter plutôt qu'un texte dont tirer les cartes. */
export const isTopic = (text) => String(text).trim().length <= 160 && !String(text).trim().includes('\n');

/** Demande pour un morceau de texte (ou un sujet). */
function cardsRequest(chunk, { count, kind = 'mixed', language = '' }) {
  const kindTxt = {
    basic: 'uniquement des cartes "basic"',
    cloze: 'uniquement des cartes "cloze"',
    mixed: 'un mélange de "basic" et "cloze"',
  }[kind];
  const source = isTopic(chunk) ? `sur le sujet suivant : ${chunk.trim()}` : `à partir du texte suivant :\n\n${chunk}`;
  return `Crée environ ${count} cartes (${kindTxt})${language ? `, en ${language}` : ''} ${source}`;
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
 * @param {{text:string, count?:number, kind?:'basic'|'cloze'|'mixed', language?:string}} req
 * @returns {Promise<Array>} cartes {type, term, definition, hint, example}
 */
export async function generateCards({ text, count = 20, kind = 'mixed', language = '' }, cfg, opts = {}) {
  const chunks = chunkText(text);
  const per = Math.max(3, Math.ceil(count / chunks.length));
  const out = [];
  for (const chunk of chunks)
    out.push(
      ...cleanCards(
        parseJsonArray(await complete(cfg, SYSTEM_CARDS, cardsRequest(chunk, { count: per, kind, language }), opts)),
      ),
    );
  return out.slice(0, Math.max(count, 1));
}

// ------------------------------------------------------------------ sans clé : copier-coller avec un assistant en ligne

/** Consigne complète à coller dans ChatGPT, Claude, Gemini… (texte entier, sans découpage). */
export function chatPrompt({ text, count = 20, kind = 'mixed', language = '' }) {
  return `${SYSTEM_CARDS}\n\n${cardsRequest(text, { count, kind, language })}`;
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

/** Explication brève d'une réponse ratée (tuteur). */
export async function explainAnswer({ prompt, expected, given, language = 'français' }, cfg, opts = {}) {
  const system = `Tu es un tuteur bienveillant et concis. Explique en ${language}, en 3 phrases maximum, pourquoi la bonne réponse est correcte et ce qui distingue la réponse donnée. Ajoute un moyen mnémotechnique si utile.`;
  const user = `Question : ${prompt}\nBonne réponse : ${expected}\nRéponse donnée : ${given || '(aucune)'}`;
  return (await complete(cfg, system, user, { maxTokens: 400, ...opts })).trim();
}
