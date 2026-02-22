from pathlib import Path
from tempfile import NamedTemporaryFile

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .ai import classify_intent, generate_human_response
from .winshell_runner import run_task
from .schemas import SupportRequest, SupportResponse, TranscriptionResponse
from .settings import settings
from .stt import transcribe_audio_file

app = FastAPI(title='Soporte IA API', version='0.1.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.backend_cors_origins.split(',')],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.get('/health')
def health():
    return {'status': 'ok'}


@app.post('/api/transcribe', response_model=TranscriptionResponse)
async def transcribe(file: UploadFile = File(...)):
    suffix = Path(file.filename or 'audio.wav').suffix or '.wav'
    with NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(await file.read())
        temp_path = temp_file.name

    try:
        text = transcribe_audio_file(temp_path)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        Path(temp_path).unlink(missing_ok=True)

    return TranscriptionResponse(text=text)


@app.post('/api/support/request', response_model=SupportResponse)
def support_request(payload: SupportRequest):
    intent, requires_human, explanation = classify_intent(payload.message)

    if requires_human:
        response_text = generate_human_response(
            user_message=payload.message,
            intent=intent,
            requires_human=True,
            task_executed=False,
        )
        return SupportResponse(
            interpreted_intent=intent,
            response_text=f'{response_text} {explanation}',
            requires_human=True,
            task_executed=False,
        )

    if not payload.auto_execute:
        response_text = generate_human_response(
            user_message=payload.message,
            intent=intent,
            requires_human=False,
            task_executed=False,
        )
        return SupportResponse(
            interpreted_intent=intent,
            response_text=response_text,
            requires_human=False,
            task_executed=False,
            task_name=intent,
        )

    try:
        output = run_task(intent)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    response_text = generate_human_response(
        user_message=payload.message,
        intent=intent,
        requires_human=False,
        task_executed=True,
        execution_output=output,
    )

    return SupportResponse(
        interpreted_intent=intent,
        response_text=response_text,
        requires_human=False,
        task_executed=True,
        task_name=intent,
        execution_output=output,
    )
