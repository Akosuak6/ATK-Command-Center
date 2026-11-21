import { useState } from 'react';
import { linkKind, youtubeEmbed } from '../lib/links';

// The cover at the top of a linked item. YouTube covers play the video in place.
export function LinkMedia({ url, cover, title, className = 'dump-cover' }: { url: string; cover?: string; title: string; className?: string }) {
  const [playing, setPlaying] = useState(false);
  const kind = url ? linkKind(url) : { kind: 'other' as const };

  if (kind.kind === 'youtube') {
    if (playing && navigator.onLine) {
      return (
        <span className={`${className} video-frame`}>
          <iframe
            src={youtubeEmbed(kind.id)}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            loading="lazy"
          />
        </span>
      );
    }
    return (
      <button type="button" className={`${className} video-cover`} onClick={() => (navigator.onLine ? setPlaying(true) : window.open(url, '_blank', 'noopener'))} aria-label={`Play ${title}`}>
        {cover ? <img src={cover} alt="" loading="lazy" /> : <span className="video-blank" />}
        <span className="play" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
        </span>
      </button>
    );
  }

  if (!cover) return null;
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className={className} tabIndex={-1} aria-hidden="true">
      <img src={cover} alt="" loading="lazy" />
    </a>
  ) : (
    <span className={className}><img src={cover} alt="" loading="lazy" /></span>
  );
}
