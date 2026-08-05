# KooMind — APK que abre sozinho (sem PC)

## Por que fechava ao abrir?

O APK **debug** (ou build com **expo-dev-client**) **não leva o JavaScript dentro** — ele espera o Metro no PC (`npm start`). Sem o terminal, o Android mostra *“aplicação fechada por causa de um bug”*.

Use sempre o APK **release** gerado com `npm run build:apk:release` (arquivo `dist/KooMind.apk`).

## No celular (antes de instalar de novo)

1. **Desinstale** o KooMind antigo (segure o ícone → Desinstalar).
2. Não use **Expo Go** para o app final — use só o ícone **KooMind**.

## Gerar APK no PC

```powershell
cd "C:\Users\Dell - Brayan\CRM-VOZ"
npm install
npm run prebuild:android
npm run build:apk:release
```

Copie para o telefone: **`dist\KooMind.apk`**

## Depois de instalar

1. Abra **KooMind** (sem ligar o PC).
2. **Ajustes** → permissões (microfone, contatos, calendário, notificações).
3. Cole a URL do **Railway** se quiser transcrição.
4. **Contatos** → importar ou criar contato.

## Modo escuro

Lua no canto superior direito.

## Ainda não abre?

No PC, com o celular em USB e depuração USB ativa:

```powershell
adb logcat -s AndroidRuntime
```

Abra o app e envie a última linha de erro ao desenvolvedor.
