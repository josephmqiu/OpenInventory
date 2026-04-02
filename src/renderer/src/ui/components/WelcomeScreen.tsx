interface WelcomeScreenProps {
  appVersion: string;
  onStartFresh: () => void;
  onRestore: () => void;
}

export function WelcomeScreen({ appVersion, onStartFresh, onRestore }: WelcomeScreenProps) {
  return (
    <div className="welcome-backdrop">
      <div className="welcome-dialog">
        <h1 className="welcome-dialog__title">OPENINVENTORY</h1>
        <p className="welcome-dialog__version">v{appVersion}</p>
        <div className="welcome-dialog__actions">
          <button
            className="button-secondary welcome-dialog__btn"
            onClick={onStartFresh}
            type="button"
          >
            Start Fresh
          </button>
          <button
            className="button-secondary welcome-dialog__btn"
            onClick={onRestore}
            type="button"
          >
            Restore from Backup
          </button>
        </div>
      </div>
    </div>
  );
}
