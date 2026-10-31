import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateCards,
  explainAnswer,
  parseJsonArray,
  chunkText,
  aiConfigured,
  loadAiConfig,
  saveAiConfig,
} from '../src/ai/client.js';
import { pdfToText } from '../src/ai/pdf.js';

const okJson = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });

test('parseJsonArray tolère les blocs de code et le texte autour', () => {
  assert.deepEqual(parseJsonArray('Voici :\n```json\n[{"a":1}]\n```\nFin'), [{ a: 1 }]);
  assert.throws(() => parseJsonArray('rien'));
});

test('chunkText coupe sur les paragraphes', () => {
  const t = Array.from({ length: 6 }, (_, i) => `P${i} ` + 'x'.repeat(40)).join('\n\n');
  const chunks = chunkText(t, 100);
  assert.ok(chunks.length >= 3);
  assert.ok(chunks.every((c) => c.length <= 100));
  assert.equal(chunkText('x'.repeat(250), 100).length, 3);
});

test('aiConfigured : clé requise sauf serveur local', () => {
  assert.equal(aiConfigured({ model: 'm', apiKey: '', baseUrl: 'https://api.openai.com/v1' }), false);
  assert.equal(aiConfigured({ model: 'm', apiKey: 'k' }), true);
  assert.equal(aiConfigured({ model: 'm', apiKey: '', baseUrl: 'http://localhost:11434/v1' }), true);
});

test('config IA persistée localement', () => {
  const mem = new Map();
  const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  saveAiConfig({ provider: 'openai', model: 'x', apiKey: 'sk', baseUrl: 'u' }, st);
  assert.equal(loadAiConfig(st).apiKey, 'sk');
  assert.equal(loadAiConfig({ getItem: () => 'pas du json' }).provider, 'anthropic');
});

test('generateCards (Anthropic) : en-têtes, filtrage des cartes invalides', async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init, body: JSON.parse(init.body) };
    return okJson({
      content: [
        {
          type: 'text',
          text:
            '```json\n' +
            JSON.stringify([
              { type: 'basic', term: 'Capitale de la France', definition: 'Paris' },
              { type: 'cloze', term: 'La Seine traverse {{c1::Paris}}', definition: '' },
              { type: 'cloze', term: 'sans trou', definition: 'x' }, // cloze sans balise → basic avec définition
              { type: 'basic', term: 'sans définition', definition: '' }, // rejetée
              { term: '', definition: 'vide' }, // rejetée
            ]) +
            '\n```',
        },
      ],
    });
  };
  const cards = await generateCards(
    { text: 'Paris est la capitale.', count: 10 },
    { provider: 'anthropic', model: 'm', apiKey: 'KEY' },
    { fetchImpl },
  );
  assert.equal(seen.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(seen.init.headers['x-api-key'], 'KEY');
  assert.equal(seen.init.headers['anthropic-version'], '2023-06-01');
  assert.equal(seen.body.model, 'm');
  assert.equal(seen.body.tool_choice.name, 'cartes', 'schéma imposé');
  assert.match(seen.body.messages[0].content, /Sujet : <source>Paris est la capitale\.<\/source>/);
  assert.equal(cards.length, 3);
  assert.equal(cards[1].type, 'cloze');
  assert.equal(cards[2].type, 'basic');
});

test('generateCards (Anthropic) : réponse par outil, morceaux suivants sans doublon', async () => {
  const bodies = [];
  const fetchImpl = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    const n = bodies.length;
    return okJson({
      content: [
        { type: 'tool_use', name: 'cartes', input: { cards: [{ type: 'basic', term: `Q${n}`, definition: 'R' }] } },
      ],
    });
  };
  const text = 'a'.repeat(9000) + '\n\n' + 'b'.repeat(9000);
  const cards = await generateCards(
    { text, count: 10 },
    { provider: 'anthropic', model: 'm', apiKey: 'K' },
    { fetchImpl },
  );
  assert.deepEqual(
    cards.map((c) => c.term),
    ['Q1', 'Q2'],
  );
  assert.match(bodies[1].messages[0].content, /déjà créées, à ne pas refaire : Q1/);
});

test('generateCards (compatible OpenAI / Ollama) et explainAnswer', async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init, body: JSON.parse(init.body) };
    return okJson({
      choices: [
        {
          message: {
            content: seen.body.max_tokens === 400 ? ' Parce que… ' : '[{"type":"basic","term":"a","definition":"b"}]',
          },
        },
      ],
    });
  };
  const cfg = { provider: 'openai', baseUrl: 'http://localhost:11434/v1/', model: 'llama3.1', apiKey: '' };
  const cards = await generateCards({ text: 'texte', count: 5 }, cfg, { fetchImpl });
  assert.equal(seen.url, 'http://localhost:11434/v1/chat/completions');
  assert.equal(seen.init.headers.authorization, undefined);
  assert.equal(cards.length, 1);
  const ex = await explainAnswer({ prompt: 'q', expected: 'e', given: 'g' }, cfg, { fetchImpl });
  assert.equal(ex, 'Parce que…');
});

test('erreur HTTP remontée clairement', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, text: async () => 'bad key' });
  await assert.rejects(
    generateCards({ text: 't' }, { provider: 'openai', model: 'm', apiKey: 'k' }, { fetchImpl }),
    /401/,
  );
});

test("pdfToText : extrait le texte d'un PDF minimal", async () => {
  const stream = 'BT /F1 18 Tf 20 100 Td (Bonjour Flashcard) Tj 0 -30 Td (Deuxieme ligne) Tj ET';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => {
    offs.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf +=
    `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
    offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const text = await pdfToText(new TextEncoder().encode(pdf), {
    loader: () => import('pdfjs-dist/legacy/build/pdf.mjs'),
  });
  assert.match(text, /Bonjour Flashcard/);
  assert.match(text, /Deuxieme ligne/);
});

test("IA sans clé : consigne, sujet ou texte, lecture de la réponse collée, adresse de l'assistant", async () => {
  const { chatPrompt, parseChatReply, chatbotUrl, isTopic, CHATBOTS } = await import('../src/ai/client.js');
  assert.equal(isTopic('Les planètes du système solaire'), true);
  assert.equal(isTopic('Ligne 1\nLigne 2'), false);
  const p = chatPrompt({ text: 'Les planètes', count: 10, kind: 'cloze' });
  assert.match(p, /UNIQUEMENT par un tableau JSON/);
  assert.match(p, /environ 10 cartes : uniquement des cartes "cloze"\./);
  assert.match(p, /Sujet : <source>Les planètes<\/source>$/);
  assert.match(
    chatPrompt({ text: 'Un cours.\nAvec deux lignes.' }),
    /Document :\n<source>\nUn cours\.\nAvec deux lignes\.\n<\/source>$/,
  );
  // langues des deux faces, précisions, fichiers joints dans l'assistant
  const v = chatPrompt({
    text: '',
    languages: { term: 'en', definition: 'fr' },
    notes: 'niveau B1',
    attached: true,
  });
  assert.match(v, /Recto \("term"\) en anglais, verso \("definition"\) en français\./);
  assert.match(v, /Précisions de l'utilisateur : niveau B1/);
  assert.match(v, /documents joints à ce message\.$/);
  // réponse typique d'un assistant : texte autour, bloc ```json, carte incomplète ignorée
  const reply =
    'Voici vos cartes :\n```json\n[{"type":"basic","term":"Mars","definition":"planète rouge"},{"type":"cloze","term":"{{c1::Jupiter}} est la plus grande"},{"term":"sans réponse"}]\n```\nBonne révision !';
  assert.deepEqual(
    parseChatReply(reply).map((c) => [c.type, c.term]),
    [
      ['basic', 'Mars'],
      ['cloze', '{{c1::Jupiter}} est la plus grande'],
    ],
  );
  assert.throws(() => parseChatReply('Désolé, je ne peux pas.'), /pas de tableau JSON/);
  const gpt = CHATBOTS.find((b) => b.id === 'chatgpt');
  assert.equal(chatbotUrl(gpt, 'a b'), 'https://chatgpt.com/?q=a%20b');
  assert.equal(
    chatbotUrl(gpt, 'x'.repeat(7000)),
    'https://chatgpt.com/',
    "trop long pour l'adresse : collé depuis le presse-papiers",
  );
  assert.equal(
    chatbotUrl(
      CHATBOTS.find((b) => b.id === 'gemini'),
      'a',
    ),
    'https://gemini.google.com/app',
  );
});
