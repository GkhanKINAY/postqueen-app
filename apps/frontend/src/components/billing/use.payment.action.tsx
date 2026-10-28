import { useCallback } from 'react';
// `pure`: Stripe.js loads when a payment needs it, not on import. The root
// layout reaches this hook, so the plain entry put Stripe's script and cookies
// on every page, the login and public post previews included. The signed-in
// shell still loads it through first.billing.component.
import { loadStripe } from '@stripe/stripe-js/pure';
import { useVariables } from '@gitroom/react/helpers/variable.context';

/**
 * Completes a payment the bank wants confirmed (3D Secure) inside the app,
 * from the payment intent's client secret. Using it with the publishable key
 * is Stripe's intended flow:
 * https://docs.stripe.com/api/payment_intents/object#payment_intent_object-client_secret
 *
 * Never throws. Stripe.js rejects when it cannot load and when the intent is
 * no longer waiting on an action; both are a failed payment to the caller,
 * which would otherwise sit on its spinner. `message` is Stripe's own,
 * already in the visitor's language, and only there when Stripe sent one.
 */
export const usePaymentAction = () => {
  const { stripeClient } = useVariables();

  return useCallback(
    async (
      clientSecret: string
    ): Promise<{ failed: boolean; message?: string }> => {
      try {
        const stripe = await loadStripe(stripeClient);
        if (!stripe) {
          return { failed: true };
        }
        const { error } = await stripe.handleNextAction({ clientSecret });
        return error
          ? { failed: true, message: error.message }
          : { failed: false };
      } catch (err) {
        return { failed: true };
      }
    },
    [stripeClient]
  );
};
