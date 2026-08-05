# Depurar gravação em ligação (Android / Samsung)

## No próprio app

1. Faça uma ligação de teste e desligue.
2. **Ajustes** → **Ver status das permissões**.
3. Leia as linhas:
   - **Último erro gravação** — mensagem amigável.
   - **Diagnóstico gravação (última sessão)** — técnico, por exemplo:
     - `pipe=IN_COMM+SPK`
     - `init: VC8:N/I VCOM8:OK VCOM16:N/I …`
     - `VOICE_COMM@8k | c=219 sw=2 ps=1 maxRms=0 pcm=350400`
     - **init:** `N/I` = fonte bloqueada; `OK` = inicializou
     - Se **maxRms≈0** e **pcm** alto, silêncio digital (Samsung GSM)
     - **sw** = trocas de fonte; **ps** = trocas de pipeline (A/B/C)

## Logcat (PC + USB)

Com o telefone em modo desenvolvedor e USB depuração:

```text
adb logcat -s KooMindVAD:I KooMindMonitor:I KooMindCall:I
```

Durante a ligação deve aparecer `AudioRecord OK`, `startRecording`, e a cada ~15 s `vivo chunks=… maxRms=…`.

## Limitação do sistema

Em muitos aparelhos Samsung, durante uma **chamada GSM** o microfone fica com o app **Telefone**. O KooMind só recebe PCM “mudo” até você usar **viva-voz**, fone com microfone ou **Iniciar gravação** no contato com o app em primeiro plano.
