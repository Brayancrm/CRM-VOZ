# CRM-VOZ

CRM mobile (Android + iOS) com notas por voz: grava **apenas a sua fala** durante ligações, histórico por contato, leitura em voz alta (OUVIR), agendamento com lembretes 1h e 5min.

## Começar

```bash
cd CRM-VOZ
npm install
npx expo start
```

Escaneie o QR Code com **Expo Go** (Android/iOS). O projeto usa **Expo SDK 54** (compatível com Expo Go **54.x** da Play Store / App Store).

Problemas no celular? Veja **[Troubleshooting Expo Go](docs/TROUBLESHOOTING-EXPO-GO.md)**.

```bash
npm run start:clear    # limpa cache do Metro
npm run start:tunnel   # se Wi‑Fi/firewall bloquear
npm run web            # testar layout no navegador (PC)
```

## O que já funciona

**Fase 1 — CRM base**

- Lista e cadastro de contatos
- Importar contatos do celular
- Notas por texto + histórico (recente → antigo), editar e excluir
- Botão **OUVIR texto** (TTS) por nota ou histórico completo
- Agendar ligação + notificações 1h e 5min antes
- Agenda com filtros: dia, 7 dias (sáb→sex), semana, mês

**Fase 2 — Gravação (só seu microfone)**

- Simulação de chamada: grava `.m4a` em `recordings/` no aparelho
- **Ouvir áudio** na nota vinculada à sessão (celular; não na web)
- Placeholder de texto até transcrição automática (Fase 4)

**Fase 3 — Gravação manual**

- **Iniciar / Encerrar gravação** na ficha (celular ou WhatsApp)

**Fase 4 — Transcrição híbrida (Railway + Whisper)**

- Áudio no celular → API no **Railway** → texto na nota
- Outros idiomas traduzidos para português automaticamente
- Configure URL em **Ajustes** — ver [Fase 4 — Railway](docs/FASE-4-RAILWAY.md)

**Fase 5 — Agenda unificada**

- Ligações do app (**APP**) + eventos do calendário do celular (**CELULAR**)
- Mesmos filtros: dia, semana, mês, 7 dias — ver [Fase 5 — Agenda](docs/FASE-5-AGENDA.md)

## Documentação

- [Passo a passo completo](docs/PASSO-A-PASSO-DESENVOLVIMENTO.md)
- [Fase 3 — build Android](docs/FASE-3-BUILD-ANDROID.md)
- [Fase 4 — Railway](docs/FASE-4-RAILWAY.md)
- [Fase 5 — Agenda unificada](docs/FASE-5-AGENDA.md)

## Próximas fases

- Detecção automática de ligação (Fase 3b)
- Polish e publicação (Fase 6)
