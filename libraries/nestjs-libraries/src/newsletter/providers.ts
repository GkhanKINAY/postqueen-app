import { BeehiivProvider } from '@gitroom/nestjs-libraries/newsletter/providers/beehiiv.provider';
import { EmailEmptyProvider } from '@gitroom/nestjs-libraries/newsletter/providers/email-empty.provider';
import { ListmonkProvider } from '@gitroom/nestjs-libraries/newsletter/providers/listmonk.provider';
import { ResendNewsletterProvider } from '@gitroom/nestjs-libraries/newsletter/providers/resend.provider';
import { NewsletterInterface } from '@gitroom/nestjs-libraries/newsletter/newsletter.interface';

export const newsletterProviders: NewsletterInterface[] = [
  new ResendNewsletterProvider(),
  new BeehiivProvider(),
  new ListmonkProvider(),
  new EmailEmptyProvider(),
];
