from openai import OpenAI

from .settings import settings

TASK_KEYWORDS = {
    'verificar_puerto': ['puerto', 'port', 'tcp', 'udp'],
    'reiniciar_servicio_web': ['reiniciar', 'servicio web', 'iis', 'w3svc'],
    'revision_servidores_linea': ['revision', 'servidores', 'linea de producción'],
}


def _keyword_intent(message: str) -> tuple[str, bool]:
    lower_msg = message.lower()
    for task_name, keywords in TASK_KEYWORDS.items():
        if any(keyword in lower_msg for keyword in keywords):
            return task_name, False
    return 'escalamiento_humano', True


def classify_intent(message: str) -> tuple[str, bool, str]:
    if not settings.openai_api_key:
        intent, requires_human = _keyword_intent(message)
        explanation = 'Clasificación local por palabras clave.'
        return intent, requires_human, explanation

    client = OpenAI(api_key=settings.openai_api_key)
    prompt = (
        'Clasifica la solicitud del usuario en una intención exacta de esta lista: '
        "['verificar_puerto', 'reiniciar_servicio_web', 'revision_servidores_linea', 'escalamiento_humano']. "
        'Responde solo con la intención.'
    )
    completion = client.chat.completions.create(
        model=settings.openai_model,
        temperature=0,
        messages=[
            {'role': 'system', 'content': prompt},
            {'role': 'user', 'content': message},
        ],
    )
    intent = (completion.choices[0].message.content or '').strip()
    if intent not in {'verificar_puerto', 'reiniciar_servicio_web', 'revision_servidores_linea', 'escalamiento_humano'}:
        intent = 'escalamiento_humano'

    requires_human = intent == 'escalamiento_humano'
    explanation = 'Clasificación realizada con modelo de IA.'
    return intent, requires_human, explanation


def generate_human_response(
    user_message: str,
    intent: str,
    requires_human: bool,
    task_executed: bool,
    execution_output: str | None = None,
) -> str:
    if not settings.openai_api_key:
        if requires_human:
            return (
                'Te ayudo con gusto. Esta solicitud requiere revisión humana para evitar errores. '
                'Puedo escalar tu caso con el detalle que ya me compartiste.'
            )
        if task_executed:
            return 'Listo, ya ejecuté la acción solicitada y te comparto el resultado técnico abajo.'
        return 'Entendí tu solicitud. Si confirmas, ejecuto la acción automáticamente.'

    client = OpenAI(api_key=settings.openai_api_key)
    context = (
        f'intent={intent}; requires_human={requires_human}; '
        f'task_executed={task_executed}; execution_output={execution_output or ""}'
    )
    completion = client.chat.completions.create(
        model=settings.openai_model,
        temperature=0.4,
        messages=[
            {'role': 'system', 'content': settings.human_ia_system_prompt},
            {
                'role': 'user',
                'content': (
                    f'Solicitud del usuario: {user_message}\n'
                    f'Contexto técnico: {context}\n'
                    'Responde en máximo 3 frases, tono humano y profesional.'
                ),
            },
        ],
    )
    return (completion.choices[0].message.content or '').strip() or 'Solicitud procesada.'
