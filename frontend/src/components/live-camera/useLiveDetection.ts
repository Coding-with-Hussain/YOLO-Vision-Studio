import { useCallback, useEffect, useRef, useState } from "react";

import { wsUrl } from "@/services/api";
import type { Detection, InferenceParams, LiveServerMessage, ModelRef } from "@/types/api";

export type SocketStatus = "idle" | "connecting" | "open" | "closed";

export interface LiveResult {
  frameId: number;
  width: number;
  height: number;
  detections: Detection[];
  bitmap: ImageBitmap | null;
  receivedAt: number;
}

export interface LiveEvent {
  id: number;
  at: number;
  className: string;
  classId: number;
  kind: "appeared" | "left";
}

export interface LiveStats {
  fps: number;
  avgLatencyMs: number | null;
  serverMs: number | null;
  totalObjects: number;
  framesProcessed: number;
  dropped: number;
  latencies: number[];
  classTotals: Record<string, number>;
  model: ModelRef | null;
  device: string | null;
}

const EMPTY_STATS: LiveStats = {
  fps: 0,
  avgLatencyMs: null,
  serverMs: null,
  totalObjects: 0,
  framesProcessed: 0,
  dropped: 0,
  latencies: [],
  classTotals: {},
  model: null,
  device: null,
};

const STALL_TIMEOUT_MS = 6_000;
const FATAL_CODES = new Set(["MODEL_NOT_LOADED", "DEVICE_UNAVAILABLE"]);

export interface CaptureOptions {
  targetFps: number;
  captureWidth: number;
  jpegQuality: number;
  keepBitmaps: boolean;
}

/**
 * Streams camera frames to the backend over a WebSocket and collects results.
 *
 * Backpressure: at most one frame is in flight. A new frame is captured only
 * after the previous result (or error) arrived and the target interval has
 * passed, so a slow backend lowers the frame rate instead of building a queue.
 */
export function useLiveDetection(videoRef: React.RefObject<HTMLVideoElement | null>, params: InferenceParams, capture: CaptureOptions) {
  const socketRef = useRef<WebSocket | null>(null);
  const [socketStatus, setSocketStatus] = useState<SocketStatus>("idle");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LiveResult | null>(null);
  const [stats, setStats] = useState<LiveStats>(EMPTY_STATS);
  const [events, setEvents] = useState<LiveEvent[]>([]);

  const runningRef = useRef(false);
  const inFlight = useRef<{ id: number; sentAt: number } | null>(null);
  const lastSent = useRef(0);
  const frameId = useRef(0);
  const bitmaps = useRef(new Map<number, ImageBitmap>());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const resultTimes = useRef<number[]>([]);
  const previousClasses = useRef(new Map<number, string>());
  const eventId = useRef(0);
  const captureRef = useRef(capture);
  const paramsRef = useRef(params);
  const intentionalClose = useRef(false);
  captureRef.current = capture;

  const clearBitmaps = () => {
    bitmaps.current.forEach((b) => b.close?.());
    bitmaps.current.clear();
  };

  const sendConfig = useCallback((p: InferenceParams) => {
    const ws = socketRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "config", settings: p }));
  }, []);

  useEffect(() => {
    paramsRef.current = params;
    sendConfig(params);
  }, [params, sendConfig]);

  const handleMessage = useCallback((event: MessageEvent) => {
    let message: LiveServerMessage;
    try {
      message = JSON.parse(event.data as string);
    } catch {
      return;
    }
    if (message.type === "ready") {
      setStats((s) => ({ ...s, model: message.model }));
      sendConfig(paramsRef.current);
      return;
    }
    if (message.type === "error") {
      if (message.frame_id != null && inFlight.current?.id === message.frame_id) inFlight.current = null;
      setError(message.message);
      if (FATAL_CODES.has(message.code)) {
        runningRef.current = false;
        setRunning(false);
      }
      return;
    }
    if (message.type !== "result") return;

    const now = performance.now();
    const pending = inFlight.current;
    const rtt = pending && pending.id === message.frame_id ? now - pending.sentAt : null;
    if (pending?.id === message.frame_id) inFlight.current = null;
    setError(null);

    const bitmap = bitmaps.current.get(message.frame_id) ?? null;
    for (const [id, b] of bitmaps.current) {
      if (id < message.frame_id) {
        b.close?.();
        bitmaps.current.delete(id);
      }
    }
    bitmaps.current.delete(message.frame_id);

    setResult((prev) => {
      prev?.bitmap?.close?.();
      return { frameId: message.frame_id, width: message.width, height: message.height, detections: message.detections, bitmap, receivedAt: now };
    });

    resultTimes.current = [...resultTimes.current.filter((t) => now - t < 2_000), now];
    const fps = resultTimes.current.length > 1 ? ((resultTimes.current.length - 1) * 1000) / (now - resultTimes.current[0]) : 0;

    // Class appearance events
    const current = new Map<number, string>();
    for (const d of message.detections) current.set(d.class_id, d.class_name);
    const newEvents: LiveEvent[] = [];
    for (const [id, name] of current) if (!previousClasses.current.has(id)) newEvents.push({ id: ++eventId.current, at: Date.now(), classId: id, className: name, kind: "appeared" });
    for (const [id, name] of previousClasses.current) if (!current.has(id)) newEvents.push({ id: ++eventId.current, at: Date.now(), classId: id, className: name, kind: "left" });
    previousClasses.current = current;
    if (newEvents.length) setEvents((prev) => [...newEvents.reverse(), ...prev].slice(0, 25));

    setStats((s) => {
      const latencies = rtt != null ? [...s.latencies, rtt].slice(-40) : s.latencies;
      const classTotals = { ...s.classTotals };
      for (const d of message.detections) classTotals[d.class_name] = (classTotals[d.class_name] ?? 0) + 1;
      return {
        fps,
        avgLatencyMs: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null,
        serverMs: message.server_ms,
        totalObjects: s.totalObjects + message.count,
        framesProcessed: s.framesProcessed + 1,
        dropped: message.dropped,
        latencies,
        classTotals,
        model: message.model,
        device: message.device,
      };
    });
  }, [sendConfig]);

  const connect = useCallback((): Promise<WebSocket> => {
    const existing = socketRef.current;
    if (existing && existing.readyState === WebSocket.OPEN) return Promise.resolve(existing);
    existing?.close();
    intentionalClose.current = false;
    setSocketStatus("connecting");
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl("/api/inference/live"));
      } catch (err) {
        setSocketStatus("closed");
        reject(err);
        return;
      }
      ws.binaryType = "arraybuffer";
      socketRef.current = ws;
      let opened = false;
      ws.onopen = () => {
        opened = true;
        setSocketStatus("open");
        resolve(ws);
      };
      ws.onmessage = handleMessage;
      ws.onerror = () => {
        if (!opened) reject(new Error("Could not connect to the live inference WebSocket. Is the backend running?"));
      };
      ws.onclose = (event) => {
        if (socketRef.current === ws) socketRef.current = null;
        setSocketStatus("closed");
        inFlight.current = null;
        if (!intentionalClose.current && opened) {
          runningRef.current = false;
          setRunning(false);
          setError(
            event.code === 1008
              ? "The backend rejected this origin. Add it to YVS_CORS_ORIGINS."
              : "The live connection was lost. Check the backend and start detection again.",
          );
        }
        if (!opened) reject(new Error(event.code === 1008 ? "The backend rejected this origin (CORS)." : "Could not connect to the live inference WebSocket."));
      };
    });
  }, [handleMessage]);

  // Capture loop
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      raf = requestAnimationFrame(tick);
      const ws = socketRef.current;
      const video = videoRef.current;
      if (!runningRef.current || !ws || ws.readyState !== WebSocket.OPEN || !video || video.readyState < 2) return;
      const now = performance.now();
      if (inFlight.current) {
        if (now - inFlight.current.sentAt < STALL_TIMEOUT_MS) return;
        inFlight.current = null; // drop a stalled frame
      }
      const { targetFps, captureWidth, jpegQuality, keepBitmaps } = captureRef.current;
      if (now - lastSent.current < 1000 / targetFps) return;
      if (ws.bufferedAmount > 0) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;
      const scale = Math.min(1, captureWidth / vw);
      const width = Math.round(vw * scale);
      const height = Math.round(vh * scale);
      const canvas = (canvasRef.current ??= document.createElement("canvas"));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, width, height);
      const id = (frameId.current = (frameId.current + 1) >>> 0);
      lastSent.current = now;
      inFlight.current = { id, sentAt: now };

      try {
        const [blob, bitmap] = await Promise.all([
          new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", jpegQuality)),
          keepBitmaps && typeof createImageBitmap === "function" ? createImageBitmap(canvas) : Promise.resolve(null),
        ]);
        if (!blob || cancelled) {
          bitmap?.close?.();
          inFlight.current = null;
          return;
        }
        if (bitmap) bitmaps.current.set(id, bitmap);
        const payload = new Uint8Array(4 + blob.size);
        new DataView(payload.buffer).setUint32(0, id);
        payload.set(new Uint8Array(await blob.arrayBuffer()), 4);
        if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(payload);
        else inFlight.current = null;
      } catch {
        inFlight.current = null;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [running, videoRef]);

  const startDetection = useCallback(async () => {
    setError(null);
    try {
      await connect();
      runningRef.current = true;
      setRunning(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect to the backend.");
    }
  }, [connect]);

  const pauseDetection = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    inFlight.current = null;
  }, []);

  const disconnect = useCallback(() => {
    pauseDetection();
    intentionalClose.current = true;
    socketRef.current?.close();
    socketRef.current = null;
    setSocketStatus("idle");
    clearBitmaps();
    setResult((prev) => {
      prev?.bitmap?.close?.();
      return null;
    });
    previousClasses.current = new Map();
  }, [pauseDetection]);

  const resetStats = useCallback(() => {
    setStats(EMPTY_STATS);
    setEvents([]);
    resultTimes.current = [];
  }, []);

  useEffect(
    () => () => {
      intentionalClose.current = true;
      socketRef.current?.close();
      clearBitmaps();
    },
    [],
  );

  return { socketStatus, running, error, result, stats, events, startDetection, pauseDetection, disconnect, resetStats, setError };
}
