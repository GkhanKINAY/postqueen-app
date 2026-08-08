'use client';

import { FC } from 'react';

/**
 * A connected third-party, as one card.
 *
 * Same anatomy as the Settings → Integrations card
 * (`third-party.component.tsx`): icon tile, title over a status line, clamped
 * description, then a hairline above the action. Shared by the two composer-side
 * pickers — the media picker and the media-library importer — so they cannot
 * drift apart. Settings keeps its own copy: there the list is the whole
 * catalogue, so its status line is Connected / Not connected and it carries two
 * actions. Here every provider in the list is connected already, which makes
 * "Connected" on all of them say nothing — the account the key belongs to does.
 */
export const ThirdPartyProviderCard: FC<{
  provider: {
    identifier: string;
    title: string;
    name?: string;
    description?: string;
  };
  actionLabel: string;
  onSelect: () => void;
}> = ({ provider, actionLabel, onSelect }) => (
  // The whole card is clickable as a mouse convenience, but the action button
  // below is the real control — the Settings card models the same shape. Giving
  // the card a role and a tab stop of its own would announce two buttons per
  // provider and nest one inside the other.
  <div
    onClick={onSelect}
    className="flex min-h-[184px] cursor-pointer flex-col gap-[12px] rounded-[16px] bg-pqInner p-[17px] text-start outline outline-1 -outline-offset-1 outline-pqBorder transition-[outline-color] hover:outline-pqBrand"
  >
    <div className="flex items-start gap-[12px]">
      <div className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[12px] bg-pqSettings">
        <img
          className="h-[24px] w-[24px]"
          src={`/icons/third-party/${provider.identifier}.png`}
          alt=""
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px] pt-[2px]">
        <div className="text-[14.5px] font-[600] tracking-[-0.01em] text-pqText">
          {provider.title}
        </div>
        {!!provider.name && (
          <div className="flex min-w-0 items-center gap-[5px] text-[11.5px] font-[600] text-pqOk">
            <span className="size-[5px] shrink-0 rounded-full bg-pqOk" />
            <span className="min-w-0 truncate">{provider.name}</span>
          </div>
        )}
      </div>
    </div>
    {!!provider.description && (
      <div className="line-clamp-2 whitespace-pre-wrap text-[13px] leading-[1.6] text-pqMuted text-balance">
        {provider.description}
      </div>
    )}
    {/* Settings puts two actions on this row so its buttons are compact pills;
        here there is only ever one, and a 31px pill alone under a full-width
        card reads like an afterthought. Same scale as this modal family's other
        primary (`ApiModal`'s "Add integration"). */}
    <div className="mt-auto flex items-center gap-[8px] border-t border-pqLine pt-[13px]">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        className="flex h-[40px] items-center rounded-[10px] bg-pqBrand px-[22px] text-[13.5px] font-[600] text-pqOnBrand transition-colors hover:bg-pqBrandHover"
      >
        {actionLabel}
      </button>
    </div>
  </div>
);
