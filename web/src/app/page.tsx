"use client";

import { useMemo, useRef, useState } from "react";

type SupportResponse = {
  interpreted_intent: string;
  response_text: string;
  requires_human: boolean;
  task_executed: boolean;
  task_name?: string | null;
  execution_output?: string | null;
};

export default function Home() {
  const [message, setMessage] = useState("");
  const [autoExecute, setAutoExecute] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [continuousMode, setContinuousMode] = useState(false);
  const [result, setResult] = useState<SupportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiceReplyEnabled, setVoiceReplyEnabled] = useState(true);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const currentStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const silenceMonitorRef = useRef<number | null>(null);
  const continuousModeRef = useRef(false);

  const backendUrl = useMemo(
    () => process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000",
    []
  );

  const clearAudioMonitoring = () => {
    if (silenceMonitorRef.current !== null) {
      window.clearInterval(silenceMonitorRef.current);
      silenceMonitorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const stopStreamTracks = () => {
    currentStreamRef.current?.getTracks().forEach((track) => track.stop());
    currentStreamRef.current = null;
  };

  const stopRecording = (disableContinuousMode = false) => {
    if (disableContinuousMode) {
      continuousModeRef.current = false;
      setContinuousMode(false);
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    } else {
      clearAudioMonitoring();
      stopStreamTracks();
      setRecording(false);
    }
  };

  const startRecording = async () => {
    if (recording || transcribing || loading) return;

    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      currentStreamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.fftSize);
      let speechDetected = false;
      let silenceStart = 0;

      silenceMonitorRef.current = window.setInterval(() => {
        if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== "recording") {
          return;
        }

        analyser.getByteTimeDomainData(dataArray);
        let sumSquares = 0;
        for (let i = 0; i < dataArray.length; i += 1) {
          const normalized = (dataArray[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }

        const rms = Math.sqrt(sumSquares / dataArray.length);
        const speechThreshold = 0.03;
        const silenceThreshold = 0.015;

        if (rms > speechThreshold) {
          speechDetected = true;
          silenceStart = 0;
          return;
        }

        if (!speechDetected || rms > silenceThreshold) {
          silenceStart = 0;
          return;
        }

        if (silenceStart === 0) {
          silenceStart = Date.now();
          return;
        }

        if (Date.now() - silenceStart > 1200) {
          stopRecording();
        }
      }, 150);

      recorder.onstop = async () => {
        setRecording(false);
        clearAudioMonitoring();
        stopStreamTracks();

        if (chunksRef.current.length === 0) {
          if (continuousModeRef.current) {
            window.setTimeout(() => {
              void startRecording();
            }, 400);
          }
          return;
        }

        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("file", blob, "audio.webm");

        setTranscribing(true);
        try {
          const response = await fetch(`${backendUrl}/api/transcribe`, {
            method: "POST",
            body: formData,
          });
          if (!response.ok) {
            const details = await response.text();
            throw new Error(`Error transcribiendo audio: ${details}`);
          }

          const data = (await response.json()) as { text: string };
          const transcript = data.text.trim();
          setMessage(transcript);

          if (transcript) {
            await submitSupportRequest(transcript);
            if (continuousModeRef.current && !voiceReplyEnabled) {
              window.setTimeout(() => {
                void startRecording();
              }, 400);
            }
          } else if (continuousModeRef.current) {
            window.setTimeout(() => {
              void startRecording();
            }, 400);
          }
        } catch (transcriptionError) {
          setError(
            transcriptionError instanceof Error
              ? transcriptionError.message
              : "No fue posible transcribir el audio."
          );
          if (continuousModeRef.current) {
            window.setTimeout(() => {
              void startRecording();
            }, 1000);
          }
        } finally {
          setTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError("No se pudo iniciar la grabación de audio.");
      continuousModeRef.current = false;
      setContinuousMode(false);
      clearAudioMonitoring();
      stopStreamTracks();
    }
  };

  const startContinuousConversation = async () => {
    continuousModeRef.current = true;
    setContinuousMode(true);
    await startRecording();
  };

  const submitSupportRequest = async (requestMessage: string) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`${backendUrl}/api/support/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: requestMessage, auto_execute: autoExecute }),
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error(`Error backend: ${details}`);
      }

      const data = (await response.json()) as SupportResponse;
      setResult(data);
      if (voiceReplyEnabled && typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(data.response_text);
        utterance.lang = "es-ES";
        utterance.rate = 1;
        utterance.onend = () => {
          if (continuousModeRef.current) {
            window.setTimeout(() => {
              void startRecording();
            }, 250);
          }
        };
        window.speechSynthesis.speak(utterance);
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudo completar la solicitud."
      );
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!message.trim()) return;
    await submitSupportRequest(message.trim());
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="mb-2 inline-flex rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
          Plataforma de Soporte Automatizado
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Soporte IA + PowerShell Remoto</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          Plataforma de soporte automatizado con entrada por texto o voz (Whisper) y ejecución controlada de comandos PowerShell en servidor remoto.
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <label className="block text-sm font-semibold tracking-wide text-zinc-700 dark:text-zinc-200">
          Solicitud del usuario
        </label>
        <textarea
          className="min-h-36 w-full rounded-xl border border-zinc-300 bg-zinc-50 p-3.5 text-sm leading-6 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-400"
          placeholder="Ejemplo: verifica el puerto 443 del servidor web"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={loading || transcribing}
            className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
          >
            {loading ? "Procesando..." : "Enviar solicitud"}
          </button>

          {!recording ? (
            <button
              type="button"
              onClick={() => void startRecording()}
              disabled={loading || transcribing}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Grabar voz
            </button>
          ) : (
            <button
              type="button"
              onClick={() => stopRecording()}
              className="rounded-xl border border-red-500 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300"
            >
              Detener grabación
            </button>
          )}

          {!continuousMode ? (
            <button
              type="button"
              onClick={() => void startContinuousConversation()}
              disabled={loading || transcribing || recording}
              className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              Iniciar conversación continua
            </button>
          ) : (
            <button
              type="button"
              onClick={() => stopRecording(true)}
              className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
            >
              Detener conversación continua
            </button>
          )}

          <label className="flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:text-zinc-200">
            <input
              type="checkbox"
              checked={autoExecute}
              onChange={(event) => setAutoExecute(event.target.checked)}
              className="h-4 w-4 rounded border-zinc-400"
            />
            Ejecutar tarea automáticamente
          </label>

          <label className="flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:text-zinc-200">
            <input
              type="checkbox"
              checked={voiceReplyEnabled}
              onChange={(event) => setVoiceReplyEnabled(event.target.checked)}
              className="h-4 w-4 rounded border-zinc-400"
            />
            Respuesta por voz
          </label>
        </div>

        {transcribing && (
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Transcribiendo audio con Whisper...
          </p>
        )}

        {continuousMode && (
          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
            Modo manos libres activo: escucho, detecto silencio y continúo la conversación automáticamente.
          </p>
        )}
      </form>

      {error && (
        <section className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm font-medium text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </section>
      )}

      {result && (
        <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-semibold tracking-tight">Resultado</h2>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <p className="rounded-lg bg-zinc-100 px-3 py-2 dark:bg-zinc-900">
              <span className="font-semibold">Intención:</span> {result.interpreted_intent}
            </p>
            <p className="rounded-lg bg-zinc-100 px-3 py-2 dark:bg-zinc-900">
              <span className="font-semibold">Escalamiento humano:</span> {result.requires_human ? "Sí" : "No"}
            </p>
            <p className="rounded-lg bg-zinc-100 px-3 py-2 dark:bg-zinc-900">
              <span className="font-semibold">Tarea ejecutada:</span> {result.task_executed ? "Sí" : "No"}
            </p>
            {result.task_name && (
              <p className="rounded-lg bg-zinc-100 px-3 py-2 dark:bg-zinc-900">
                <span className="font-semibold">Tarea:</span> {result.task_name}
              </p>
            )}
          </div>
          <p className="rounded-lg border border-zinc-200 px-3 py-3 text-sm leading-6 dark:border-zinc-800">
            <span className="font-semibold">Respuesta:</span> {result.response_text}
          </p>
          {result.execution_output && (
            <pre className="max-h-80 overflow-auto rounded-xl bg-zinc-900 p-4 text-xs leading-5 text-zinc-100">
              {result.execution_output}
            </pre>
          )}
        </section>
      )}
    </main>
  );
}
