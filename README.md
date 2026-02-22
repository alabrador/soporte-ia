# Soporte IA (Next.js + Whisper HTTP + Human IA + WinRM/PowerShell)

Plataforma MVP para soporte automatizado:

- **Frontend**: Next.js (texto + voz)
- **Backend**: FastAPI
- **STT**: Whisper por HTTP (`http://127.0.0.1:5000/transcribe`)
- **Orquestación IA**: OpenAI (opcional) con fallback local por palabras clave
- **Automatización**: ejecución remota de comandos de PowerShell permitidos (allowlist) por WinRM

## Estructura

- `web/`: interfaz de usuario en Next.js
- `backend/`: API de soporte, transcripción y ejecución remota de comandos

## 1) Variables de entorno

### Backend (`backend/.env`)

Copia `backend/.env.example` a `backend/.env` y completa:

- `OPENAI_API_KEY` (opcional)
- `WINRM_HOST` (IP o hostname del servidor Windows)
- `WINRM_USERNAME` / `WINRM_PASSWORD`
- `WINRM_TRANSPORT` (por defecto `ntlm`)
- `WHISPER_HTTP_URL` (por defecto `http://127.0.0.1:5000/transcribe`)

### Frontend (`web/.env.local`)

Copia `web/.env.example` a `web/.env.local`.

## 2) Levantar backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## 3) Levantar frontend

```bash
cd web
npm install
npm run dev
```

App web: `http://localhost:3000`

## 4) Flujo de uso

1. Usuario escribe o graba una solicitud.
2. Si es voz, backend envía audio a Whisper HTTP para transcripción.
3. Backend clasifica intención (`verificar_puerto`, `reiniciar_servicio_web`, `revision_servidores_linea` o `escalamiento_humano`).
4. Human IA genera una respuesta natural y breve.
5. Si `auto_execute=true`, ejecuta comando PowerShell permitido en el servidor remoto.
6. Frontend muestra la respuesta y también la reproduce por voz (Web Speech API).

## Seguridad (importante)

- Solo se ejecutan tareas definidas en `backend/app/allowed_powershell_commands.json`.
- No exponer esta API sin autenticación en ambientes productivos.
- Añadir control de permisos por usuario/rol antes de producción.
