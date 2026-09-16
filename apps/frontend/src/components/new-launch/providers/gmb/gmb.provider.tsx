'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { GmbSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/gmb.settings.dto';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { Input } from '@gitroom/react/form/input';
import { FormChoice } from '@gitroom/react/form/form.choice';
import { FormSection } from '@gitroom/react/form/form.section';
import { useWatch } from 'react-hook-form';

const topicTypes = [
  {
    label: 'Standard Update',
    value: 'STANDARD',
  },
  {
    label: 'Event',
    value: 'EVENT',
  },
  {
    label: 'Offer',
    value: 'OFFER',
  },
];

const callToActionTypes = [
  {
    label: 'None',
    value: 'NONE',
  },
  {
    label: 'Book',
    value: 'BOOK',
  },
  {
    label: 'Order Online',
    value: 'ORDER',
  },
  {
    label: 'Shop',
    value: 'SHOP',
  },
  {
    label: 'Learn More',
    value: 'LEARN_MORE',
  },
  {
    label: 'Sign Up',
    value: 'SIGN_UP',
  },
  {
    label: 'Get Offer',
    value: 'GET_OFFER',
  },
  {
    label: 'Call',
    value: 'CALL',
  },
];

const GmbSettings: FC = () => {
  const { register, control } = useSettings();
  const topicType = useWatch({ control, name: 'topicType' });
  const callToActionType = useWatch({ control, name: 'callToActionType' });

  return (
    <div className="flex flex-col gap-[16px]">
      <FormChoice
        name="topicType"
        icon="type"
        label="Post Type"
        layout="segment"
        defaultValue="STANDARD"
        options={topicTypes}
      />

      <FormChoice
        name="callToActionType"
        icon="post"
        label="Call to Action"
        defaultValue="NONE"
        options={callToActionTypes}
      />

      {callToActionType &&
        callToActionType !== 'NONE' &&
        callToActionType !== 'CALL' && (
          <Input
            label="Call to Action URL"
            placeholder="https://example.com"
            {...register('callToActionUrl')}
          />
        )}

      {topicType === 'EVENT' && (
        <FormSection icon="event" title="Event Details">
          <Input
            label="Event Title"
            placeholder="Event name"
            {...register('eventTitle')}
          />
          <div className="grid grid-cols-2 gap-[10px]">
            <Input
              label="Start Date"
              type="date"
              {...register('eventStartDate')}
            />
            <Input label="End Date" type="date" {...register('eventEndDate')} />
          </div>
          <div className="grid grid-cols-2 gap-[10px]">
            <Input
              label="Start Time (optional)"
              type="time"
              {...register('eventStartTime')}
            />
            <Input
              label="End Time (optional)"
              type="time"
              {...register('eventEndTime')}
            />
          </div>
        </FormSection>
      )}

      {topicType === 'OFFER' && (
        <FormSection icon="offer" title="Offer Details">
          <Input
            label="Coupon Code (optional)"
            placeholder="SAVE20"
            {...register('offerCouponCode')}
          />
          <Input
            label="Redeem Online URL (optional)"
            placeholder="https://example.com/redeem"
            {...register('offerRedeemUrl')}
          />
          <Input
            label="Terms & Conditions (optional)"
            placeholder="Valid until..."
            {...register('offerTerms')}
          />
        </FormSection>
      )}
    </div>
  );
};

export default withProvider({
  postComment: PostComment.POST,
  minimumCharacters: [],
  SettingsComponent: GmbSettings,
  CustomPreviewComponent: undefined,
  dto: GmbSettingsDto,
  maximumCharacters: 1500,
});
