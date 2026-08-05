# Fase 3 — Detecção de chamada no Android

A detecção automática **não funciona no Expo Go**. Use o APK nativo (`dist/KooMind.apk` ou `npm run build:apk:release`).

## O que a Fase 3 faz

1. Ao **atender** ou **estar em ligação** (estado `Offhook`), o app:
   - Associa o número a um contato (ou cria “Chamada +número”)
   - Inicia gravação **só do seu microfone**
   - Mostra faixa “Gravando suas notas de voz”
   - Notificação Android (canal `gravacao-chamada`)

2. Ao **desligar** (`Disconnected`):
   - Para a gravação e salva a nota
   - Abre a tela **Pós-chamada** para editar e transcrever

3. **WhatsApp / VoIP**: sem detecção GSM automática — use **Iniciar gravação** na ficha do contato.

## Módulo nativo

- Pacote: `@huddle01/react-native-call-detection` (compatível com **Nova Arquitetura** / Expo SDK 54)
- Permissões `READ_PHONE_STATE` e `READ_CALL_LOG` já estão em `app.json` (não use o plugin Expo do pacote — ele está quebrado no npm)

## Gerar / atualizar o app

```powershell
cd "C:\Users\Dell - Brayan\CRM-VOZ"
npm install
npm run prebuild:android
npm run build:apk:release
```

Instale `dist\KooMind.apk` no celular (desinstale a versão antiga antes).

## Permissões no celular

Em **Ajustes** → **Solicitar permissões**:

- **Telefone** / estado da chamada (`READ_PHONE_STATE`)
- **Microfone**
- **Notificações**

No Android 10+, o número do chamador pode exigir também permissão de registro de chamadas (`READ_CALL_LOG`).

## Testar

1. Cadastre um contato com o **mesmo número** do chip (ex. `5531999999999`).
2. Instale o **KooMind.apk** (não abra via `npm start` no dia a dia).
3. Peça para alguém ligar ou ligue para esse número.
4. **Atenda** → faixa verde de gravação.
5. **Desligue** → tela **Pós-chamada** → salve → transcrição na nota (se Railway configurado).

## Limitações

- App em segundo plano: o Android pode limitar gravação — prefira manter o app aberto durante a ligação.
- Número sem DDI: o app casa pelos últimos 8 dígitos.
- **iPhone**: detecção automática de ligação celular não está ativa; use gravação manual ou simulação.

## Comandos úteis (desenvolvimento)

```bash
npm run android          # build + instalar via USB
npm run start:clear      # Metro, se usar run:android
```
