'use client';

import React, {
  FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useRouter } from 'next/navigation';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { FormProvider, SubmitHandler, useForm } from 'react-hook-form';
import { classValidatorResolver } from '@hookform/resolvers/class-validator';
import { GeneratorDto } from '@gitroom/nestjs-libraries/dtos/generator/generator.dto';
import { Button } from '@gitroom/react/form/button';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Textarea } from '@gitroom/react/form/textarea';
import { Checkbox } from '@gitroom/react/form/checkbox';
import clsx from 'clsx';
import {
  CalendarWeekProvider,
  useCalendar,
} from '@gitroom/frontend/components/launches/calendar.context';
import dayjs from 'dayjs';
import { FormChoice } from '@gitroom/react/form/form.choice';
import { Spinner } from '@gitroom/react/ui/spinner';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { AddEditModal } from '@gitroom/frontend/components/new-launch/add.edit.modal';
import { useToaster } from '@gitroom/react/toaster/toaster';

/**
 * The generation graph's nodes, grouped into the steps a person reads. The
 * image step only shows when an image was asked for.
 */
const GENERATOR_STEPS: { nodes: string[]; picture?: boolean }[] = [
  { nodes: ['agent', 'research', 'find-category', 'find-topic'] },
  { nodes: ['find-popular-posts'] },
  { nodes: ['generate-hook'] },
  { nodes: ['generate-content'] },
  { nodes: ['generate-picture', 'upload-pictures'], picture: true },
  { nodes: ['post-time'] },
];

type GeneratorForm = GeneratorDto & {
  /** Length and shape are asked apart and sent as one `format`. */
  length: 'short' | 'long';
  shape: 'one' | 'thread';
};

const FirstStep: FC = () => {
  const { integrations, reloadCalendarView } = useCalendar();
  const modal = useModals();
  const router = useRouter();
  const fetch = useFetch();
  const toaster = useToaster();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(-1);
  const abortRef = useRef<AbortController | null>(null);
  const t = useT();
  const resolver = useMemo(() => {
    return classValidatorResolver(GeneratorDto);
  }, []);
  const form = useForm<GeneratorForm>({
    mode: 'all',
    resolver: resolver as any,
    values: {
      research: '',
      isPicture: false,
      format: 'one_short',
      tone: 'personal',
      length: 'short',
      shape: 'one',
    },
  });
  const [research, length, shape, isPicture] = form.watch([
    'research',
    'length',
    'shape',
    'isPicture',
  ]);

  useEffect(() => {
    form.setValue('format', `${shape}_${length}` as GeneratorDto['format']);
  }, [form, shape, length]);

  const stepLabels = [
    t('ai_post_step_topic', 'Understanding the topic'),
    t('ai_post_step_popular', 'Finding popular posts to learn from'),
    t('ai_post_step_hook', 'Writing the hook'),
    t('ai_post_step_post', 'Writing the post'),
    t('ai_post_step_image', 'Making the image'),
    t('ai_post_step_time', 'Finding a free time'),
  ];

  const generateStep = useCallback(
    async (reader: ReadableStreamDefaultReader) => {
      const decoder = new TextDecoder('utf-8');
      let lastResponse = {} as any;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) return lastResponse.data.output;

        // Convert chunked binary data to string
        const chunkStr = decoder.decode(value, {
          stream: true,
        });
        for (const chunk of chunkStr
          .split('\n')
          .filter((f) => f && f.indexOf('{') > -1)) {
          let data: any;
          try {
            data = JSON.parse(chunk);
          } catch (e) {
            /** ignore partial / unparseable chunks **/
            continue;
          }

          // Server emits this when a node in the generation graph throws.
          if (data?.error) {
            throw new Error(
              data.message ||
                t(
                  'generation_failed',
                  'Failed to generate posts, please try again.'
                )
            );
          }

          const index = GENERATOR_STEPS.findIndex((s) =>
            s.nodes.includes(data.name)
          );
          if (index > -1) {
            setStep(index);
          }
          lastResponse = data;
        }
      }
    },
    [t]
  );
  const onSubmit: SubmitHandler<GeneratorForm> = useCallback(
    async ({ length: _length, shape: _shape, ...value }) => {
      setLoading(true);
      setStep(0);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const response = await fetch('/posts/generator', {
          method: 'POST',
          body: JSON.stringify(value),
          signal: controller.signal,
        });
        if (!response.body) {
          throw new Error(
            t(
              'generation_failed',
              'Failed to generate posts, please try again.'
            )
          );
        }
        const reader = response.body.getReader();
        const load = await generateStep(reader);
        if (!load?.content) {
          throw new Error(
            t(
              'generation_failed',
              'Failed to generate posts, please try again.'
            )
          );
        }
        const messages = load.content.map((p: any, index: number) => {
          if (index === 0) {
            return {
              content: load.hook + '\n' + p.content,
              ...(p?.image?.path
                ? {
                    image: [p.image],
                  }
                : {}),
            };
          }
          return {
            content: p.content,
            ...(p?.image?.path
              ? {
                  image: [p.image],
                }
              : {}),
          };
        });
        modal.openModal({
          id: 'add-edit-modal',
          closeOnClickOutside: false,
          removeLayout: true,
          closeOnEscape: false,
          withCloseButton: false,
          askClose: true,
          fullScreen: true,
          classNames: {
            modal: 'w-[100%] max-w-[1400px] text-textColor',
          },
          children: (
            <AddEditModal
              allIntegrations={integrations.map((p) => ({
                ...p,
              }))}
              integrations={integrations.slice(0).map((p) => ({
                ...p,
              }))}
              mutate={reloadCalendarView}
              date={dayjs.utc(load.date).local()}
              reopenModal={() => ({})}
              onlyValues={messages}
            />
          ),
          size: '80%',
        });
      } catch (e: any) {
        // Cancel aborts the request on purpose; nothing to report.
        if (!controller.signal.aborted) {
          toaster.show(
            e?.message ||
              t(
                'generation_failed',
                'Failed to generate posts, please try again.'
              ),
            'warning'
          );
        }
      } finally {
        abortRef.current = null;
        setStep(-1);
        setLoading(false);
      }
    },
    [integrations, reloadCalendarView, fetch, generateStep, modal, toaster, t]
  );

  const planInCopilot = useCallback(() => {
    modal.closeCurrent();
    router.push('/agents');
  }, [modal, router]);

  if (loading) {
    return (
      <div className="flex flex-col">
        <div className="rounded-[12px] bg-pqSettings px-[16px] py-[14px] text-[13px] leading-[1.5] text-pqMuted">
          {research}
        </div>
        <ol className="mt-[14px] flex flex-col" aria-live="polite">
          {GENERATOR_STEPS.map((s, index) => {
            if (s.picture && !isPicture) {
              return null;
            }
            const state =
              index < step ? 'done' : index === step ? 'run' : 'todo';
            return (
              <li
                key={index}
                className={clsx(
                  'flex h-[38px] items-center gap-[12px] text-[14px]',
                  state === 'run'
                    ? 'font-[600] text-pqText'
                    : state === 'done'
                      ? 'font-[500] text-pqMuted'
                      : 'font-[500] text-pqSoft'
                )}
              >
                {state === 'done' ? (
                  <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-pqOkSoft text-pqOk">
                    <svg
                      viewBox="0 0 24 24"
                      width="13"
                      height="13"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M5 12.5l4.5 4.5L19 7.5"
                        stroke="currentColor"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                ) : state === 'run' ? (
                  <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-pqBrandSoft text-pqFocused">
                    <Spinner width={12} height={12} borderWidth={2} />
                  </span>
                ) : (
                  <span className="size-[22px] shrink-0 rounded-full shadow-[inset_0_0_0_1.5px_var(--border)]" />
                )}
                {stepLabels[index]}
              </li>
            );
          })}
        </ol>
        <div className="mt-[18px] flex items-center gap-[8px] border-t border-pqLine pt-[16px]">
          <span className="text-[12.5px] text-pqSoft">
            {t(
              'ai_post_opens_when_done',
              'Create Post opens with the draft when this is done.'
            )}
          </span>
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="ms-auto h-[38px] rounded-[10px] px-[14px] text-[13.5px] font-[600] text-pqMuted transition-colors hover:bg-pqHover hover:text-pqText"
          >
            {t('cancel', 'Cancel')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <FormProvider {...form}>
        <p className="-mt-[4px] mb-[16px] text-[12.5px] text-pqMuted">
          {t(
            'ai_post_sub',
            'You get a draft in Create Post. Nothing is scheduled until you say so.'
          )}
        </p>
        <div className="flex flex-col gap-[16px]">
          <div>
            <Textarea
              label={t('ai_post_about', 'What is the post about?')}
              placeholder={t(
                'ai_post_about_placeholder',
                'Our spring collection launches on Monday: light layers and soft colors. Keep it friendly.'
              )}
              {...form.register('research')}
            />
            <div className="mt-[6px] text-[12px] text-pqSoft">
              {t(
                'ai_post_about_hint',
                'At least 10 characters. Say who it is for and how it should sound.'
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-[18px] gap-y-[14px] mobile:grid-cols-1">
            <FormChoice
              name="length"
              layout="segment"
              label={t('ai_post_length', 'Length')}
              options={[
                { label: t('ai_post_short', 'Short'), value: 'short' },
                { label: t('ai_post_long', 'Long'), value: 'long' },
              ]}
            />
            <FormChoice
              name="shape"
              layout="segment"
              label={t('ai_post_shape', 'Shape')}
              options={[
                { label: t('ai_post_one', 'One post'), value: 'one' },
                { label: t('ai_post_thread', 'Thread'), value: 'thread' },
              ]}
            />
            <FormChoice
              name="tone"
              layout="segment"
              label={t('ai_post_voice', 'Voice')}
              options={[
                {
                  label: t('ai_post_personal', 'Personal (I)'),
                  value: 'personal',
                },
                {
                  label: t('ai_post_company', 'Company (We)'),
                  value: 'company',
                },
              ]}
            />
            <div className="flex flex-col gap-[5px]">
              <div className="text-[13px] font-[500] text-pqMuted">
                {t('ai_post_image', 'Image')}
              </div>
              <div className="flex h-[40px] items-center">
                <Checkbox
                  {...form.register('isPicture')}
                  label={t('ai_post_make_image', 'Make an image for it')}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="mt-[20px] flex flex-wrap items-center gap-[8px] border-t border-pqLine pt-[16px]">
          <button
            type="button"
            onClick={planInCopilot}
            className="flex min-h-[38px] items-center gap-[6px] text-[13px] font-[600] text-pqFocused hover:underline"
          >
            {t(
              'ai_post_plan_in_copilot',
              'Several posts? Plan them in AI Copilot'
            )}
          </button>
          <span className="ms-auto flex gap-[8px]">
            <button
              type="button"
              onClick={() => modal.closeCurrent()}
              className="h-[38px] rounded-[10px] px-[14px] text-[13.5px] font-[600] text-pqMuted transition-colors hover:bg-pqHover hover:text-pqText"
            >
              {t('cancel', 'Cancel')}
            </button>
            <Button type="submit" disabled={research.trim().length < 10}>
              {t('ai_post_write_draft', 'Write the draft')}
            </Button>
          </span>
        </div>
      </FormProvider>
    </form>
  );
};
export const GeneratorPopup = () => {
  return (
    <div className="relative flex w-full flex-col bg-pqInner">
      <FirstStep />
    </div>
  );
};
export const GeneratorComponent = () => {
  const t = useT();
  const user = useUser();
  const router = useRouter();
  const modal = useModals();
  const all = useCalendar();
  const generate = useCallback(async () => {
    if (!user?.tier?.ai) {
      if (
        await deleteDialog(
          t('upgrade_required', 'You need to upgrade to use this feature'),
          t('move_to_billing', 'Move to billing'),
          t('payment_required', 'Payment Required')
        )
      ) {
        router.push('/billing');
      }
      return;
    }
    modal.openModal({
      title: t('write_a_post_with_ai', 'Write a post with AI'),
      withCloseButton: true,
      classNames: {
        modal: 'text-pqText',
      },
      size: 640,
      children: (
        <CalendarWeekProvider {...all}>
          <GeneratorPopup />
        </CalendarWeekProvider>
      ),
    });
  }, [user, all, modal, router, t]);
  return (
    <div
      className="h-[44px] w-[44px] group-[.sidebar]:w-full bg-ai justify-center items-center flex rounded-[8px] cursor-pointer"
      onClick={generate}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
      >
        <g clipPath="url(#clip0_1930_7370)">
          <path
            d="M5.41675 10.8337L6.07046 12.1411C6.2917 12.5836 6.40232 12.8048 6.55011 12.9965C6.68124 13.1667 6.83375 13.3192 7.00388 13.4503C7.19559 13.5981 7.41684 13.7087 7.85932 13.9299L9.16675 14.5837L7.85932 15.2374C7.41684 15.4586 7.19559 15.5692 7.00388 15.717C6.83375 15.8482 6.68124 16.0007 6.55011 16.1708C6.40232 16.3625 6.2917 16.5837 6.07046 17.0262L5.41675 18.3337L4.76303 17.0262C4.54179 16.5837 4.43117 16.3625 4.28339 16.1708C4.15225 16.0007 3.99974 15.8482 3.82962 15.717C3.6379 15.5692 3.41666 15.4586 2.97418 15.2374L1.66675 14.5837L2.97418 13.9299C3.41666 13.7087 3.6379 13.5981 3.82962 13.4503C3.99974 13.3192 4.15225 13.1667 4.28339 12.9965C4.43117 12.8048 4.54179 12.5836 4.76303 12.1411L5.41675 10.8337Z"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M12.5001 1.66699L13.4823 4.22067C13.7173 4.8317 13.8348 5.13721 14.0175 5.39419C14.1795 5.62195 14.3785 5.82095 14.6062 5.9829C14.8632 6.16563 15.1687 6.28313 15.7797 6.51814L18.3334 7.50033L15.7797 8.48251C15.1687 8.71752 14.8632 8.83502 14.6062 9.01775C14.3785 9.1797 14.1795 9.3787 14.0175 9.60646C13.8348 9.86344 13.7173 10.169 13.4823 10.78L12.5001 13.3337L11.5179 10.78C11.2829 10.169 11.1654 9.86344 10.9827 9.60646C10.8207 9.3787 10.6217 9.1797 10.3939 9.01775C10.137 8.83503 9.83145 8.71752 9.22043 8.48251L6.66675 7.50033L9.22043 6.51814C9.83145 6.28313 10.137 6.16563 10.3939 5.9829C10.6217 5.82095 10.8207 5.62195 10.9827 5.39419C11.1654 5.13721 11.2829 4.8317 11.5179 4.22067L12.5001 1.66699Z"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
        <defs>
          <clipPath id="clip0_1930_7370">
            <rect width="20" height="20" fill="white" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
};
