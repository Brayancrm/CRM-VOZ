# KooMind Helper — instalação (Samsung / Android 13+)

App complementar **fora da Play Store**, no modelo **Talker ACR Helper**. Permite gravar **a sua voz** durante ligações GSM quando o KooMind sozinho recebe silêncio digital (`maxRms=0`).

## 1. Instalar o KooMind principal

- APK: `dist/KooMind.apk` (`npm run build:apk:release`)
- Activar detecção, bateria sem restrições, permissões (Ajustes).

## 2. Instalar o Helper

```bash
npm run build:helper:release
```

Copie `dist/KooMindHelper.apk` para o telefone e instale (fontes desconhecidas).

## 3. Definições restritas (Android 13+)

1. **Definições → Apps → KooMind Helper**
2. Menu **⋮** → **Permitir definições restritas** → OK

## 4. Activar o conector

1. **Definições → Acessibilidade → Apps instaladas**
2. **KooMind App Connector** → activar → OK

Ou abra a app **KooMind Helper** e siga os botões.

## 5. Teste

1. KooMind → **Ativar detecção**
2. Ligação ~30 s pelo app Telefone
3. **Ajustes → Ver status** → diagnóstico deve mostrar `pipe=HELPER+MIC` e `maxRms > 0`
4. Pós-chamada → ouvir / transcrever a sua voz

## Resolução de problemas

| Problema | Solução |
|----------|---------|
| «Acesso negado» em Acessibilidade | Passo 3 (definições restritas) |
| Helper instalado mas conector OFF | Repetir passo 4 |
| `maxRms=0` ainda | Reinstalar Helper + reiniciar telefone |
| Só pós-chamada funciona | Helper não activo — verificar Ajustes |

## Notas

- Grava **a sua voz**, não a do interlocutor (CRM).
- Helper **não** substitui o KooMind — trabalham em par.
- Pacote Helper: `com.koomind.helper`
