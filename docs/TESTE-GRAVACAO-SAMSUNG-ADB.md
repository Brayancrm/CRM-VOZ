# Teste de gravação GSM — KooMind (comandos ADB corrigidos)

O checklist do branch de teste usa nomes genéricos; no APK actual:

| Item | Valor real |
|------|------------|
| Package | `com.koomind.app` |
| Tags logcat | `KooMindVAD`, `KooMindMonitor`, `KooMindCallLog` |
| WAV nativo | `/data/data/com.koomind.app/files/koomind_recordings/{sessionId}.wav` |

---

## 1. Talker no Samsung (antes do APK)

```bash
adb shell dumpsys accessibility | grep -iE "talker|acr|nll|record|callrecord"
adb shell pm list packages | grep -iE "acr|talker|nll|helper|callrec"
```

Package Talker na Play costuma ser `com.nll.acr` ou similar — confirme no `pm list`.

---

## 2. Instalar APK

```bash
adb install -r dist/KooMind.apk
```

---

## 3. Logcat durante a chamada

```bash
adb logcat -s KooMindVAD:I KooMindVAD:W KooMindMonitor:I KooMindCallLog:D
```

Procurar:

- `OFFHOOK → aguardando 1500ms`
- `MODE_IN_COMMUNICATION`
- `source=4 rate=8000 → INITIALIZED` (VOICE_CALL)
- `Fonte vencedora: VOICE_CALL+IN_COMM@8k`
- `DIAGNÓSTICO → … maxRms=…`
- `Áudio real detectado` ou `Silêncio digital`

No app: **Ajustes → Ver status** → linha `Diagnóstico gravação`.

---

## 4. Extrair WAV (requer run-as ou debug)

```bash
adb shell run-as com.koomind.app ls files/koomind_recordings/
adb shell run-as com.koomind.app cat files/koomind_recordings/SEU_SESSION_ID.wav > call.wav
```

Ou após cópia para documentos pelo fluxo do app, via gestor de ficheiros.

---

## 5. Se maxRms=0 — constantes no código

Ficheiro: `scripts/koomind/KoomindCallMonitorService.java` → `DELAY_OFFHOOK_MS` (1500)

Ficheiro: `scripts/koomind/KoomindVadAudioRecorder.java` → `DELAY_AFTER_MODE_MS`, `DELAY_AFTER_SPEAKER_MS`; pipelines em `ROUTE_PIPELINES`.

Depois: `node scripts/patch-huddle-call-detection.js` e rebuild APK.

---

## 6. Frida no Talker (avançado)

Package real do Talker no telefone:

```bash
adb shell pm list packages | grep -i talker
```

Use esse package no `frida -U -n …` do script do teu amigo.
