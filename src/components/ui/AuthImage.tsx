import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';

/** Shows an image from an authenticated /api URL (fetched with the user's token, shown as a blob URL). */
export function AuthImage({ path, alt, className = '' }: { path: string; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    setFailed(false);
    apiFetch(path)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((b) => {
        if (cancelled) return;
        url = URL.createObjectURL(b);
        setSrc(url);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [path]);
  if (failed) return <p className="text-sm text-rose-700">Could not load the image.</p>;
  if (!src) return <div className={`animate-pulse rounded-xl bg-slate-800 ${className}`} aria-label="Loading image" />;
  return <img src={src} alt={alt} className={className} />;
}
