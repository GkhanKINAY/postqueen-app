import { IsOptional, IsString, IsIn, IsUrl, ValidateIf } from 'class-validator';

export class GmbSettingsDto {
  @IsOptional()
  @IsIn(['STANDARD', 'EVENT', 'OFFER'])
  topicType?: 'STANDARD' | 'EVENT' | 'OFFER';

  // GET_OFFER stays accepted so posts stored with it still validate; Google
  // deprecated it, the composer no longer offers it, and the provider sends
  // it as LEARN_MORE.
  @IsOptional()
  @IsIn([
    'NONE',
    'BOOK',
    'ORDER',
    'SHOP',
    'LEARN_MORE',
    'SIGN_UP',
    'GET_OFFER',
    'CALL',
  ])
  callToActionType?:
    | 'NONE'
    | 'BOOK'
    | 'ORDER'
    | 'SHOP'
    | 'LEARN_MORE'
    | 'SIGN_UP'
    | 'GET_OFFER'
    | 'CALL';

  // Not checked on an offer, which sends no button: the composer hides the
  // field there, so a link left from another post type cannot block a save.
  @IsOptional()
  @ValidateIf((o) => o.callToActionType && o.topicType !== 'OFFER')
  @IsUrl()
  callToActionUrl?: string;

  // Event-specific fields
  @IsOptional()
  @ValidateIf((o) => o.topicType === 'EVENT')
  @IsString()
  eventTitle?: string;

  @IsOptional()
  @IsString()
  eventStartDate?: string;

  @IsOptional()
  @IsString()
  eventEndDate?: string;

  @IsOptional()
  @IsString()
  eventStartTime?: string;

  @IsOptional()
  @IsString()
  eventEndTime?: string;

  // Offer-specific fields
  @IsOptional()
  @IsString()
  offerCouponCode?: string;

  @IsOptional()
  @ValidateIf((o) => o.offerRedeemUrl)
  @IsUrl()
  offerRedeemUrl?: string;

  @IsOptional()
  @IsString()
  offerTerms?: string;
}
