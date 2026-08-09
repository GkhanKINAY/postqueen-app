import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { AuthorizationActions, Sections, SubscriptionException } from '@gitroom/backend/services/auth/permissions/permission.exception.class';

@Catch(SubscriptionException)
export class SubscriptionExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const status = exception.getStatus();
    const error: { section: Sections; action: AuthorizationActions } =
      exception.getResponse() as any;

    const message = getErrorMessage(error);

    response.status(status).json({
      statusCode: status,
      message,
      url: process.env.FRONTEND_URL + '/billing',
    });
  }
}

const getErrorMessage = (error: {
  section: Sections;
  action: AuthorizationActions;
}) => {
  switch (error.section) {
    case Sections.POSTS_PER_MONTH:
      switch (error.action) {
        default:
          return 'You have reached the maximum number of posts for your subscription. Please upgrade your subscription to add more posts.';
      }
    case Sections.CHANNEL:
      switch (error.action) {
        default:
          return 'You have reached the maximum number of channels for your subscription. Please upgrade your subscription to add more channels.';
      }
    case Sections.WEBHOOKS:
      switch (error.action) {
        default:
          return 'You have reached the maximum number of webhooks for your subscription. Please upgrade your subscription to add more webhooks.';
      }
    case Sections.VIDEOS_PER_MONTH:
      switch (error.action) {
        default:
          return 'You have reached the maximum number of generated videos for your subscription. Please upgrade your subscription to generate more videos.';
      }
    // ADMIN is a role check, not a quota — there is nothing to upgrade. Without
    // a case here the message was undefined and the dialog rendered blank.
    case Sections.ADMIN:
      switch (error.action) {
        default:
          return 'Only a workspace admin can do this. Please ask an admin of this workspace.';
      }
    case Sections.TEAM_MEMBERS:
      switch (error.action) {
        default:
          return 'Your subscription does not include team members. Please upgrade your subscription to invite your team.';
      }
    case Sections.AUTOPOST:
      switch (error.action) {
        default:
          return 'Your subscription does not include Auto Post. Please upgrade your subscription to post from a feed automatically.';
      }
    // Reached once /copilot/chat started carrying a policy. Every other AI
    // route already threw this section and landed on the blank dialog.
    case Sections.AI:
      switch (error.action) {
        default:
          return 'Your subscription does not include AI features. Please upgrade your subscription to use them.';
      }
    // Every section without a case above lands here instead of returning
    // undefined, which the frontend rendered as an empty Payment Required
    // dialog. That bug has now been found three separate times — ADMIN, then AI
    // and AUTOPOST — each fixed by adding one more case, which left the next
    // section to be added waiting to reproduce it. COMMUNITY_FEATURES, FEATURED
    // and IMPORT_FROM_CHANNELS are the ones currently uncovered; they all have
    // granting branches in permissions.service.ts, so they are reachable the
    // moment a route names one.
    //
    // A generic message is worse copy than a specific case. It is much better
    // than a blank modal, and it closes the class rather than one instance.
    default:
      return 'Your subscription does not include this feature. Please upgrade your subscription to use it.';
  }
};
