// The screen shown while the app loads, and while a new device downloads its data the first time.
export function Boot({ message }: { message?: string }) {
  return (
    <div className="boot" role="status" aria-live="polite">
      <span className="brand-name">Akosua's</span>
      <span className="brand-script">command center</span>
      {message && <span className="sub boot-msg">{message}</span>}
    </div>
  );
}
