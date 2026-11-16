import React, { useState } from 'react';

type SafeImgProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src?: string | null; alt: string };

function initials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.slice(0, 2) || '?').toUpperCase();
}

/**
 * <img> that never renders an empty src (which makes the browser refetch the page and logs a
 * warning). Missing or broken images fall back to an initials tile with the same size classes.
 */
export function SafeImg({ src, alt, className = '', onError, ...rest }: SafeImgProps) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) {
    return (
      <span
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        className={`${className} inline-flex items-center justify-center bg-slate-200 text-[0.6rem] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-100`}
      >
        {initials(alt || '')}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={(e) => {
        setFailed(src);
        onError?.(e);
      }}
      {...rest}
    />
  );
}
