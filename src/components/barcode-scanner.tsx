"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeIsbn } from "@/lib/isbn";

// Scanner EAN-13 (ADR-0007): API nativa dove c'è (Chrome Android), altrimenti zxing-wasm servito
// da /vendor (iPhone Safari). Serve HTTPS (o localhost) per accedere alla fotocamera.

const SCAN_INTERVAL_MS = 150;
const FORMATS = ["ean_13", "ean_8", "upc_a"] as const;

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

async function createDetector(): Promise<Detector> {
  const native = (globalThis as { BarcodeDetector?: { new (options: { formats: readonly string[] }): Detector; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector;
  if (native && (await native.getSupportedFormats()).includes("ean_13")) {
    return new native({ formats: FORMATS });
  }
  const { BarcodeDetector, prepareZXingModule } = await import("barcode-detector/ponyfill");
  prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? `/vendor/${path}` : prefix + path) },
  });
  return new BarcodeDetector({ formats: [...FORMATS] });
}

function cameraErrorMessage(error: unknown): string {
  if (!window.isSecureContext) return "La fotocamera funziona solo su HTTPS. Inserisci l'ISBN a mano.";
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Accesso alla fotocamera negato. Consentilo nelle impostazioni del browser oppure inserisci l'ISBN a mano.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") return "Nessuna fotocamera trovata.";
  return "Non riesco ad avviare la fotocamera. Inserisci l'ISBN a mano.";
}

export function BarcodeScanner({ onDetected }: { onDetected: (isbn13: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);
  const [status, setStatus] = useState<"starting" | "scanning" | "error">("starting");
  const [error, setError] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const stopStream = () => stream?.getTracks().forEach((track) => track.stop());

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("getUserMedia non disponibile");
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        const video = videoRef.current;
        // Smontato durante l'avvio (es. "Chiudi la fotocamera" mentre chiede il permesso): spegni subito.
        if (cancelled || !video) return stopStream();
        video.srcObject = stream;
        await video.play();
        const detector = await createDetector();
        if (cancelled) return;
        setStatus("scanning");

        const tick = async () => {
          if (cancelled) return;
          try {
            if (video.readyState >= 2) {
              for (const code of await detector.detect(video)) {
                const isbn = normalizeIsbn(code.rawValue);
                if (isbn) {
                  navigator.vibrate?.(60);
                  onDetectedRef.current(isbn);
                  return;
                }
              }
            }
          } catch {
            // Un fotogramma illeggibile non è un errore: si riprova al prossimo.
          }
          timer = setTimeout(tick, SCAN_INTERVAL_MS);
        };
        void tick();
      } catch (caught) {
        if (cancelled) return stopStream();
        setStatus("error");
        setError(cameraErrorMessage(caught));
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
    <div className="relative overflow-hidden rounded-[var(--radius-lg)] bg-black shadow-[var(--shadow-float)]">
      <video ref={videoRef} playsInline muted autoPlay className="aspect-[4/3] w-full object-cover" aria-label="Inquadratura della fotocamera" />
      {status === "scanning" && (
        <div aria-hidden className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-[12px] border-2 border-white/80 shadow-[0_0_0_999px_rgb(0_0_0/35%)]" />
      )}
      <p role="status" aria-live="polite" className="absolute inset-x-0 bottom-0 bg-black/60 px-4 py-2.5 text-center text-[14px] text-white">
        {status === "starting" && "Avvio della fotocamera…"}
        {status === "scanning" && "Inquadra il codice a barre sul retro del libro"}
        {status === "error" && error}
      </p>
    </div>
  );
}
