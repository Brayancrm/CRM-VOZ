# Problemas ao abrir no celular (Expo Go)

## Erro: "Project is incompatible with this version of Expo Go"

O CRM-VOZ usa **Expo SDK 54**. No Expo Go, em **Settings**, confira:

- **Supported SDK: 54** (como no seu celular)
- Se o projeto estiver em SDK 56 e o Expo Go em 54 → aparece “precisa de versão mais nova”
- Se o projeto estiver em SDK 54 e o Expo Go em 54 → deve abrir normalmente

Este repositório foi ajustado para **SDK 54** para combinar com a Play Store atual.

### O que fazer

1. No celular, abra a loja (Google Play ou App Store).
2. Busque **Expo Go** → **Atualizar** (não basta abrir; precisa instalar a última versão).
3. No PC, pare o servidor (**Ctrl+C**) e rode de novo:

```powershell
cd "C:\Users\Dell - Brayan\CRM-VOZ"
npm install
npx expo start -c
```

4. Escaneie o QR Code de novo.

Se não aparecer "Atualizar", desinstale o Expo Go e instale outra vez.

---

## Fica rodando e não entra (loading infinito)

Causas comuns:

| Causa | Solução |
|-------|---------|
| Expo Go desatualizado | Atualizar Expo Go (igual acima) |
| PC e celular em redes diferentes | Mesmo Wi‑Fi (não use dados móveis só no celular) |
| Firewall do Windows | Permitir **Node.js** em rede privada |
| VPN no PC ou celular | Desligar VPN nos dois |
| Pacote não baixou | Usar modo túnel (abaixo) |

### Modo túnel (recomendado se Wi‑Fi falhar)

```powershell
npx expo start --tunnel -c
```

Na primeira vez pode pedir para instalar `@expo/ngrok` — confirme com **Y**.

O QR Code muda; escaneie o novo. O túnel é mais lento, mas passa por firewall/rede complicada.

### Abrir sem QR Code

Com o servidor rodando, no terminal do Expo pressione:

- **`a`** — abre no emulador Android (se tiver Android Studio)
- No Expo Go: **Enter URL manually** e digite o endereço que aparece em `Metro` (ex.: `exp://192.168.1.124:8081`)

---

## Testar no PC (sem celular)

Só para ver telas e navegação (microfone/contatos limitados no navegador).

Se aparecer erro de `react-native-web`, rode uma vez:

```powershell
npx expo install react-native-web react-dom
npm run web
```

O navegador deve abrir em `http://localhost:8081`.

Se ficar só na bolinha girando, pare o servidor (**Ctrl+C**) e rode:

```powershell
npx expo start --web -c
```

**Causa comum:** `expo-sqlite` no navegador (erro `wa-sqlite.wasm`). O projeto agora usa armazenamento no navegador só na web — atualize o código (`git pull` ou salve os arquivos) antes de testar de novo.

---

## Checklist rápido

- [ ] `npm install` terminou **sem** erro vermelho ERESOLVE
- [ ] Expo Go **atualizado** nos dois celulares
- [ ] Mesma rede Wi‑Fi ou `--tunnel`
- [ ] `npx expo start -c` após atualizar o Expo Go
