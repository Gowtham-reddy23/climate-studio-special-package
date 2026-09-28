import { useEffect, useState } from "react";
import { loadBlob } from "../blobDb";

export function ImagePlay({ id, fallback }: { id?: string; fallback?: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let objectUrl: string | null = null;
    let alive = true;
    void loadBlob(id).then((blob) => {
      if (!alive || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  const src = url ?? (fallback?.startsWith("data:") || fallback?.startsWith("blob:") ? fallback : null);
  if (!src) return null;
  return <img className="shot" src={src} alt="" />;
}
