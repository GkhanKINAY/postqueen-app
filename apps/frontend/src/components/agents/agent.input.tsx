import React, {
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useCopilotContext } from '@copilotkit/react-core';
import AutoResizingTextarea from '@gitroom/frontend/components/agents/agent.textarea';
import { useChatContext } from '@copilotkit/react-ui';
import { InputProps } from '@copilotkit/react-ui';
import {
  ChannelPickerButton,
  PropertiesContext,
} from '@gitroom/frontend/components/agents/agent';
import {
  CopilotCreditsNotice,
  useCopilotCreditsOut,
} from '@gitroom/frontend/components/agents/agent.credits';
const MAX_NEWLINES = 6;

export const Input = ({
  inProgress,
  onSend,
  isVisible = false,
  onStop,
  onUpload,
  hideStopButton = false,
  onChange,
  toolbar,
  attachments,
}: InputProps & {
  onChange: (value: string) => void;
  toolbar?: ReactNode;
  // Design: 58×58 media thumbs sit above the textarea inside the pop card.
  attachments?: ReactNode;
}) => {
  const context = useChatContext();
  const copilotContext = useCopilotContext();
  const { composerSeed } = useContext(PropertiesContext);
  const { empty: outOfCredits } = useCopilotCreditsOut();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isComposing, setIsComposing] = useState(false);

  const handleDivClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;

    // If the user clicked a button or inside a button, don't focus the textarea
    if (target.closest('button')) return;

    // If the user clicked the textarea, do nothing (it's already focused)
    if (target.tagName === 'TEXTAREA') return;

    // Otherwise, focus the textarea
    textareaRef.current?.focus();
  };

  const [text, setText] = useState('');

  // An empty-state suggestion fills the box and leaves sending to the person.
  // `onChange` is a fresh closure on every render of the SDK's chat, so it is
  // read through a ref rather than re-running this on each keystroke.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // The seed lives in the page layout and outlives this box: a box that
  // mounts later (New chat, another chat) must not pick up an old one.
  const appliedSeed = useRef(composerSeed.n);
  useEffect(() => {
    if (composerSeed.n === appliedSeed.current) return;
    appliedSeed.current = composerSeed.n;
    setText(composerSeed.text);
    onChangeRef.current(composerSeed.text);
    textareaRef.current?.focus();
  }, [composerSeed.n, composerSeed.text]);
  const send = () => {
    if (inProgress || outOfCredits) return;
    onSend(text);
    setText('');

    textareaRef.current?.focus();
  };

  const isInProgress = inProgress;

  const canSend = useMemo(() => {
    // CopilotKit 1.66 replaced the single `langGraphInterruptAction` with a
    // per-thread queue. The question this asks is unchanged — is the agent
    // waiting on the user to answer an interrupt — but an event is now pending
    // by virtue of still being in the queue rather than by carrying no
    // `response`.
    const interruptInProgress = Object.values(
      copilotContext.interruptEventQueue ?? {}
    ).some((queued) => queued.length > 0);

    return (
      !isInProgress &&
      !outOfCredits &&
      text.trim().length > 0 &&
      !interruptInProgress
    );
  }, [copilotContext.interruptEventQueue, isInProgress, outOfCredits, text]);

  const canStop = useMemo(() => {
    return isInProgress && !hideStopButton;
  }, [isInProgress, hideStopButton]);

  const sendDisabled = !canSend && !canStop;

  return (
    <div className="copilotKitInputContainer">
      <div className="mx-auto flex w-full max-w-[840px] flex-col gap-[8px] pb-[env(safe-area-inset-bottom)]">
        <CopilotCreditsNotice />
        <div
          className="copilotKitInput flex cursor-text flex-col gap-[7px]"
          onClick={handleDivClick}
        >
          <ChannelPickerButton />
          {attachments}
          <AutoResizingTextarea
            ref={textareaRef}
            placeholder={context.labels.placeholder}
            autoFocus={false}
            maxRows={MAX_NEWLINES}
            value={text}
            onChange={(event) => {
              onChange(event.target.value);
              setText(event.target.value);
            }}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !isComposing) {
                event.preventDefault();
                if (canSend) {
                  send();
                }
              }
            }}
          />
          <div className="copilotKitInputControls flex items-end gap-[4px] pb-[2px]">
            {onUpload && (
              <button
                onClick={onUpload}
                className="copilotKitInputControlButton"
              >
                {context.icons.uploadIcon}
              </button>
            )}

            <div className="min-w-0 flex-1">{toolbar}</div>
            <button
              disabled={sendDisabled}
              onClick={isInProgress && !hideStopButton ? onStop : send}
              data-copilotkit-in-progress={inProgress}
              data-test-id={
                inProgress
                  ? 'copilot-chat-request-in-progress'
                  : 'copilot-chat-ready'
              }
              className="copilotKitInputControlButton shrink-0"
              data-pq-agent-send="1"
            >
              {isInProgress && !hideStopButton ? (
                context.icons.stopIcon
              ) : (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                  <path
                    d="M12 19V5M6 11l6-6 6 6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
