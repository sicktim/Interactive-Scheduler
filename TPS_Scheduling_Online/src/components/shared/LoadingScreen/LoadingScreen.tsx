import './LoadingScreen.css';

interface LoadingScreenProps {
  progress?: string;
}

export function LoadingScreen({ progress }: LoadingScreenProps) {
  return (
    <div className="loading-screen">
      <div className="spinner" style={{ width: 40, height: 40, borderWidth: 4 }} />
      <div className="loading-text">{progress || 'Loading...'}</div>
    </div>
  );
}
