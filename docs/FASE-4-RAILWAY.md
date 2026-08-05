# Fase 4 — API Railway (Whisper + SeCretina)

- **Celular:** grava áudio, guarda SQLite, envia arquivo quando há internet; SeCretina fala/interpreta via proxy.
- **Railway:** Whisper, TTS e interpretação GPT.
- A **chave OpenAI** fica só no Railway (nunca no APK).

## 1. Deploy no Railway

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub** (ou pasta local).
2. **Root Directory:** `server` (pasta `server/` deste repositório).
3. **Variables:**

| Variável | Valor |
|----------|--------|
| `OPENAI_API_KEY` | sua chave `sk-...` OpenAI |
| `API_SECRET` | senha longa (opcional; app usa a mesma) |
| `PORT` | Railway define automaticamente |

4. Após deploy, copie a URL pública, ex.: `https://crm-voz-production.up.railway.app`
5. Teste no navegador: `https://SUA-URL/health` → `{"ok":true,"whisper":true,"secretina":true}`

## 2. Configurar o app (build — sem Ajustes)

A URL e o `API_SECRET` **não aparecem nos Ajustes**. Ficam no build via `.env`
(ou secrets do EAS), para todos os utilizadores daquele APK.

1. Crie `.env` na raiz do projeto (veja `.env.example`):

```env
EXPO_PUBLIC_TRANSCRIPTION_API_URL=https://SUA-URL.up.railway.app
EXPO_PUBLIC_TRANSCRIPTION_API_SECRET=mesmo_valor_de_API_SECRET
```

2. No Railway: `OPENAI_API_KEY` + o mesmo `API_SECRET`.
3. Gere o APK de novo (`eas build` / build local) — variáveis `EXPO_PUBLIC_*`
   só entram no app no momento do build.
4. Opcional: no telemóvel, **Testar voz** em Ajustes (só timbre M/F; sem URL).

A **chave OpenAI (`sk-…`) nunca fica no telemóvel** — só no Railway. O app chama:

| Endpoint | Uso |
|----------|-----|
| `POST /api/transcribe` | Whisper (chamadas / notas de voz) |
| `POST /api/secretina/tts` | Voz natural SeCretina |
| `POST /api/secretina/interpret` | Interpretação de pedidos (nota/agenda) |

## 3. Fluxo técnico

```text
Encerrar gravação → fila local (pending)
       → upload POST /api/transcribe (multipart file)
       → Railway → Whisper (detecta idioma)
       → se não for português → GPT traduz para pt-BR
       → texto salvo em call_sessions + nota
```

**Idiomas:** o Whisper detecta o idioma falado. Se for inglês, espanhol, etc., o servidor traduz automaticamente para **português brasileiro** antes de devolver ao app. Falas em português não passam por tradução extra.

Variável opcional no Railway: `TRANSLATE_TO_PT=false` desativa a tradução (só transcrição no idioma original).

Estados: `pending` → `processing` → `done` ou `failed` (botão **Tentar de novo**).

## 4. Custos

- **Railway:** plano free/hobby conforme uso.
- **OpenAI Whisper:** cobrança por minuto de áudio ([preços OpenAI](https://openai.com/api/pricing)).
- **Tradução (gpt-4o-mini):** só quando o áudio **não** for detectado em português — custo pequeno por nota.

## 5. Privacidade

- A chave **`OPENAI_API_KEY`** fica **só no Railway** (nunca no APK nem em Ajustes).
- A URL do servidor e o `API_SECRET` vão no **build** (`EXPO_PUBLIC_*`); o utilizador não as edita.
- O áudio da **sua voz** sai do celular apenas para transcrever (Whisper). Sem URL no build, o app fica em modo local.

## 6. Vercel?

Não é necessário para esta fase. Vercel serviria só para um site/painel web futuro.
