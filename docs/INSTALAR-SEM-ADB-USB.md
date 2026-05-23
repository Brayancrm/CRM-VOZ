# Instalar o CRM-VOZ sem cabo USB (adb)

Use se `adb devices` continuar vazio, mas o Windows enxerga o celular como pasta (MTP).

## A) Depuração sem fio (recomendado para desenvolver)

### No celular (Samsung)

1. **Opções do desenvolvedor** → ative **Depuração USB** e **Depuração sem fio**
2. Toque em **Depuração sem fio** → **Emparelhar dispositivo com código de emparelhamento**
3. Anote **IP:porta** e o **código de 6 dígitos**

### No PC (mesmo Wi‑Fi que o celular)

```powershell
cd "C:\Users\Dell - Brayan\CRM-VOZ"
$env:Path = "$env:LOCALAPPDATA\Android\Sdk\platform-tools;$env:Path"

adb pair 192.168.X.X:PORTA_DO_PAR   # exemplo: adb pair 192.168.1.50:37123
# Digite o código de 6 dígitos quando pedir

adb connect 192.168.X.X:PORTA_CONEXAO   # aparece na tela Depuração sem fio (porta diferente)
adb devices
```

Deve aparecer `device`. Depois:

```powershell
npx expo run:android
```

---

## B) Gerar APK e copiar para o celular (recomendado se USB/adb não funcionar)

### Atalho no projeto

```powershell
cd "C:\Users\Dell - Brayan\CRM-VOZ"
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
npm run build:apk
```

O APK sai em:

`android\app\build\outputs\apk\debug\app-debug.apk`

Copie para **Download** do celular → abra → instale.

> Após mudar `app.json` (ex.: `newArchEnabled`), rode `npm run build:apk` de novo antes de instalar.

---

## B2) Instalar APK copiando pelo Explorer (sem adb)

### 1. Gerar o APK no PC

**Java (obrigatório):** o Gradle precisa do `JAVA_HOME`. Use o Java que vem com o Android Studio:

Variável de usuário **JAVA_HOME** = `C:\Program Files\Android\Android Studio\jbr`

No PowerShell (teste rápido nesta sessão):

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
java -version
```

O arquivo `android/local.properties` deve existir com (ajuste se o SDK estiver em outro lugar):

```properties
sdk.dir=C:/Users/Dell - Brayan/AppData/Local/Android/Sdk
```

Depois:

```powershell
cd "C:\Users\Dell - Brayan\CRM-VOZ\android"
.\gradlew.bat assembleDebug
```

APK gerado em:

`android\app\build\outputs\apk\debug\app-debug.apk`

### 2. Copiar para o celular

1. Conecte USB (modo transferência de arquivos)
2. No Explorer, abra **S26 Ultra** → armazenamento interno → pasta **Download**
3. Copie `app-debug.apk` para **Download**

### 3. Instalar no celular

1. Abra **Meus arquivos** → **Download** → toque em `app-debug.apk`
2. Permita **Instalar apps desconhecidos** se o sistema pedir
3. Instale e abra **CRM-VOZ**

> Para atualizar o código depois, use depuração sem fio (A) ou gere o APK de novo.

---

## C) Conferir driver no Windows

1. **Win + X** → **Gerenciador de Dispositivos**
2. Com cabo conectado, procure:
   - **Samsung Android Phone** ou **ADB Interface** ou **Dispositivo desconhecido**
3. Se houver **?** amarelo: botão direito → **Atualizar driver** → **Procurar no computador** → pasta:
   `C:\Users\Dell - Brayan\AppData\Local\Android\Sdk\extras\google\usb_driver`

Driver Samsung: https://developer.samsung.com/android-usb-driver
