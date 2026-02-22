from pydantic import BaseModel, Field


class SupportRequest(BaseModel):
    message: str = Field(min_length=2)
    auto_execute: bool = False


class TranscriptionResponse(BaseModel):
    text: str


class SupportResponse(BaseModel):
    interpreted_intent: str
    response_text: str
    requires_human: bool
    task_executed: bool
    task_name: str | None = None
    execution_output: str | None = None
