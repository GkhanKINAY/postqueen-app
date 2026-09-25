export interface NewsletterInterface {
  name: string;
  register(email: string): Promise<void>;
  // Only a provider that keeps each address's choice can offer the Settings
  // switch, and follow an address change or a deleted account.
  subscribed?(email: string): Promise<boolean>;
  setSubscribed?(email: string, on: boolean): Promise<void>;
  remove?(email: string): Promise<void>;
}
