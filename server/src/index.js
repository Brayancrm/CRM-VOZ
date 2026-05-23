import express from 'express';
import cors from 'cors';
import multer from 'multer';

const PORT = Number(process.env.PORT) || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const API_SECRET = process.env.API_SECRET?.trim() || '';

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

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    whisper: Boolean(OPENAI_API_KEY),
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
    const form = new FormData();
    const blob = new Blob([req.file.buffer], {
      type: req.file.mimetype || 'audio/m4a',
    });
    form.append('file', blob, req.file.originalname || 'audio.m4a');
    form.append('model', 'whisper-1');
    form.append('language', 'pt');

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
        payload?.error?.message ||
        `OpenAI retornou ${openaiRes.status}`;
      res.status(502).json({ error: msg });
      return;
    }

    const text = String(payload.text || '').trim();
    if (!text) {
      res.status(502).json({ error: 'Transcrição vazia.' });
      return;
    }

    res.json({ text });
  } catch (e) {
    console.error('transcribe error', e);
    res.status(500).json({
      error: e instanceof Error ? e.message : 'Erro interno',
    });
  }
});

app.listen(PORT, () => {
  console.log(`CRM-VOZ transcription API on :${PORT}`);
});
