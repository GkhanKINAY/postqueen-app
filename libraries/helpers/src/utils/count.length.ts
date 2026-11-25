// @ts-ignore
import twitter from 'twitter-text';

// Threads counts its limit in characters (Unicode code points, see
// countLength), so the preview's crop has to fall after the last whole
// character that fits in `maxChars`, never inside a surrogate pair.
const codePointEnd = (text: string, maxChars: number) => {
  let chars = 0;
  let index = 0;
  for (const char of text) {
    chars += 1;
    if (chars > maxChars) {
      return index;
    }
    index += char.length;
  }
  // Everything fits. An emoji is one character but two UTF-16 units, so the
  // limit alone can fall short of the text's end.
  return Math.max(maxChars, index);
};

export const textSlicer = (
  integrationType: string,
  end: number,
  text: string
): { start: number; end: number } => {
  if (integrationType === 'threads') {
    return {
      start: 0,
      end: codePointEnd(text, end),
    };
  }

  if (integrationType !== 'x') {
    return {
      start: 0,
      end,
    };
  }

  const { validRangeEnd, valid } = twitter.parseTweet(text, {
    version: 3,
    maxWeightedTweetLength: end,
    scale: 100,
    defaultWeight: 200,
    emojiParsingEnabled: true,
    transformedURLLength: 23,
    ranges: [
      { start: 0, end: 4351, weight: 100 },
      { start: 8192, end: 8205, weight: 100 },
      { start: 8208, end: 8223, weight: 100 },
      { start: 8242, end: 8247, weight: 100 },
    ],
  });

  return {
    start: 0,
    end: valid ? end : validRangeEnd,
  };
};

export const weightedLength = (text: string): number => {
  return twitter.parseTweet(text).weightedLength;
};

export const countLength = (integrationType: string, text: string): number => {
  if (integrationType === 'x') {
    return weightedLength(text);
  }

  if (integrationType === 'threads') {
    return [...text].length;
  }

  return text.length;
};
