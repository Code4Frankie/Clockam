import { useState } from 'react';
import { isIos, useInstall } from '../useInstall.js';

// "Add ClockAm to your home screen". Android Chrome gives an install prompt; iPhones need the Share menu, so we explain it.
export default function InstallButton() {
  const { canInstall, install, installed } = useInstall();
  const [help, setHelp] = useState(false);
  if (installed || (!canInstall && !isIos())) return null;
  return (
    <div style={{ textAlign: 'center' }}>
      <button type="button" className="btn small ghost" onClick={() => (canInstall ? install() : setHelp((h) => !h))}>Add ClockAm to your home screen</button>
      {help && <p className="muted">Tap the Share button in Safari, then <strong>Add to Home Screen</strong>.</p>}
    </div>
  );
}
