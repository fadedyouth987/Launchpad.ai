import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';

/** Plays audio or video from an authenticated /api URL (fetched with the user's token as a blob URL). */
export function AuthMedia({
  path,
  kind,
  className = '',
  autoPlay = false,
  downloadName,
}: {
  path: string;
  kind: 'audio' | 'video';
  className?: string;
  autoPlay?: boolean;
  downloadName?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // Videos can be tens of MB each: fetch one only when asked to (audio clips are small, load at once).
  const [requested, setRequested] = useState(kind === 'audio' || autoPlay);
  useEffect(() => setRequested(kind === 'audio' || autoPlay), [path, kind, autoPlay]);
  useEffect(() => {
    if (!requested) return;
    let url: string | null = null;
    let cancelled = false;
    setFailed(false);
    setSrc(null);
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
  }, [path, requested]);
  if (failed) return <p className="text-sm text-rose-700 dark:text-rose-300">Could not load the {kind}.</p>;
  if (!requested)
    return (
      <button
        type="button"
        onClick={() => setRequested(true)}
        className={`flex items-center justify-center rounded-xl bg-surface-muted hover:bg-line-strong text-sm font-semibold text-ink h-24 ${className}`}
      >
        ▶ Load video
      </button>
    );
  if (!src)
    return (
      <div role="status" className={`animate-pulse rounded-xl bg-surface-muted h-10 ${className}`}>
        <span className="sr-only">Loading {kind}…</span>
      </div>
    );
  return (
    <div className="space-y-1">
      {kind === 'video' ? (
        // A video is only fetched after someone asked for it, so it starts playing once it arrives.
        <video src={src} controls autoPlay playsInline className={className} />
      ) : (
        <audio src={src} controls autoPlay={autoPlay} className={className} />
      )}
      {downloadName && (
        <a
          href={src}
          download={downloadName}
          className="text-2xs text-indigo-700 dark:text-indigo-300 hover:text-indigo-800 dark:hover:text-indigo-200"
        >
          Download
        </a>
      )}
    </div>
  );
}
