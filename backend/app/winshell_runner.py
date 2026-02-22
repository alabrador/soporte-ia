import json

import winrm

from .settings import settings


def _load_allowed_commands() -> dict:
    with open(settings.allowed_commands_file, 'r', encoding='utf-8') as file:
        return json.load(file)


def resolve_task(task_name: str) -> dict | None:
    commands = _load_allowed_commands()
    return commands.get(task_name)


def _build_session() -> winrm.Session:
    if not settings.winrm_host:
        raise ValueError('Falta WINRM_HOST en la configuración.')
    if not settings.winrm_username:
        raise ValueError('Falta WINRM_USERNAME en la configuración.')
    if not settings.winrm_password:
        raise ValueError('Falta WINRM_PASSWORD en la configuración.')

    endpoint = f'http://{settings.winrm_host}:{settings.winrm_port}/wsman'
    return winrm.Session(
        endpoint,
        auth=(settings.winrm_username, settings.winrm_password),
        transport=settings.winrm_transport,
        server_cert_validation=settings.winrm_server_cert_validation,
    )


def run_task(task_name: str) -> str:
    task = resolve_task(task_name)
    if task is None:
        raise ValueError(f'Tarea no permitida: {task_name}')

    command = task.get('powershell_command', '').strip()
    if not command:
        raise ValueError(f'La tarea {task_name} no tiene powershell_command configurado.')

    session = _build_session()
    result = session.run_ps(command)

    stdout = (result.std_out or b'').decode('utf-8', errors='replace').strip()
    stderr = (result.std_err or b'').decode('utf-8', errors='replace').strip()
    combined = '\n'.join(part for part in [stdout, stderr] if part)

    if result.status_code != 0:
        raise RuntimeError(combined or f'Error remoto. status_code={result.status_code}')

    return combined or 'Comando ejecutado sin salida.'