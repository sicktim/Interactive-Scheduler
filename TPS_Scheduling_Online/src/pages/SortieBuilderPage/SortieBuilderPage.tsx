export default function SortieBuilderPage() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh', gap: 16,
    }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-heading)' }}>
        Sortie Builder
      </h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Coming Soon</p>
      <a href="/scheduler" style={{ color: '#3b82f6', fontSize: '0.75rem' }}>&larr; Back to Scheduler</a>
    </div>
  );
}
