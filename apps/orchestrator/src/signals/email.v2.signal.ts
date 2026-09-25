import { defineSignal } from '@temporalio/workflow';
import { DigestItem } from '@gitroom/nestjs-libraries/emails/email.content';

export const digestItemsSignal = defineSignal<[DigestItem[]]>('email');
