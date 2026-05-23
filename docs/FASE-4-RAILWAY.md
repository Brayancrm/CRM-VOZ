# Fase 4 — Transcrição híbrida (celular + Railway)

- **Celular:** grava áudio, guarda SQLite, envia arquivo quando há internet.
- **Railway:** recebe o áudio, chama **OpenAI Whisper**, devolve texto.
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
5. Teste no navegador: `https://SUA-URL/health` → `{"ok":true,"whisper":true}`

## 2. Configurar o app no celular

1. Abra **Ajustes** → **Transcrição automática (Fase 4)**
2. Cole a **URL do Railway** (sem barra no final)
3. Se definiu `API_SECRET` no Railway, cole em **Chave API**
4. **Salvar** → **Testar servidor**
5. Grave uma ligação (**Iniciar gravação** → **Encerrar**)
6. O texto deve aparecer na nota (ou em Pós-chamada: “Transcrevendo…”)

## 3. Fluxo técnico

```text
Encerrar gravação → fila local (pending)
       → upload POST /api/transcribe (multipart file)
       → Railway → Whisper (pt)
       → texto salvo em call_sessions + nota
```

Estados: `pending` → `processing` → `done` ou `failed` (botão **Tentar de novo**).

## 4. Custos

- **Railway:** plano free/hobby conforme uso.
- **OpenAI Whisper:** cobrança por minuto de áudio ([preços OpenAI](https://openai.com/api/pricing)).

## 5. Privacidade

O áudio da **sua voz** sai do celular apenas para transcrever. Não envie se precisar de 100% offline — nesse caso desative a URL em Ajustes e use só texto manual.

## 6. Vercel?

Não é necessário para esta fase. Vercel serviria só para um site/painel web futuro.
