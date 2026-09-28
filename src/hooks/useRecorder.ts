import { useCallback, useEffect, useRef, useState } from "react";

export interface RecordingResult {
  transcript: string;
  durationMs: number;
  peaks: number[];
  blob: Blob | null;
  engine: "live" | "audio-only";
}

type Recog = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: {
    resultIndex: number;
    results: ArrayLike<{ 0: { transcript: string; confidence?: number }; isFinal: boolean }>;
  }) => void) | null;
  onend: (() => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function speechCtor(): (new () => Recog) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recog; webkitSpeechRecognition?: new () => Recog };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function pickMime() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  if (typeof MediaRecorder === "undefined") return "";
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [partial, setPartial] = useState("");
  const [level, setLevel] = useState(0);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [speechAvailable, setSpeechAvailable] = useState(true);

  const recordingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const startedRef = useRef(0);
  const peaksRef = useRef<number[]>([]);
  const speechRef = useRef<Recog | null>(null);
  const finalsRef = useRef("");
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef("");

  useEffect(() => {
    setSpeechAvailable(Boolean(speechCtor()));
  }, []);

  const stopSpeech = () => {
    const s = speechRef.current;
    speechRef.current = null;
    if (!s) return;
    s.onend = null;
    s.onresult = null;
    s.onerror = null;
    try {
      s.abort();
    } catch {
      /* already stopped */
    }
  };

  const attachSpeech = useCallback(() => {
    const Ctor = speechCtor();
    if (!Ctor) return;
    const speech = new Ctor();
    speech.lang = navigator.language || "en-US";
    speech.continuous = true;
    speech.interimResults = true;
    speech.maxAlternatives = 3;
    speech.onresult = (ev) => {
      let live = "";
      for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
        const piece = ev.results[i][0]?.transcript ?? "";
        if (ev.results[i].isFinal) finalsRef.current = `${finalsRef.current} ${piece}`.trim();
        else live += piece;
      }
      const text = `${finalsRef.current} ${live}`.trim();
      setPartial(text);
    };
    speech.onerror = (ev) => {
      if (ev.error === "no-speech" || ev.error === "aborted") return;
      if (ev.error === "not-allowed") setError("Mic permission is blocked for transcription.");
    };
    speech.onend = () => {
      if (!recordingRef.current) return;
      window.setTimeout(() => {
        if (!recordingRef.current) return;
        try {
          speech.start();
        } catch {
          attachSpeech();
        }
      }, 80);
    };
    try {
      speech.start();
      speechRef.current = speech;
    } catch {
      /* Chrome throws if it is already running */
    }
  }, []);

  const stop = useCallback(async (): Promise<RecordingResult | null> => {
    if (!recordingRef.current && !streamRef.current) return null;
    recordingRef.current = false;
    stopSpeech();
    cancelAnimationFrame(rafRef.current);

    const blob = await new Promise<Blob | null>((resolve) => {
      let done = false;
      const finish = (next: Blob | null) => {
        if (done) return;
        done = true;
        resolve(next);
      };
      const rec = mediaRef.current;
      const fromChunks = (type: string) =>
        chunksRef.current.length ? new Blob(chunksRef.current, { type: type || "audio/webm" }) : null;
      if (!rec || rec.state === "inactive") {
        finish(fromChunks(mimeRef.current));
        return;
      }
      rec.onstop = () => finish(fromChunks(rec.mimeType || mimeRef.current));
      try {
        rec.stop();
      } catch {
        finish(fromChunks(mimeRef.current));
      }
      window.setTimeout(() => finish(fromChunks(rec.mimeType || mimeRef.current)), 1200);
    });

    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (ctxRef.current) void ctxRef.current.close();
    const durationMs = Math.max(400, Date.now() - startedRef.current);
    const transcript = finalsRef.current.trim() || "";
    const capturedPeaks = peaksRef.current.slice(-48);
    const engine: RecordingResult["engine"] = transcript ? "live" : "audio-only";

    streamRef.current = null;
    ctxRef.current = null;
    mediaRef.current = null;
    chunksRef.current = [];
    setRecording(false);
    setLevel(0);
    setElapsedMs(durationMs);
    return { transcript, durationMs, peaks: capturedPeaks, blob, engine };
  }, []);

  const cancel = useCallback(async () => {
    await stop();
    setPartial("");
    setPeaks([]);
    setElapsedMs(0);
  }, [stop]);

  const start = useCallback(async () => {
    setError(null);
    finalsRef.current = "";
    peaksRef.current = [];
    chunksRef.current = [];
    setPartial("");
    setPeaks([]);
    setElapsedMs(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      startedRef.current = Date.now();
      recordingRef.current = true;

      const mime = pickMime();
      mimeRef.current = mime;
      if (typeof MediaRecorder !== "undefined") {
        const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        rec.ondataavailable = (e) => {
          if (e.data.size) chunksRef.current.push(e.data);
        };
        rec.start(250);
        mediaRef.current = rec;
      }

      attachSpeech();

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const n of data) sum += Math.abs(n - 128);
        const amp = Math.min(1, sum / (data.length * 28));
        setLevel(amp);
        setElapsedMs(Date.now() - startedRef.current);
        peaksRef.current.push(amp);
        if (peaksRef.current.length > 64) peaksRef.current.shift();
        setPeaks([...peaksRef.current.slice(-32)]);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      setRecording(true);
    } catch {
      recordingRef.current = false;
      setError("Roux needs the mic. Allow microphone access, then try again.");
      setRecording(false);
    }
  }, [attachSpeech]);

  return {
    recording,
    partial,
    level,
    peaks,
    elapsedMs,
    error,
    speechAvailable,
    start,
    stop,
    cancel,
  };
}
