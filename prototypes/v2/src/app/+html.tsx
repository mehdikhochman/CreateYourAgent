import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * HTML shell of the web version (web only). Makes the app installable from
 * the browser: « Ajouter à l’écran d’accueil » on iPhone and Android.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>CréeTonAgent</title>
        <meta name="description" content="Votre assistant WhatsApp qui répond à vos clients 24h/24." />
        <meta name="theme-color" content="#F77F00" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="CréeTonAgent" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: 'body{background-color:#FFFFFF;overscroll-behavior:none}' }} />
        <script dangerouslySetInnerHTML={{ __html: REGISTER_SERVICE_WORKER }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

// The service worker keeps the last visited screens available without network.
const REGISTER_SERVICE_WORKER = `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  });
}`;
