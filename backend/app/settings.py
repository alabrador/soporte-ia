from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8')

    openai_api_key: str | None = None
    openai_model: str = 'gpt-4o-mini'
    whisper_http_url: str = 'http://127.0.0.1:5000/transcribe'
    whisper_audio_field: str = 'audio'
    whisper_language: str = 'es'
    human_ia_system_prompt: str = (
        'Eres un agente de soporte técnico empático, claro y breve. '
        'Explicas el resultado en español y propones siguiente paso concreto.'
    )
    allowed_commands_file: str = './app/allowed_powershell_commands.json'
    winrm_host: str = ''
    winrm_port: int = 5985
    winrm_transport: str = 'ntlm'
    winrm_username: str = ''
    winrm_password: str = ''
    winrm_server_cert_validation: str = 'ignore'
    backend_cors_origins: str = 'http://localhost:3000'


settings = Settings()
