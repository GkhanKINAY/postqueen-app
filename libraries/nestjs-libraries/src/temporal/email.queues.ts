// Resend's default rate limit is 2 requests per second for the whole team,
// and the sign-in code and sign-up activation emails are sent directly
// (sendEmailSync from the backend), outside these queues, so they share that
// budget. The limits are enforced by the Temporal server across every worker
// polling the queue; it splits a queue's rate over its partitions, so after an
// idle period a burst can briefly go above it. 1.5/s together stays at about
// the pace the old `send_email` singleton kept (one send per ~700ms), and
// sends Resend rejects with a 429 are retried by sendEmailSync.
export const emailQueues = {
  // Password resets, notifications, billing, invites ('top')
  priority: { taskQueue: 'email', perSecond: 1 },
  // Digests, streak and welcome emails ('bottom')
  bulk: { taskQueue: 'email-bulk', perSecond: 0.5 },
};
