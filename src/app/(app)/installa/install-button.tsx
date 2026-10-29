"use client";

import { useEffect, useState } from "react";
import { Button, Notice } from "@/components/ui";

// Android/Chrome offre l'evento beforeinstallprompt; Safari su iPhone no (lì valgono le istruzioni).
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallButton() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const update = () => setIsInstalled(standalone.matches);
    update();
    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handlePrompt);
    standalone.addEventListener("change", update);
    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      standalone.removeEventListener("change", update);
    };
  }, []);

  if (isInstalled) return <Notice tone="success">Stai già usando l&apos;app installata.</Notice>;
  if (!promptEvent) return null;

  return (
    <Button
      className="w-full"
      onClick={async () => {
        await promptEvent.prompt();
        await promptEvent.userChoice;
        setPromptEvent(null);
      }}
    >
      Installa HOME LIBRARY
    </Button>
  );
}
