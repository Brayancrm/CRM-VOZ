# Limitações na gravação durante **ligação GSM** (Samsung / Android)

## Por que “nada funciona” mesmo com permissões e app aberto?

Numa **chamada de rede normal** (o ícone verde do Telefone), o Android dá prioridade ao **aplicativo Telefone** para o microfone e ao encaminhamento de voz. Outras apps (incluindo o KooMind) podem:

- receber **PCM quase sempre silencioso**;
- ou só começar a captar quando o **KooMind está mesmo em primeiro plano** (ecrã visível), com **viva-voz** ou **fone com microfone**.

Isto **não é resolvido** só com `Foreground Service`, `AudioRecord`, `VOICE_COMMUNICATION` ou VAD: são camadas corretas, mas o **roteamento de áudio** continua a ser decidido pelo sistema e pelo fabricante (ex.: Knox no Samsung).

## Modo de teste atual (sem partilhar ecrã)

1. **2500 ms** após `OFFHOOK` sem mexer no `AudioManager` (HAL Samsung)
2. **Pipeline D primeiro:** `NORMAL+MIC` — **não altera** mode/speaker; `MIC@16k` → `MIC@44k`
3. Depois pipelines A/B/C: `IN_COMM+SPK` → `IN_CALL+EAR` → `IN_COMM+EAR`
4. Fontes GSM: `VOICE_CALL` → `VOICE_COMM` → `VREC` → `CAM` → `MIC`

No diagnóstico procure `pipe=NORMAL+MIC`, `init: MIC16:OK MIC44:OK` e `maxRms > 0`.

## O que é **fiável** na prática

1. **Depois da ligação**, na ecrã **Pós-chamada**, usar **«Gravar minha nota de voz agora»** — o microfone já não está disputado com a chamada.
2. Na ficha do contato, **«Iniciar gravação»** com o **KooMind em primeiro plano** e viva-voz (para chamadas em que consegues manter o app visível).
3. **Bateria sem restrições** (como Talker ACR) — obrigatório no Samsung.
4. **Diagnóstico** em **Ajustes → Ver status das permissões** (`Diagnóstico gravação`): se `maxRms` ficar ~0 durante a ligação, o hardware está a entregar silêncio ao KooMind.

## O que **não** prometemos

- Gravar **a outra pessoa** na linha (operadoras / lei / API).
- Garantir gravação automática **em segundo plano** durante toda a GSM em todos os Samsung — depende demasiado do modelo e da versão do One UI.

Para CRM/notas, o fluxo estável é: **nota de voz ou texto após a chamada**, não depender só da captura automática em cima da linha.
