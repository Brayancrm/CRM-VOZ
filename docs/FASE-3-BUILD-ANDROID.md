# Fase 3 — Detecção de chamada no Android

A detecção automática de ligação **não funciona no Expo Go**. É preciso um **build de desenvolvimento** com o módulo nativo `react-native-call-detection`.

## O que a Fase 3 faz

1. Ao **atender** (estado `Offhook`), o app:
   - Associa o número a um contato (ou cria “Chamada +número”)
   - Inicia gravação **só do seu microfone**
   - Mostra faixa verde “Gravando suas notas de voz”
   - Notificação Android (canal gravacao-chamada)

2. Ao **desligar** (`Disconnected`):
   - Para a gravação e salva a nota
   - Abre a tela **Pós-chamada** para editar o resumo

3. **WhatsApp / VoIP**: sem detecção automática — use **Iniciar simulação** na ficha do contato.

## Gerar o app Android (primeira vez)

O projeto usa **`newArchEnabled: false`** para a biblioteca de detecção de chamada funcionar.

```bash
cd CRM-VOZ
npm install
npx expo prebuild --platform android
npx expo run:android
```

Se já tinha instalado antes, **reinstale** após mudar `app.json` (gerar APK de novo).

Ou com cabo USB e depuração USB ativa no celular.

## Permissões no celular

Em **Ajustes** do CRM-VOZ → **Solicitar permissões**, e no Android também:

- **Telefone** / estado da chamada (`READ_PHONE_STATE`)
- **Microfone**
- **Notificações**

## Testar

1. Cadastre um contato com o **mesmo número** do chip (formato internacional, ex. `5531999999999`).
2. Com o CRM-VOZ instalado pelo build acima, peça para alguém ligar ou ligue para esse número.
3. Atenda → deve aparecer a faixa de gravação.
4. Desligue → tela **Pós-chamada** → salve o resumo → **Ouvir áudio** no histórico.

## Limitações conhecidas

- Com o app em segundo plano, o sistema pode limitar a gravação; prefira manter o app aberto ou voltar à faixa verde durante a ligação.
- Número exibido pela operadora pode vir sem DDI — o app tenta casar pelos últimos 8 dígitos.
- **iPhone**: detecção automática de ligação celular não está ativa; use simulação ou nota manual.

## Comandos úteis

```bash
npx expo start --dev-client   # Metro para o build instalado
npm run start:clear
```
