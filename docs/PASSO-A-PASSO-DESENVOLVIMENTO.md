# CRM-VOZ — Passo a passo de desenvolvimento

Guia para construir o app em **Android** e **iOS**: CRM de contatos com notas por voz (só a **sua** fala durante a ligação), transcrição automática, histórico, agendamentos e integração com agenda.

---

## 0. Decisões fixas do produto

| Regra | Detalhe |
|-------|---------|
| Gravação na chamada | **Somente microfone do usuário** — não grava áudio da linha nem voz do cliente |
| Quando grava | Da detecção de **chamada ativa** até **encerramento** |
| O que vira nota | Áudio → transcrição (STT) → texto na ficha do contato, com data/hora da conversa |
| Fallback | Pós-chamada: ditado manual, teclado, agendar próxima ligação |
| Plataformas | Android + iOS (mesmo código-base recomendado) |

---

## 1. Stack recomendada

| Camada | Escolha | Motivo |
|--------|---------|--------|
| Framework | **React Native + Expo (SDK 52+)** | Um código para Android/iOS; bom ecossistema para mic, notificações, calendário |
| Linguagem | TypeScript | Tipos para modelos e APIs |
| Banco local | **expo-sqlite** + Drizzle ORM (opcional) | Offline-first, notas e sessões de chamada |
| Estado global | Zustand ou React Context | Sessão de chamada, fila de transcrição |
| STT (transcrição) | Fase 1: API (OpenAI Whisper / Google Speech-to-Text) · Fase 2: on-device se precisar offline | Qualidade e simplicidade no MVP |
| TTS (botão OUVIR) | `expo-speech` | Ler histórico em voz alta |
| Ditado manual | `@react-native-voice/voice` ou `expo-speech` + input por voz do SO | Fora da chamada e pós-chamada |
| Notificações | `expo-notifications` | 1 h e 5 min antes da ligação agendada |
| Calendário nativo | `expo-calendar` | Ler eventos do celular (com permissão) |
| Chamadas (detecção) | Módulo nativo customizado ou lib community | Ver seção 4 — ponto mais sensível |

**Alternativa:** Flutter + plugins equivalentes (`flutter_call_detector`, `record`, `sqflite`, etc.) — mesma lógica de fases abaixo.

---

## 2. Pré-requisitos no seu computador

### Passo 2.1 — Ferramentas

1. Instalar **Node.js** LTS (20+).
2. Instalar **Git**.
3. Instalar **Android Studio** (SDK, emulador, variável `ANDROID_HOME`).
4. Instalar **Xcode** (somente em Mac) para build iOS.
5. Instalar CLI Expo: `npm install -g expo-cli` ou usar `npx expo`.

### Passo 2.2 — Contas (quando for usar nuvem)

- Conta **Expo** (EAS Build para binaries nativos).
- Chave API para **STT** (OpenAI ou Google Cloud Speech).
- (Opcional) Backend para backup — pode começar **100% local**.

### Passo 2.3 — Dispositivos reais

- Testar gravação em chamada **sempre em aparelho físico** (emulador não simula telefonia real).

---

## 3. Estrutura do repositório

### Passo 3.1 — Criar o projeto

```bash
cd CRM-VOZ
npx create-expo-app@latest . --template blank-typescript
npx expo install expo-sqlite expo-speech expo-notifications expo-calendar expo-av expo-file-system
npm install zustand drizzle-orm
npm install @react-native-voice/voice
npx expo prebuild
```

> `expo prebuild` gera pastas `android/` e `ios/` para módulos nativos (chamada, background).

### Passo 3.2 — Pastas sugeridas

```
src/
  app/                 # Telas (Expo Router)
  components/
  db/                  # Schema SQLite, migrations
  services/
    call/              # Detecção início/fim, número
    recording/         # Gravação só microfone
    transcription/     # Fila STT
    contacts/
    calendar/
    notifications/
  hooks/
  types/
  utils/
modules/               # Módulos nativos custom (CallDetector)
docs/
```

---

## 4. Modelo de dados (implementar cedo)

### Passo 4.1 — Tabelas SQLite

**contacts**

| Campo | Tipo |
|-------|------|
| id | TEXT PK |
| name | TEXT |
| phone_normalized | TEXT UNIQUE |
| created_at | INTEGER |

**call_sessions**

| Campo | Tipo |
|-------|------|
| id | TEXT PK |
| contact_id | TEXT FK |
| phone | TEXT |
| direction | TEXT (`in` \| `out`) |
| started_at | INTEGER |
| ended_at | INTEGER NULL |
| audio_uri | TEXT NULL |
| transcription_status | TEXT (`pending` \| `processing` \| `done` \| `failed`) |
| transcription_text | TEXT NULL |

**notes** (notas manuais ou derivadas da sessão)

| Campo | Tipo |
|-------|------|
| id | TEXT PK |
| contact_id | TEXT FK |
| call_session_id | TEXT FK NULL |
| body | TEXT |
| source | TEXT (`call_mic` \| `voice` \| `typed` \| `post_call`) |
| created_at | INTEGER |

**scheduled_calls**

| Campo | Tipo |
|-------|------|
| id | TEXT PK |
| contact_id | TEXT FK |
| scheduled_at | INTEGER |
| notified_1h | INTEGER 0/1 |
| notified_5m | INTEGER 0/1 |

### Passo 4.2 — Regras de negócio

- Uma `call_session` por ligação detectada.
- Ao encerrar: `ended_at` preenchido → salvar `audio_uri` → `transcription_status = pending`.
- Quando STT terminar: criar/atualizar `notes` com `source = call_mic` e texto transcrito.

---

## 5. Fase 1 — Base do app (sem telefonia)

Objetivo: CRM utilizável sem detecção de chamada.

### Passo 5.1 — Navegação (Expo Router)

1. Tela **Lista de contatos** (busca, ordenação).
2. Tela **Detalhe do contato**:
   - Histórico de notas (mais recente primeiro).
   - Botão **OUVIR** (TTS do texto selecionado ou da nota inteira).
   - Botão **Nova nota** (voz manual + teclado).
   - Botão **Agendar ligação** (date/time picker).
3. Tela **Agenda do app**:
   - Lista `scheduled_calls`.
   - Filtros: semana / mês / próximos 7 dias (sábado → sexta seguinte).
4. Tela **Configurações**:
   - Permissões (microfone, notificações, calendário, telefone).
   - Texto legal: “Grava apenas sua voz durante ligações”.

### Passo 5.2 — CRUD contatos

1. Importar contatos do aparelho (`expo-contacts`) ou cadastro manual.
2. Normalizar telefone (E.164 ou só dígitos) para casar com chamadas.

### Passo 5.3 — Notas manuais

1. Gravar nota com `source = voice` ou `typed`.
2. Exibir data/hora em cada item do histórico.

### Passo 5.4 — Agendamento + notificações

1. Ao salvar `scheduled_calls`, agendar duas notificações locais:
   - `scheduled_at - 1 hora`
   - `scheduled_at - 5 minutos`
2. Usar `expo-notifications`; no Android criar **canal** de alta prioridade.
3. Ao abrir notificação, navegar para detalhe do contato.

**Critério de pronto Fase 1:** contatos, notas, OUVIR, agendar e lembretes funcionando em Android e iOS.

---

## 6. Fase 2 — Gravação só do seu microfone (sem ligar ainda)

Objetivo: provar gravação e arquivo antes de integrar telefonia.

### Passo 6.1 — Serviço de gravação

1. Usar `expo-av` **Audio.Recording** com configuração:
   - Qualidade média/alta para STT.
   - **Não** usar fontes de áudio de chamada — apenas entrada padrão do microfone.
2. API interna:
   - `startRecording(sessionId)`
   - `stopRecording()` → retorna URI em `FileSystem.documentDirectory`
3. Salvar URI em `call_sessions.audio_uri` (teste com botão “Simular chamada”).

### Passo 6.2 — UI de teste

1. Botão “Iniciar gravação (teste)” / “Parar”.
2. Listar arquivos por sessão na tela do contato.

### Passo 6.3 — Avisos de UX

1. Preferir gravação com **fone de ouvido** para não captar viva-voz do cliente.
2. Mensagem curta na primeira gravação real.

**Critério de pronto Fase 2:** arquivo `.m4a`/`.wav` salvo e reproduzível no histórico.

---

## 7. Fase 3 — Detecção de chamada (Android e iOS)

Objetivo: iniciar/parar gravação automaticamente.

### Passo 7.1 — Android (mais previsível)

1. Adicionar permissões em `AndroidManifest.xml`:
   - `READ_PHONE_STATE`
   - `READ_CALL_LOG` (opcional, histórico)
   - `RECORD_AUDIO`
   - `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MICROPHONE` (Android 14+)
2. Implementar **BroadcastReceiver** ou `TelephonyCallback`:
   - `RINGING` / `OFFHOOK` → chamada ativa → obter número (se disponível).
   - `IDLE` → chamada encerrada.
3. **Foreground Service** durante gravação:
   - Notificação persistente: “CRM-VOZ gravando sua nota de voz…”
   - Evita o SO matar o processo.
4. Mapear número → `contacts.phone_normalized`.
5. Expor eventos ao JS via **Expo Module** ou `react-native-call-detection`.

### Passo 7.2 — iOS (limitações importantes)

1. Apps em foreground/background têm **acesso limitado** ao estado da chamada celular.
2. Caminhos realistas:
   - **CallKit** (extensão): identificar chamada VoIP do próprio app — não ligações celulares normais de terceiros.
   - **CXCallObserver** (iOS 10+): observa chamadas **do app** e em alguns cenários chamadas do sistema — comportamento varia; testar em device.
   - Para **ligações celulares normais**: frequentemente só é confiável abrir fluxo **pós-chamada** via:
     - Notificação local disparada ao voltar ao app após `UIApplication` ativo + heurística de tempo, ou
     - Atalho manual “Registrar ligação que acabei de atender”.
3. Documentar no app: no iPhone, pode ser necessário **confirmar contato** se o número não vier automático.

### Passo 7.3 — Ponte React Native

1. Módulo nativo `CallDetector`:
   - Eventos: `onCallStarted({ phone, direction })`, `onCallEnded({ phone, duration })`.
2. No JS, listener único:
   - `onCallStarted` → criar `call_session`, `startRecording(sessionId)`.
   - `onCallEnded` → `stopRecording()`, enfileirar transcrição, abrir tela pós-chamada.

### Passo 7.4 — Tela ao atender (Android quando número conhecido)

1. Abrir modal/tela com **histórico** do contato (recente → antiga).
2. Indicador discreto: “Gravando suas notas de voz…”.

### Passo 7.5 — Tela pós-chamada (ambos)

1. Mostrar transcrição quando pronta (ou loading).
2. Permitir editar texto, ditado extra, agendar próxima ligação.
3. Se gravação falhou ou vazia: foco em microfone + teclado.

**Critério de pronto Fase 3:** em Android, ligar/receber → gravar → desligar → nota pendente; em iOS, pelo menos fluxo pós-chamada + gravação quando detecção funcionar no device alvo.

---

## 8. Fase 4 — Transcrição automática (STT)

### Passo 8.1 — Fila de processamento

1. Serviço `TranscriptionQueue`:
   - Ao `onCallEnded`, status `pending`.
   - Worker serial (uma por vez) para não estourar API.
2. Estados na UI: “Transcrevendo…”, “Falhou — tentar de novo”.

### Passo 8.2 — Integração API (exemplo Whisper)

1. Enviar arquivo de áudio multipart para API.
2. Idioma: `pt`.
3. Salvar texto em `call_sessions.transcription_text` e em `notes.body`.
4. (Opcional) Apagar áudio após sucesso para economizar espaço — configurável.

### Passo 8.3 — Offline / privacidade (fase posterior)

1. Avaliar **whisper.cpp** ou ML Kit on-device.
2. Só se cliente exigir sem enviar áudio à nuvem.

**Critério de pronto Fase 4:** desligar → em até X minutos nota textual aparece no histórico.

---

## 9. Fase 5 — Agenda unificada

### Passo 5.1 — Calendário do celular

1. Pedir permissão `expo-calendar`.
2. Ler eventos no intervalo do filtro (semana / mês / 7 dias).
3. Mesclar na UI com `scheduled_calls` (cor/ícone diferentes: “App” vs “Celular”).

### Passo 5.2 — Regra “próximos 7 dias”

1. Calcular janela: do **sábado da semana corrente** 00:00 até **sexta seguinte** 23:59 (ajustar timezone local).

**Critério de pronto Fase 5:** uma tela lista compromissos do app + nativos com três filtros.

---

## 10. Fase 6 — Polish e publicação

### Passo 10.1 — LGPD / App Store

1. Política de privacidade: só grava sua voz; STT pode usar nuvem.
2. Tela de consentimento na primeira execução.
3. App Store / Play: descrever uso de microfone em **chamadas ativas**.

### Passo 10.2 — Testes em matriz real

| Cenário | Android | iOS |
|---------|---------|-----|
| Receber chamada de contato cadastrado | | |
| Fazer chamada para contato cadastrado | | |
| Ligação de número desconhecido | | |
| Sem falar nada na ligação | | |
| Viva-voz vs fone de ouvido | | |
| App em background | | |
| Bateria baixa / economia de energia | | |
| Falha de rede na transcrição | | |

### Passo 10.3 — Build produção

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android
eas build --platform ios
```

---

## 11. Fase 7 (opcional) — Discar por voz

1. Na agenda, botão microfone: “Ligar para João”.
2. STT do comando → busca contato → `Linking.openURL('tel:...')`.
3. Gravação continua pela Fase 3 quando a chamada nativa iniciar (Android mais estável).

---

## 12. Ordem de implementação (checklist)

Use esta ordem linear:

- [ ] **1** Setup Expo + TypeScript + SQLite + schema
- [ ] **2** Lista e detalhe de contatos + histórico de notas
- [ ] **3** Nova nota (voz manual + texto) + botão OUVIR (TTS)
- [ ] **4** Agendar ligação + notificações 1 h e 5 min
- [ ] **5** Serviço de gravação por microfone (teste manual)
- [ ] **6** Módulo nativo detecção de chamada — **Android primeiro**
- [ ] **7** LigAR gravação automática ao ciclo da chamada (Android)
- [ ] **8** Fila de transcrição STT + nota automática
- [ ] **9** Tela histórico ao atender + tela pós-chamada
- [ ] **10** iOS: CallObserver + fallbacks + testes em iPhone real
- [ ] **11** Agenda unificada (app + calendário nativo)
- [ ] **12** Consentimento, política, builds EAS

---

## 13. Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| iOS não detecta chamada celular | Fluxo pós-chamada obrigatório; associar contato manualmente se preciso |
| SO mata gravação em background | Foreground service (Android); manter app “ativo” na chamada quando possível |
| Viva-voz grava voz do cliente no mic | UX: recomendar fone de ouvido |
| STT falha sem internet | Fila retry; edição manual; modo offline futuro |
| Review da App Store | Texto claro: não grava interlocutor; microfone só para notas do usuário |

---

## 14. Estimativa grossa de esforço

| Fase | Descrição | Ordem de grandeza |
|------|-----------|-------------------|
| 1 | CRM base | 2–3 semanas |
| 2 | Gravação mic | 3–5 dias |
| 3 | Telefonia Android + iOS | 2–4 semanas |
| 4 | STT | 1 semana |
| 5 | Agenda | 1 semana |
| 6 | Publicação | 1–2 semanas |

*Tempos para 1 dev; paralelizar Android primeiro reduz risco.*

---

## 15. Próximo comando no projeto

Quando for codar a Fase 1:

```bash
npx create-expo-app@latest crm-voz-app --template blank-typescript
```

Ou iniciar na raiz `CRM-VOZ` conforme Passo 3.1.

---

## Referência rápida — fluxo final desejado

```
Chamada detectada (número → contato)
    → Inicia gravação MICROFONE (só usuário)
    → [Opcional] Mostra histórico do contato
Chamada encerra
    → Para gravação, salva audio_uri + timestamps
    → Enfileira STT
    → Cria nota com texto transcrito
    → Abre tela pós-chamada (editar, agendar, digitar)
```

Este documento é a fonte de verdade para o desenvolvimento do **CRM-VOZ**.
