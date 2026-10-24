import { useCallback, useEffect, useRef, useState } from "react";

export type CameraStatus = "off" | "requesting" | "ready" | "error";

export function describeCameraError(error: unknown): string {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Camera permission was denied. Allow camera access for this site in your browser settings, then try again.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No camera was found. Connect a camera and try again.";
    case "NotReadableError":
    case "TrackStartError":
      return "The camera is already in use by another application or could not be started.";
    case "OverconstrainedError":
      return "The selected camera does not support the requested settings. Try another camera.";
    case "SecurityError":
      return "Camera access is blocked. Browsers only allow it on HTTPS pages or on localhost.";
    case "AbortError":
      return "Starting the camera was interrupted. Please try again.";
    default:
      return error instanceof Error && error.message ? error.message : "The camera could not be started.";
  }
}

export function cameraSupported(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

/** Camera lifecycle: permission is only requested when ``start`` is called. */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("off");
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [resolution, setResolution] = useState<{ width: number; height: number } | null>(null);

  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setResolution(null);
  }, []);

  const start = useCallback(
    async (requestedDevice?: string | null) => {
      if (!cameraSupported()) {
        setStatus("error");
        setError(
          window.isSecureContext === false
            ? "Camera access requires a secure context. Open the app over HTTPS or on localhost."
            : "This browser does not support camera access (MediaDevices API).",
        );
        return;
      }
      release();
      setStatus("requesting");
      setError(null);
      try {
        const target = requestedDevice ?? deviceId;
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            ...(target ? { deviceId: { exact: target } } : { facingMode: "user" }),
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
        });
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        track.onended = () => {
          release();
          setStatus("error");
          setError("The camera was disconnected or stopped by the system.");
        };
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
          setResolution({ width: video.videoWidth || track.getSettings().width || 0, height: video.videoHeight || track.getSettings().height || 0 });
        }
        setDeviceId(track.getSettings().deviceId ?? target ?? null);
        try {
          const all = await navigator.mediaDevices.enumerateDevices();
          setDevices(all.filter((d) => d.kind === "videoinput"));
        } catch {
          setDevices([]);
        }
        setStatus("ready");
      } catch (err) {
        release();
        setStatus("error");
        setError(describeCameraError(err));
      }
    },
    [deviceId, release],
  );

  const stop = useCallback(() => {
    release();
    setStatus("off");
    setError(null);
  }, [release]);

  useEffect(() => release, [release]);

  return { videoRef, status, error, devices, deviceId, resolution, setResolution, start, stop };
}
