import { useEffect, useRef, useState } from "react";
import { normalizeIsbn } from "./isbn";

// Versione ridotta dello scanner della v1 (ADR-0007): API nativa dove c'è, altrimenti zxing-wasm da /vendor.

const SCAN_INTERVAL_MS = 150;
const FORMATS = ["ean_13", "ean_8", "upc_a"] as const;

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

async function createDetector(): Promise<Detector> {
  const native = (globalThis as { BarcodeDetector?: { new (options: { formats: readonly string[] }): Detector; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector;
  if (native && (await native.getSupportedFormats()).includes("ean_13")) return new native({ formats: FORMATS });
  const { BarcodeDetector, prepareZXingModule } = await import("barcode-detector/ponyfill");
  prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? `/vendor/${path}` : prefix + path) },
  });
  return new BarcodeDetector({ formats: [...FORMATS] });
}

interface ScannerProps {
  onDetected: (isbn13: string) => void;
}

export function Scanner({ onDetected }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);
  const [status, setStatus] = useState("Avvio della fotocamera…");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const stopStream = () => stream?.getTracks().forEach((track) => track.stop());

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        const video = videoRef.current;
        if (cancelled || !video) return stopStream();
        video.srcObject = stream;
        await video.play();
        const detector = await createDetector();
        if (cancelled) return;
        setStatus("Inquadra il codice a barre sul retro del libro");
        const tick = async () => {
          if (cancelled) return;
          try {
            for (const code of await detector.detect(video)) {
              const isbn = normalizeIsbn(code.rawValue);
              if (isbn) return onDetectedRef.current(isbn);
            }
          } catch {
            // Fotogramma illeggibile: si riprova.
          }
          timer = setTimeout(tick, SCAN_INTERVAL_MS);
        };
        void tick();
      } catch (error) {
        if (!cancelled) setStatus(`Fotocamera non disponibile: ${error instanceof Error ? error.message : "errore"}`);
      }
    }

    void start();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      stopStream();
    };
  }, []);

  return (
    <div>
      <video ref={videoRef} playsInline muted autoPlay aria-label="Inquadratura della fotocamera" />
      <p role="status" className="muted">{status}</p>
    </div>
  );
}
