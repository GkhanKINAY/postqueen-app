import {
  ThirdParty,
  ThirdPartyAbstract,
} from '@gitroom/nestjs-libraries/3rdparties/thirdparty.interface';
import { hubspotInstallUrl } from '@gitroom/nestjs-libraries/chat/oauth-types';

@ThirdParty({
  identifier: 'hubspot',
  title: 'HubSpot',
  description:
    'HubSpot agents write your posts, and PostQueen schedules and publishes them.',
  fields: [],
  installUrl: hubspotInstallUrl,
})
export class HubspotProvider extends ThirdPartyAbstract {
  // Installed in HubSpot through installUrl, never connected with an API key
  async checkConnection(): Promise<false> {
    return false;
  }

  async sendData(): Promise<string> {
    throw new Error('HubSpot provider does not support sendData');
  }
}
