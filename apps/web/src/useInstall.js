import { useEffect, useState } from 'react';

const standalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);
export const isIos = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

// Chrome on Android offers a real install prompt once the page has been open a moment. Safari on iPhone has none, so callers explain Share > Add to Home Screen.
export function useInstall() {
  const [evt, setEvt] = useState(null);
  useEffect(() => {
    const on = (e) => { e.preventDefault(); setEvt(e); };
    const done = () => setEvt(null);
    window.addEventListener('beforeinstallprompt', on);
    window.addEventListener('appinstalled', done);
    return () => { window.removeEventListener('beforeinstallprompt', on); window.removeEventListener('appinstalled', done); };
  }, []);
  async function install() {
    if (!evt) return false;
    evt.prompt();
    await evt.userChoice.catch(() => {});
    setEvt(null);
    return true;
  }
  return { canInstall: !!evt && !standalone(), install, installed: standalone() };
}
