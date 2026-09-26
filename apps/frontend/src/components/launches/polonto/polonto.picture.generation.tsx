'use client';

import React from 'react';
import { observer } from 'mobx-react-lite';
import { InputGroup } from '@blueprintjs/core';
import { Clean } from '@blueprintjs/icons';
import { SectionTab } from 'polotno/side-panel';
import { getImageSize } from 'polotno/utils/image';
import { ImagesGrid } from 'polotno/side-panel/images-grid';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  imageCreditCost,
  toCredits,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import {
  formatCredits,
  useCreditsBalance,
} from '@gitroom/frontend/components/billing/use.credits.balance';

// This tab makes a medium, square image, the route's default.
const COST = toCredits(imageCreditCost('medium', 'square'));

const GenerateTab = observer(({ store }: any) => {
  const inputRef = React.useRef<any>(null);
  const [image, setImage] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const fetch = useFetch();
  const toast = useToaster();
  const { data, mutate } = useCreditsBalance();
  const short = !!data && !data.unlimited && (data.balance ?? 0) < COST;
  const t = useT();

  const handleGenerate = async () => {
    // Read at click time, not from the cache: credits bought in the Billing
    // tab this opened must not still read as short here.
    const fresh = await mutate();
    if (fresh && !fresh.unlimited && (fresh.balance ?? 0) < COST) {
      window.open('/billing', '_blank');
      return;
    }
    if (!inputRef.current.value) {
      toast.show('Please type your prompt', 'warning');
      return;
    }
    setLoading(true);
    setImage(null);
    const req = await fetch(`/media/generate-image`, {
      method: 'POST',
      body: JSON.stringify({
        prompt: inputRef.current.value,
      }),
    });
    setLoading(false);
    mutate();
    // A 402 has already been explained by the Payment Required dialog, and
    // choosing Move to billing there answers customFetch's own 499.
    if (!req.ok) {
      if (req.status !== 402 && req.status !== 499) {
        alert('Something went wrong, please try again later...');
      }
      return;
    }
    const newData = await req.json();
    setImage(newData.output);
  };
  return (
    <>
      <div
        style={{
          height: '40px',
          paddingTop: '5px',
        }}
      >
        {t('generate_image_with_ai', 'Generate image with AI')}
        {data && !data.unlimited
          ? ` (${t('credits_balance_left', '{{amount}} credits left', {
              amount: formatCredits(data.balance ?? 0),
            })})`
          : ``}
      </div>
      <InputGroup
        placeholder="Type your image generation prompt here..."
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            handleGenerate();
          }
        }}
        style={{
          marginBottom: '20px',
        }}
        inputRef={inputRef}
      />
      <Button
        onClick={handleGenerate}
        loading={loading}
        innerClassName="invert"
        style={{
          marginBottom: '40px',
        }}
      >
        {short
          ? t('get_more_credits', 'Get more credits')
          : t('generate', 'Generate')}
      </Button>
      {image && (
        <ImagesGrid
          shadowEnabled={false}
          images={image ? [image] : []}
          getPreview={(item) => item}
          isLoading={loading}
          onSelect={async (item, pos, element) => {
            const src = item;
            if (element && element.type === 'svg' && element.contentEditable) {
              element.set({
                maskSrc: src,
              });
              return;
            }
            if (
              element &&
              element.type === 'image' &&
              element.contentEditable
            ) {
              element.set({
                src: src,
              });
              return;
            }
            const { width, height } = await getImageSize(src);
            const x = (pos?.x || store.width / 2) - width / 2;
            const y = (pos?.y || store.height / 2) - height / 2;
            store.activePage?.addElement({
              type: 'image',
              src: src,
              width,
              height,
              x,
              y,
            });
          }}
          rowsNumber={1}
        />
      )}
    </>
  );
});
const PictureGeneratorPanel = observer(({ store }: any) => {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <GenerateTab store={store} />
    </div>
  );
});

// define the new custom section
export const PictureGeneratorSection = {
  name: 'picture-generator-ai',
  Tab: (props: any) => (
    <SectionTab name="AI Img" {...props}>
      <Clean />
    </SectionTab>
  ),
  // we need observer to update component automatically on any store changes
  Panel: PictureGeneratorPanel,
};
