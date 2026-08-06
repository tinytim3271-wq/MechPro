import { useCallback, useEffect, useRef, useState } from "react";

export type FacingMode = "user" | "environment";

export function useCamera(
  options: { facingMode?: FacingMode; width?: number; height?: number } = {},
) {
  const { facingMode = "environment", width = 1280, height = 720 } = options;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDenied, setIsDenied] = useState(false);
  const [currentFacingMode, setCurrentFacingMode] = useState<FacingMode>(facingMode);

  const isSupported =
    typeof navigator !== "undefined" &&
    "mediaDevices" in navigator &&
    "getUserMedia" in navigator.mediaDevices;

  const stop = useCallback(() => {
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
    if (videoRef.current) videoRef.current.srcObject = null;
  }, [stream]);

  const start = useCallback(async () => {
    if (!isSupported) return setError("Camera not supported on this device");
    setIsLoading(true);
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: currentFacingMode,
          width: { ideal: width },
          height: { ideal: height },
        },
        audio: false,
      });
      setStream(mediaStream);
      setIsDenied(false);
      if (videoRef.current) videoRef.current.srcObject = mediaStream;
    } catch (err) {
      const name = (err as Error).name;
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setIsDenied(true);
        setError("Camera permission denied. Enable it in browser settings.");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setError("No camera found on this device.");
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        setError("Camera is already in use by another application.");
      } else {
        setError("Failed to access camera.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, currentFacingMode, width, height]);

  const switchCamera = useCallback(() => {
    stop();
    setCurrentFacingMode((m) => (m === "user" ? "environment" : "user"));
  }, [stop]);

  // Restart when facing mode changes
  useEffect(() => {
    if (stream) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFacingMode]);

  // Capture current frame as a JPEG data URL
  const capturePhoto = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || !stream) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.9);
  }, [stream]);

  // Cleanup on unmount
  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);

  return {
    videoRef,
    stream,
    isLoading,
    error,
    isSupported,
    isDenied,
    start,
    stop,
    switchCamera,
    capturePhoto,
    currentFacingMode,
  };
}
