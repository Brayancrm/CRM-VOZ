import express from 'express';
import cors from 'cors';
import multer from 'multer';

const PORT = Number(process.env.PORT) || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const API_SECRET = process.env.API_SECRET?.trim() || '';
/** Se true (padrão), traduz inglês/espanhol/etc. para português após o Whisper. */
const TRANSLATE_TO_PT =
  (process.env.TRANSLATE_TO_PT ?? 'true').toLowerCase() !== 'false';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const app = express();
app.use(cors());
app.use(express.json());

function checkAuth(req, res) {
  if (!API_SECRET) return true;
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token !== API_SECRET) {
    res.status(401).json({ error: 'Não autorizado' });
    return false;
  }
  return true;
}

function isPortugueseLanguage(lang) {
  if (!lang) return false;
  const code = lang.toLowerCase();
  return code === 'pt' || code.startsWith('pt-') || code.includes('portug');
}

async function openaiJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      payload?.error?.message || `OpenAI retornou ${res.status}`;
    throw new Error(msg);
  }
  return payload;
}

async function transcribeAudio(buffer, mimetype, originalname) {
  const form = new FormData();
  const blob = new Blob([buffer], { type: mimetype || 'audio/m4a' });
  form.append('file', blob, originalname || 'audio.m4a');
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');

  const openaiRes = await fetch(
    'https://api.openai.com/v1/audio/transcriptions',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form,
    }
  );

  const payload = await openaiRes.json().catch(() => ({}));

  if (!openaiRes.ok) {
    const msg =
      payload?.error?.message || `OpenAI retornou ${openaiRes.status}`;
    throw new Error(msg);
  }

  const text = String(payload.text || '').trim();
  if (!text) {
    throw new Error(
      'Sem fala no áudio. Em chamadas GSM no Samsung o microfone costuma ficar com o app Telefone — use nota de voz na pós-chamada ou viva-voz com o KooMind em primeiro plano.'
    );
  }

  const segments = Array.isArray(payload.segments) ? payload.segments : [];
  if (segments.length > 0) {
    let speechSum = 0;
    let count = 0;
    for (const seg of segments) {
      const prob = typeof seg.no_speech_prob === 'number' ? seg.no_speech_prob : null;
      if (prob != null) {
        speechSum += prob;
        count += 1;
      }
    }
    if (count > 0 && speechSum / count > 0.55) {
      throw new Error(
        'Sem fala detectável no áudio — use viva-voz e fale perto do microfone.'
      );
    }
  }

  return {
    text,
    language: String(payload.language || '').trim(),
  };
}

async function translateToPortuguese(text) {
  const payload = await openaiJson(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'Traduza o texto para português brasileiro (pt-BR). Mantenha nomes próprios, marcas, números, datas e valores monetários. Responda apenas com a tradução, sem aspas nem explicações.',
        },
        { role: 'user', content: text },
      ],
    }
  );

  const translated = String(
    payload.choices?.[0]?.message?.content || ''
  ).trim();

  if (!translated) {
    throw new Error('Tradução vazia.');
  }

  return translated;
}

async function toPortugueseText(text, detectedLanguage) {
  if (!TRANSLATE_TO_PT) return { text, translated: false };

  if (isPortugueseLanguage(detectedLanguage)) {
    return { text, translated: false };
  }

  const translated = await translateToPortuguese(text);
  return { text: translated, translated: true };
}

const TTS_MODEL = 'gpt-4o-mini-tts';
const ALLOWED_TTS_VOICES = new Set([
  'alloy',
  'ash',
  'coral',
  'echo',
  'fable',
  'nova',
  'onyx',
  'sage',
  'shimmer',
]);

const PT_BR_INSTRUCTIONS_FEMALE =
  'Fale em português brasileiro (Brasil), de forma natural e humana, ' +
  'como uma secretária simpática e profissional. Tom caloroso, ritmo ' +
  'conversacional, sem soar robótica nem metálica. Pronúncia clara do Brasil.';

const PT_BR_INSTRUCTIONS_MALE =
  'Fale em português brasileiro (Brasil), de forma natural e humana, ' +
  'como um assistente simpático e profissional. Tom caloroso, ritmo ' +
  'conversacional, sem soar robótico nem metálico. Pronúncia clara do Brasil.';

const ES_INSTRUCTIONS_FEMALE =
  'Habla en español de forma natural y humana, como una secretaria simpática y profesional. Tono cálido, ritmo conversacional, sin sonar robótica. Pronunciación clara.';

const ES_INSTRUCTIONS_MALE =
  'Habla en español de forma natural y humana, como un asistente simpático y profesional. Tono cálido, ritmo conversacional, sin sonar robótico. Pronunciación clara.';

const EN_INSTRUCTIONS_FEMALE =
  'Speak in natural, human English like a friendly professional secretary. Warm tone, conversational pace, not robotic. Clear pronunciation.';

const EN_INSTRUCTIONS_MALE =
  'Speak in natural, human English like a friendly professional assistant. Warm tone, conversational pace, not robotic. Clear pronunciation.';

function ttsInstructions(lang, gender) {
  const code = String(lang || 'pt-BR').toLowerCase();
  if (code.startsWith('es')) {
    return gender === 'male' ? ES_INSTRUCTIONS_MALE : ES_INSTRUCTIONS_FEMALE;
  }
  if (code.startsWith('en')) {
    return gender === 'male' ? EN_INSTRUCTIONS_MALE : EN_INSTRUCTIONS_FEMALE;
  }
  return gender === 'male' ? PT_BR_INSTRUCTIONS_MALE : PT_BR_INSTRUCTIONS_FEMALE;
}

async function synthesizeSpeech(text, voice, gender, lang) {
  const instructions = ttsInstructions(lang, gender);

  let openaiRes = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: TTS_MODEL,
      input: text,
      voice,
      instructions,
      response_format: 'mp3',
    }),
  });

  if (!openaiRes.ok) {
    const legacyVoice =
      voice === 'ash' ? 'onyx' : voice === 'coral' ? 'nova' : voice;
    openaiRes = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1-hd',
        input: text,
        voice: legacyVoice,
        response_format: 'mp3',
      }),
    });
  }

  if (!openaiRes.ok) {
    const payload = await openaiRes.json().catch(() => ({}));
    const msg =
      payload?.error?.message || `OpenAI TTS retornou ${openaiRes.status}`;
    throw new Error(msg);
  }

  const buf = Buffer.from(await openaiRes.arrayBuffer());
  if (buf.length < 500) {
    throw new Error('Áudio TTS vazio ou demasiado curto.');
  }
  return buf;
}

function buildInterpretSystemPrompt(nowIso, nowLabel, contactNames, language) {
  const lang = String(language || 'pt-BR');
  const langName =
    lang.startsWith('es')
      ? 'español'
      : lang.startsWith('en')
        ? 'English'
        : 'português brasileiro (pt-BR)';

  return `You are SeCretina, a CRM call assistant.
Conversation language: ${langName}.
CRITICAL: Every "reply" and "clarification" MUST be written entirely in ${langName}. Never mix languages. Do not use Portuguese unless the language is Portuguese.
Contact names and note bodies stay as spoken by the user (do not translate names or saved note text).
When listing options, enumerate in ${langName} (e.g. "option 1", "opción 1", "opção 1").

Extract actions from what the user said. There may be SEVERAL actions in one request.

Current date/time: ${nowIso} (${nowLabel})
Timezone: use the user's implied local time; whenIso in ISO 8601 with local offset if possible, else UTC.

Known contacts (use the closest name):
${contactNames.length ? contactNames.join(', ') : '(empty list)'}

Respond with ONLY valid JSON in this format:
{
  "actions": [
    { "type": "note", "contactQuery": "Name", "noteBody": "note text" },
    { "type": "schedule", "contactQuery": "Name", "whenIso": "2026-08-01T15:00:00", "whenRaw": "tomorrow at 3", "note": "optional" },
    { "type": "list_agenda", "contactQuery": "optional", "whenRaw": "today|tomorrow|monday|this week|upcoming", "searchText": "optional" },
    { "type": "cancel_schedule", "contactQuery": "Name", "whenRaw": "optional tomorrow/today" },
    { "type": "reschedule", "contactQuery": "Name", "fromWhenRaw": "optional", "whenIso": "…", "whenRaw": "Thursday at 10" }
  ],
  "reply": "short phrase to speak aloud in ${langName}",
  "clarification": "if critical info is missing, ask here in ${langName}; otherwise omit or null"
}

Rules:
- Create note → type note (noteBody required).
- Create new appointment → type schedule (whenIso or whenRaw; future time).
- Query/search agenda → type list_agenda (do not invent items; the app lists them).
- Cancel → type cancel_schedule.
- Move/reschedule existing → type reschedule (new date in whenIso/whenRaw).
- contactQuery = name as spoken.
- If user asks to create schedule AND note → schedule + note.
- If not note/agenda, actions=[] and clarification with help in ${langName}.
- No markdown, JSON only.`;
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    whisper: Boolean(OPENAI_API_KEY),
    secretina: Boolean(OPENAI_API_KEY),
    translateToPt: TRANSLATE_TO_PT,
  });
});

app.post('/api/transcribe', upload.single('file'), async (req, res) => {
  if (!checkAuth(req, res)) return;

  if (!OPENAI_API_KEY) {
    res.status(503).json({
      error: 'OPENAI_API_KEY não configurada no servidor (Railway).',
    });
    return;
  }

  if (!req.file?.buffer?.length) {
    res.status(400).json({ error: 'Envie o campo file com o áudio.' });
    return;
  }

  try {
    const { text, language } = await transcribeAudio(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    );

    const { text: finalText, translated } = await toPortugueseText(
      text,
      language
    );

    res.json({
      text: finalText,
      language: language || undefined,
      translated,
    });
  } catch (e) {
    console.error('transcribe error', e);
    res.status(500).json({
      error: e instanceof Error ? e.message : 'Erro interno',
    });
  }
});

/** Proxy TTS — a chave OpenAI nunca sai do Railway. */
app.post('/api/secretina/tts', async (req, res) => {
  if (!checkAuth(req, res)) return;

  if (!OPENAI_API_KEY) {
    res.status(503).json({
      error: 'OPENAI_API_KEY não configurada no servidor (Railway).',
    });
    return;
  }

  const text = String(req.body?.text || '').trim().slice(0, 4000);
  if (!text) {
    res.status(400).json({ error: 'Campo text obrigatório.' });
    return;
  }

  const voiceRaw = String(req.body?.voice || 'coral').trim().toLowerCase();
  const voice = ALLOWED_TTS_VOICES.has(voiceRaw) ? voiceRaw : 'coral';
  const gender = req.body?.gender === 'male' ? 'male' : 'female';
  const language = String(req.body?.language || 'pt-BR').trim() || 'pt-BR';

  try {
    const mp3 = await synthesizeSpeech(text, voice, gender, language);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.send(mp3);
  } catch (e) {
    console.error('secretina tts error', e);
    res.status(500).json({
      error: e instanceof Error ? e.message : 'Erro interno',
    });
  }
});

/** Proxy interpretação GPT — a chave OpenAI nunca sai do Railway. */
app.post('/api/secretina/interpret', async (req, res) => {
  if (!checkAuth(req, res)) return;

  if (!OPENAI_API_KEY) {
    res.status(503).json({
      error: 'OPENAI_API_KEY não configurada no servidor (Railway).',
    });
    return;
  }

  const spokenText = String(req.body?.text || '').trim().slice(0, 4000);
  if (!spokenText) {
    res.status(400).json({ error: 'Campo text obrigatório.' });
    return;
  }

  const contacts = Array.isArray(req.body?.contacts)
    ? req.body.contacts
        .map((c) => String(c || '').trim())
        .filter(Boolean)
        .slice(0, 80)
    : [];
  const nowIso =
    String(req.body?.nowIso || '').trim() || new Date().toISOString();
  const nowLabel = String(req.body?.nowLabel || nowIso).trim();
  const language = String(req.body?.language || 'pt-BR').trim() || 'pt-BR';

  try {
    const payload = await openaiJson(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: buildInterpretSystemPrompt(
              nowIso,
              nowLabel,
              contacts,
              language
            ),
          },
          { role: 'user', content: spokenText },
        ],
      }
    );

    const raw = String(payload.choices?.[0]?.message?.content || '').trim();
    if (!raw) {
      res.status(502).json({ error: 'Resposta vazia da OpenAI.' });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      res.status(502).json({ error: 'JSON inválido da OpenAI.' });
      return;
    }

    const actions = Array.isArray(parsed?.actions)
      ? parsed.actions.filter(
          (a) =>
            a &&
            (a.type === 'note' ||
              a.type === 'schedule' ||
              a.type === 'list_agenda' ||
              a.type === 'cancel_schedule' ||
              a.type === 'reschedule')
        )
      : [];

    res.json({
      actions,
      reply: typeof parsed?.reply === 'string' ? parsed.reply : '',
      clarification:
        typeof parsed?.clarification === 'string'
          ? parsed.clarification
          : undefined,
    });
  } catch (e) {
    console.error('secretina interpret error', e);
    res.status(500).json({
      error: e instanceof Error ? e.message : 'Erro interno',
    });
  }
});

app.listen(PORT, () => {
  console.log(
    `CRM-VOZ API on :${PORT} (whisper+secretina, translateToPt=${TRANSLATE_TO_PT})`
  );
});
