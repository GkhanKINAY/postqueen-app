'use client';

import { createContext, FC, ReactNode, useContext, useEffect } from 'react';
interface VariableContextInterface {
  stripeClient: string;
  billingEnabled: boolean;
  passwordlessLogin: boolean;
  turnstileSiteKey: string;
  isChatBase: boolean;
  /** Chatbase bot this deployment owns; the SSO token is signed against it. */
  chatbaseBotId: string;
  /** Store listing for this deployment's own browser extension build. */
  extensionStoreUrl: string;
  isGeneral: boolean;
  genericOauth: boolean;
  oauthLogoUrl: string;
  oauthDisplayName: string;
  mcpUrl?: string;
  cloudflareUrl: string;
  mainUrl: string;
  frontEndUrl: string;
  /**
   * Where this deployment publishes its Terms and Privacy pages. Separate
   * from frontEndUrl because the app and the marketing site can live on
   * different hosts; falls back to frontEndUrl when unset.
   */
  legalUrl: string;
  /**
   * Affiliate programme of whoever runs this install. Read here rather than
   * from process.env in the menu: NEXT_PUBLIC_* is inlined when the image is
   * built, so a client component could never see a runtime value.
   */
  affiliateUrl: string;
  plontoKey: string;
  storageProvider: 'local' | 'cloudflare';
  backendUrl: string;
  environment: string;
  uploadDirectory: string;
  facebookPixel: string;
  telegramBotName: string;
  neynarClientId: string;
  isSecured: boolean;
  disableImageCompression: boolean;
  disableXAnalytics: boolean;
  language: string;
  dub: boolean;
  transloadit: string[];
  sentryDsn: string;
  extensionId: string;
  googleAdsId?: string;
  googleAdsTrialTracking?: string;
}
const VariableContext = createContext({
  stripeClient: '',
  billingEnabled: false,
  passwordlessLogin: false,
  turnstileSiteKey: '',
  isGeneral: true,
  genericOauth: false,
  isChatBase: false,
  chatbaseBotId: '',
  extensionStoreUrl: '',
  oauthLogoUrl: '',
  googleAdsId: '',
  googleAdsTrialTracking: '',
  oauthDisplayName: '',
  mcpUrl: '',
  cloudflareUrl: '',
  mainUrl: '',
  frontEndUrl: '',
  legalUrl: '',
  affiliateUrl: '',
  storageProvider: 'local',
  plontoKey: '',
  backendUrl: '',
  uploadDirectory: '',
  isSecured: false,
  telegramBotName: '',
  facebookPixel: '',
  neynarClientId: '',
  disableImageCompression: false,
  disableXAnalytics: false,
  language: '',
  dub: false,
  transloadit: [],
  sentryDsn: '',
  extensionId: '',
} as VariableContextInterface);
export const VariableContextComponent: FC<
  VariableContextInterface & {
    children: ReactNode;
  }
> = (props) => {
  const { children, ...otherProps } = props;
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // @ts-ignore
      window.vars = otherProps;
    }
  }, []);
  return (
    <VariableContext.Provider value={otherProps}>
      {children}
    </VariableContext.Provider>
  );
};
export const useVariables = () => {
  return useContext(VariableContext);
};
export const loadVars = () => {
  // @ts-ignore
  return window.vars as VariableContextInterface;
};
