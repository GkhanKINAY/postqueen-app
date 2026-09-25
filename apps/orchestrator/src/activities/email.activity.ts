import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { EmailService } from '@gitroom/nestjs-libraries/services/email.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { emailContent } from '@gitroom/nestjs-libraries/emails/email.content';
import dayjs from 'dayjs';

@Injectable()
@Activity()
export class EmailActivity {
  constructor(
    private _emailService: EmailService,
    private _organizationService: OrganizationService
  ) {}

  @ActivityMethod()
  async sendEmail(to: string, subject: string, html: string, replyTo?: string) {
    return this._emailService.sendEmailSync(to, subject, html, replyTo);
  }

  @ActivityMethod()
  async sendEmailAsync(to: string, subject: string, html: string, sendTo: 'top' | 'bottom', replyTo?: string) {
    return await this._emailService.sendEmail(to, subject, html, sendTo, replyTo);
  }

  @ActivityMethod()
  async getUserOrgs(id: string) {
    return this._organizationService.getTeam(id);
  }

  /**
   * streakWorkflowV3's email, 24 hours after the last published post. The
   * streak ran from `streakSince` to that post, a day ago.
   */
  @ActivityMethod()
  async sendStreakEnded(organizationId: string) {
    const org = await this._organizationService.getOrgById(organizationId);
    const team = await this._organizationService.getTeam(organizationId);
    const days = org?.streakSince
      ? dayjs().subtract(1, 'day').diff(dayjs(org.streakSince), 'day') + 1
      : 0;
    for (const user of team?.users || []) {
      if (!user.user.sendStreakEmails) {
        continue;
      }
      await this._emailService.sendEmail(
        user.user.email,
        'Your posting streak ended',
        emailContent({
          stream: 'notifications',
          category: 'Streak',
          preheader:
            'Nothing went out in the last 24 hours. One post today starts a new streak.',
          tone: 'streak',
          icon: 'flame',
          title: 'Start a new streak',
          accent: 'today.',
          lead:
            days > 1
              ? `Nothing was published in the last 24 hours, so your ${days}-day posting streak ended.`
              : 'Nothing was published in the last 24 hours, so your posting streak ended.',
          blocks: [
            {
              type: 'button',
              link: { label: 'Schedule a post', url: '/launches' },
            },
          ],
          footer: 'streak',
        }),
        'bottom'
      );
    }
  }

  @ActivityMethod()
  async setStreak(organizationId: string, type: 'start' | 'end') {
    return this._organizationService.setStreak(organizationId, type);
  }
}
