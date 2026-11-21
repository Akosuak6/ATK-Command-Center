export function WorkSoon() {
  return (
    <section className="card" aria-labelledby="work-h" style={{ alignItems: 'flex-start', padding: 32 }}>
      <span className="tag t-plain">Coming soon</span>
      <h2 className="h2" id="work-h" style={{ fontSize: 30 }}>This page opens when you start</h2>
      <p className="body" style={{ fontSize: 15, lineHeight: 1.6, maxWidth: 560 }}>
        Once you begin the new role, we will decide together what belongs here, such as weekly priorities, 1:1 notes, wins for reviews and learning goals.
      </p>
    </section>
  );
}
