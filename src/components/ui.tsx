import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { IconCheck, IconClose, IconPencil } from './Icons';
import type { Area } from '../lib/types';

export function Stars({ value, onPick, label, small }: { value: number; onPick: (n: number) => void; label: string; small?: boolean }) {
  return (
    <div className={`stars${small ? ' small' : ''}`} role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`star${n <= value ? ' on' : ''}`}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          aria-pressed={n <= value}
          onClick={() => onPick(n === value ? 0 : n)}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function StarText({ value }: { value: number }) {
  return (
    <span className="star-text" aria-label={value ? `${value} of 5 stars` : 'Not rated'}>
      <span className="on" aria-hidden="true">{'★★★★★'.slice(0, value)}</span>
      <span className="off" aria-hidden="true">{value ? '★★★★★'.slice(value) : ''}</span>
    </span>
  );
}

export function Chips<T extends string | number>({
  options, value, onChange, label, large
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string; large?: boolean }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" className={`chip${large ? ' chip-lg' : ''}`} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Bar({ value, warn }: { value: number; warn?: boolean }) {
  return (
    <span className="track" role="presentation">
      <span className={`fill${warn ? ' warn' : ''}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </span>
  );
}

const AREA_CLASS: Record<string, string> = {
  Work: 't-work', Health: 't-health', Money: 't-money', Social: 't-social', Learning: 't-learn', Experiences: 't-social', Other: 't-plain'
};
export const areaClass = (a: Area | string) => `tag ${AREA_CLASS[a] ?? 't-plain'}`;

export function Checkbox({ on }: { on: boolean }) {
  return <span className={`box${on ? ' on' : ''}`} aria-hidden="true">{on && <IconCheck />}</span>;
}

export function EditButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className="btn-text" onClick={onClick} aria-label={label}>
      <IconPencil size={14} /> Edit
    </button>
  );
}

export function Sheet({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
    >
      {open && (
        <div className="sheet-inner">
          <div className="sheet-head">
            <h2 className="h2">{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <IconClose />
            </button>
          </div>
          <div className="sheet-body">{children}</div>
        </div>
      )}
    </dialog>
  );
}

// Toast
const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(''), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div aria-live="polite" className="sr-live">
        {msg && <div className="toast" role="status">{msg}</div>}
      </div>
    </ToastCtx.Provider>
  );
}

export function useNow(intervalMs = 15000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function FileButton({ label, accept, onFile, className = 'btn2' }: { label: string; accept: string; onFile: (f: File) => void; className?: string }) {
  return (
    <label className={`${className} file-btn`}>
      {label}
      <input
        type="file"
        accept={accept}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </label>
  );
}

export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// Resize a photo to about 640px wide JPEG before storing it.
export async function resizeBlob(blob: Blob, maxWidth = 640, quality = 0.78): Promise<string> {
  if (!blob.type.startsWith('image/') && blob.type !== '') throw new Error('That file is not an image');
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not read that image'));
      img.src = url;
    });
    const scale = Math.min(1, maxWidth / img.naturalWidth);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('Could not read that image');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const resizePhoto = (file: File, maxWidth = 640, quality = 0.78) => resizeBlob(file, maxWidth, quality);

export async function openDataUrl(dataUrl: string) {
  const blob = await (await fetch(dataUrl)).blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
