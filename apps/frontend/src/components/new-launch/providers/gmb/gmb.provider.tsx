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
import { useT } from '@gitroom/react/translation/get.transation.service.client';

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
    label: 'Call',
    value: 'CALL',
  },
];

const GmbSettings: FC = () => {
  const t = useT();
  const { register, control } = useSettings();
  const topicType = useWatch({ control, name: 'topicType' });
  const callToActionType = useWatch({ control, name: 'callToActionType' });

  // An event and an offer both run between two dates, which Google reads
  // from the same `event` field, so they share these inputs.
  const dates = (topicType === 'EVENT' || topicType === 'OFFER') && (
    <div className="grid grid-cols-2 gap-[10px]">
      <Input label="Start Date" type="date" {...register('eventStartDate')} />
      <Input label="End Date" type="date" {...register('eventEndDate')} />
    </div>
  );

  return (
    <div className="flex flex-col gap-[16px]">
      <FormChoice
        name="topicType"
        label="Post Type"
        layout="segment"
        defaultValue="STANDARD"
        options={topicTypes}
      />

      {/* Google ignores a call to action on an offer and shows its own
          "View offer" button instead. */}
      {topicType !== 'OFFER' && (
        <FormChoice
          name="callToActionType"
          icon="post"
          label="Call to Action"
          defaultValue="NONE"
          options={callToActionTypes}
        />
      )}

      {topicType !== 'OFFER' &&
        callToActionType &&
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
          {dates}
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
          <Input label={t('title', 'Title')} {...register('eventTitle')} />
          {dates}
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
