import { useEffect, useState } from "react";
import { loadAudio } from "../audioDb";

export function AudioPlay({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let alive = true;
    void loadAudio(id).then((blob) => {
      if (!alive) return;
      if (blob) {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      }
      setReady(true);
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  if (!ready) return null;
  if (!url) return <p className="ocr">No audio on this Mac — transcript only.</p>;
  return <audio className="voice-player" controls preload="metadata" src={url} />;
}
