'use client';

import Script from 'next/script';
import { useVariables } from '@gitroom/react/helpers/variable.context';

export const FacebookComponent = () => {
  // From context, not process.env: this is a client component, so NEXT_PUBLIC_*
  // is inlined when the image is built and is undefined in every published
  // build. The pixel therefore never loaded for anyone, including us.
  const { facebookPixel } = useVariables();

  if (!facebookPixel) {
    return null;
  }
  return (
    <Script strategy="afterInteractive" id="fb-pixel">
      {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'/f.js');
fbq('init', '${facebookPixel}');
`}
    </Script>
  );
};
