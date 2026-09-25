/**
 * Whether channel OAuth tokens are stored encrypted. Unset is on.
 *
 * "false" stores new tokens as issued, and the boot sync
 * (IntegrationService.onModuleInit) writes the stored ones back the same way.
 * It is the step before running an image older than the encryption, which
 * cannot read the encrypted format. Reads decrypt either way.
 */
export const isIntegrationTokenEncryptionEnabled = () =>
  process.env.ENCRYPT_INTEGRATION_TOKENS !== 'false';
