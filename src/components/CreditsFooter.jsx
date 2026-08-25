import { useEffect, useRef } from 'react';

const CREDITS_SCRIPT_URL = 'https://lab.oblicua.co/credits/credits.js';
const CREDITS_COLOR = '#1d4ed8';
const CREDITS_REFERENCE = 'PapeleriaCartagena';

function insertCredits(container) {
  if (!container || typeof window.setCredits !== 'function') return;
  window.setCredits(CREDITS_COLOR, CREDITS_REFERENCE);
  const inserted = document.body.lastElementChild;
  if (inserted?.classList.contains('bhrcredits')) {
    container.appendChild(inserted);
  }
}

export default function CreditsFooter() {
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (!cancelled) insertCredits(containerRef.current);
    };

    if (typeof window.setCredits === 'function') {
      run();
    } else {
      const script = document.createElement('script');
      script.src = CREDITS_SCRIPT_URL;
      script.async = true;
      script.onload = run;
      document.body.appendChild(script);
    }

    return () => {
      cancelled = true;
      containerRef.current?.replaceChildren();
    };
  }, []);

  return <div ref={containerRef} />;
}
