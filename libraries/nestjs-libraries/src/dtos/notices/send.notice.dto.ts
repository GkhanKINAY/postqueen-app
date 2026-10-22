import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type {
  EmailBlock,
  EmailIcon,
  EmailTone,
} from '@gitroom/nestjs-libraries/emails/email.content';

// Written as records so the compiler asks for every tone, icon and block type
// email.content.ts has, and for nothing else.
const TONES = Object.keys({
  brand: true,
  ok: true,
  warn: true,
  danger: true,
  streak: true,
} satisfies Record<EmailTone, true>);

const ICONS = Object.keys({
  card: true,
  check: true,
  'check-check': true,
  flame: true,
  help: true,
  key: true,
  lock: true,
  mail: true,
  'mail-check': true,
  plug: true,
  power: true,
  rss: true,
  'shield-alert': true,
  undo: true,
  'user-cog': true,
  'x-circle': true,
} satisfies Record<EmailIcon, true>);

const BLOCK_TYPES = Object.keys({
  text: true,
  code: true,
  address: true,
  reason: true,
  callout: true,
  details: true,
  rows: true,
  button: true,
  fallback: true,
  steps: true,
  note: true,
} satisfies Record<EmailBlock['type'], true>);

const is =
  (...types: EmailBlock['type'][]) =>
  (block: { type: EmailBlock['type'] }) =>
    types.includes(block.type);

export class NoticeLinkDto {
  @IsString()
  @IsNotEmpty()
  label: string;

  @IsString()
  @IsNotEmpty()
  url: string;
}

/**
 * One EmailBlock, with the fields its type shows. A missing one would render
 * as a blank line in every account holder's email, so it is refused here.
 */
export class NoticeBlockDto {
  @IsIn(BLOCK_TYPES)
  type: EmailBlock['type'];

  @ValidateIf(is('text', 'callout', 'note', 'address', 'reason'))
  @IsString()
  @IsNotEmpty()
  text?: string;

  @ValidateIf(is('reason'))
  @IsString()
  @IsNotEmpty()
  label?: string;

  @ValidateIf(is('code'))
  @IsString()
  @IsNotEmpty()
  code?: string;

  @ValidateIf(is('code'))
  @IsString()
  @IsNotEmpty()
  note?: string;

  @ValidateIf(is('details', 'rows'))
  @IsArray()
  @ArrayNotEmpty()
  rows?: unknown[];

  @ValidateIf(is('steps'))
  @IsArray()
  @ArrayNotEmpty()
  items?: unknown[];

  @ValidateIf(is('button'))
  @IsDefined()
  @ValidateNested()
  @Type(() => NoticeLinkDto)
  link?: NoticeLinkDto;

  @ValidateIf(is('fallback'))
  @IsString()
  @IsNotEmpty()
  url?: string;
}

/**
 * The email, as EmailContent describes one. The stream and the footer are not
 * asked for: every notice goes out on the account stream with the `legal`
 * footer, which has no unsubscribe.
 */
export class NoticeContentDto {
  @IsString()
  @IsNotEmpty()
  category: string;

  @IsString()
  @IsNotEmpty()
  preheader: string;

  @IsOptional()
  @IsIn(TONES)
  tone?: EmailTone;

  @IsOptional()
  @IsIn(ICONS)
  icon?: EmailIcon;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  accent?: string;

  @IsOptional()
  @IsString()
  lead?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => NoticeBlockDto)
  blocks: EmailBlock[];

  /** Replaces the footer's "why you get this" line, e.g. for a sub-processor notice. */
  @IsOptional()
  @IsString()
  footerText?: string;
}

export class SendNoticeDto {
  /** Names the notice for good: it is in every workflow id and delivery row. */
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'noticeKey must be a slug, like terms-2026-11',
  })
  noticeKey: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => NoticeContentDto)
  content: NoticeContentDto;

  /** Required: a request sends only when it says `false`. */
  @IsDefined()
  @IsBoolean()
  dryRun: boolean;
}
