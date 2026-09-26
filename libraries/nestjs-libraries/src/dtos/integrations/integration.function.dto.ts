import { IsDefined, IsIn, IsString } from 'class-validator';

/**
 * The provider methods the app calls by name, through `/integrations/function`
 * and `/integrations/mentions`: the lists and lookups the post settings load
 * (boards, channels, subreddits, a TikTok creator's limits, ...). The route
 * calls the method named in the request and answers with whatever it
 * returns, so nothing else on a provider may be reachable this way. A new
 * lookup a settings component calls goes on this list.
 */
export const CALLABLE_PROVIDER_FUNCTIONS = [
  'audioSearch',
  'boards',
  'categoriesList',
  'channels',
  'companies',
  'company',
  'creatorInfo',
  'experiences',
  'groups',
  'label',
  'list',
  'locationSearch',
  'mention',
  'musicSearch',
  'organizations',
  'pages',
  'postTypes',
  'publications',
  'restrictions',
  'subreddits',
  'subscriptionInfo',
  'tags',
  'tagsList',
  'teams',
  'templates',
];

export class IntegrationFunctionDto {
  @IsString()
  @IsDefined()
  @IsIn(CALLABLE_PROVIDER_FUNCTIONS)
  name: string;

  @IsString()
  @IsDefined()
  id: string;

  data: any;
}
