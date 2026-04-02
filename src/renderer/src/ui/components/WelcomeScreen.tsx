interface WelcomeScreenProps {
  appVersion: string;
  onStartFresh: () => void;
  onRestore: () => void;
}

export function WelcomeScreen({ appVersion, onStartFresh, onRestore }: WelcomeScreenProps) {
  return (
    <div className="welcome-backdrop" data-testid="welcome-screen">
      <div className="welcome-dialog" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <p className="welcome-dialog__eyebrow">OpenInventory</p>
        <h1 id="welcome-title" className="welcome-dialog__title">Get Started</h1>
        <p className="welcome-dialog__version">v{appVersion}</p>
        <p className="welcome-dialog__body">
          Start with a fresh workspace or restore your data from an existing backup.
        </p>
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
