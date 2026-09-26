import { FC } from 'react';

export const videosList: {
  identifier: string;
  Component: FC;
  /** The form fields that change what a video costs, and nothing else. */
  priceFields: string[];
}[] = [];

export const videoWrapper = (
  identifier: string,
  Component: any,
  options?: { priceFields?: string[] }
): null => {
  if (videosList.map(p => p.identifier).includes(identifier)) {
    return null;
  }

  videosList.push({
    identifier,
    Component,
    priceFields: options?.priceFields || [],
  });

  return null;
}

/**
 * Which of a generator's form fields its price depends on, so the modal can
 * ask for the price again when one of them changes, and only then: the
 * prompt is not one, and typing it must not re-read the price.
 */
export const videoPriceFields = (identifier: string) =>
  videosList.find((p) => p.identifier === identifier)?.priceFields || [];
