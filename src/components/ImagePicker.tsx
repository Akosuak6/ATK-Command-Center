import { useState, type ClipboardEvent } from 'react';
import { resizeBlob } from './ui';

// Turns whatever was pasted or picked into something we can store:
// a resized JPEG data URL when possible, otherwise the image URL itself.
export async function imageFromUrl(url: string, maxWidth = 640): Promise<string> {
  // Prove it is an image first. <img> works across sites even when fetch is blocked.
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('not-image'));
    img.src = url;
  });
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error('fetch');
    return await resizeBlob(await res.blob(), maxWidth);
  } catch {
    return url; // The site does not allow copying; keep the link (shows when online).
  }
}

const looksLikeUrl = (t: string) => /^https?:\/\/\S+$/i.test(t.trim());

interface Props {
  value?: string;
  onChange: (src: string | undefined) => void;
  label?: string;
  maxWidth?: number;
  id: string;
}

export function ImagePicker({ value, onChange, label = 'Photo or logo', maxWidth = 640, id }: Props) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<string | undefined>) => {
    setBusy(true);
    setMsg('');
    try {
      const src = await fn();
      if (src) onChange(src);
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      setMsg(m === 'not-image'
        ? 'That link opens a page, not an image. Press and hold the image itself, tap Copy, then paste here.'
        : m || 'That could not be used as a photo.');
    } finally {
      setBusy(false);
    }
  };

  const fromBlob = (b: Blob) => run(() => resizeBlob(b, maxWidth));
  const fromText = (t: string) => {
    if (!looksLikeUrl(t)) { setMsg('Paste an image, or a link that ends in an image.'); return; }
    void run(() => imageFromUrl(t.trim(), maxWidth));
  };

  // Paste button: reads the clipboard directly. On iPhone, Safari shows a small Paste bubble to confirm.
  const pasteButton = () => run(async () => {
    const clip = navigator.clipboard as Clipboard | undefined;
    if (clip && 'read' in clip) {
      try {
        const items = await clip.read();
        for (const item of items) {
          const type = item.types.find((t) => t.startsWith('image/'));
          if (type) return resizeBlob(await item.getType(type), maxWidth);
        }
        for (const item of items) {
          if (item.types.includes('text/plain')) {
            const t = await (await item.getType('text/plain')).text();
            if (looksLikeUrl(t)) return imageFromUrl(t.trim(), maxWidth);
          }
        }
        throw new Error('Nothing to paste yet. Copy a photo or an image link first.');
      } catch (e) {
        if (e instanceof Error && e.message.startsWith('Nothing')) throw e;
        if (e instanceof Error && e.message === 'not-image') throw e;
      }
    }
    throw new Error('Press and hold the box below, then tap Paste.');
  });

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.clipboardData.items).filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile()).filter(Boolean) as File[];
    if (files[0]) { void fromBlob(files[0]); return; }
    fromText(e.clipboardData.getData('text/plain'));
    (e.target as HTMLDivElement).textContent = '';
  };

  return (
    <div className="stack-s img-picker" role="group" aria-labelledby={`${id}-lbl`}>
      <span className="lbl" id={`${id}-lbl`}>{label}</span>
      {value && (
        <div className="img-preview">
          <img src={value} alt="Chosen" />
          <button type="button" className="btn-text btn-danger" onClick={() => onChange(undefined)}>Remove</button>
        </div>
      )}
      <div className="img-actions">
        <button type="button" className="btn2" onClick={() => void pasteButton()} disabled={busy}>Paste</button>
        <label className="btn2 file-btn">
          Choose from Photos
          <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) void fromBlob(f); e.target.value = ''; }} />
        </label>
      </div>
      <div
        className="paste-zone"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Paste a photo or image link here"
        data-placeholder="Or press and hold here, then Paste"
        onPaste={onPaste}
        onInput={(e) => {
          const t = (e.target as HTMLDivElement).textContent ?? '';
          if (looksLikeUrl(t)) { (e.target as HTMLDivElement).textContent = ''; fromText(t); }
        }}
      />
      {busy && <span className="sub">Adding photo</span>}
      {msg && <span className="sub" role="status">{msg}</span>}
    </div>
  );
}
