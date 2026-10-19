import clsx from 'clsx';

/**
 * major.minor from NEXT_PUBLIC_APP_VERSION, falling back to package.json.
 *
 * The leading `v` is stripped before splitting: the container build feeds this
 * from the git tag, which is written `v3.3.0`, and without the strip `major`
 * came out as "v3" and the label read "vv3.3".
 */
export const appVersionLabel = (() => {
  const raw = (process.env.NEXT_PUBLIC_APP_VERSION || '3.0.2').replace(
    /^v/,
    ''
  );
  const [major, minor] = raw.split('.');
  return `v${major}.${minor ?? '0'}`;
})();

/**
 * The brand mark: a speech bubble whose top edge is a crown, with three dots cut
 * out. Same geometry as the landing site's BrandMark and the brand kit, and as
 * the icon approved on the Google consent screen.
 *
 * It is drawn without ids (no mask, no gradient), because it can be on a page
 * many times (every assistant message in the agent chat carries one), and an id
 * would point the later copies at the first, which breaks when that one is
 * hidden. The first path is the crown and the tail, stroked with round
 * joins to soften their corners; the second is the jewels and the body, with
 * the dots punched out by the even-odd rule. The viewBox keeps the mark's own
 * margin, so give it the tile's full size: the mark then sits at the same
 * proportion as the app icon. `currentColor` lets the caller decide the fill.
 */
export const BrandMark = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 512 512" fill="none" aria-hidden="true" className={className}>
    <path
      d="M118 268L128 172L192 218L256 134L320 218L384 172L394 268L360 240L152 240ZM162 354L146 406L226 360Z"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="20"
      strokeLinejoin="round"
    />
    <path
      d="M106 164A22 22 0 1 0 150 164A22 22 0 1 0 106 164ZM232 122A24 24 0 1 0 280 122A24 24 0 1 0 232 122ZM362 164A22 22 0 1 0 406 164A22 22 0 1 0 362 164ZM154 222H358A46 46 0 0 1 404 268V324A46 46 0 0 1 358 370H154A46 46 0 0 1 108 324V268A46 46 0 0 1 154 222ZM173 296A19 19 0 1 0 211 296A19 19 0 1 0 173 296ZM237 296A19 19 0 1 0 275 296A19 19 0 1 0 237 296ZM301 296A19 19 0 1 0 339 296A19 19 0 1 0 301 296Z"
      fill="currentColor"
      fillRule="evenodd"
    />
  </svg>
);

/**
 * The brand logo, single source for both the app rail and the auth screens.
 * Gradient tile + mark, matching the landing site's logo and the app icon, so
 * the marketing site, the product and the Google consent screen read as one
 * brand. The mark fills the tile; size the tile only.
 */
export const PostQueenLogo = ({
  wordmark = false,
  tileClassName = 'size-9',
  wordClassName = 'text-[22px]',
  className,
}: {
  /** Render the "postqueen" wordmark next to the mark. */
  wordmark?: boolean;
  tileClassName?: string;
  wordClassName?: string;
  className?: string;
}) => (
  <span className={clsx('flex items-center gap-[10px]', className)}>
    <span
      className={clsx(
        'grid shrink-0 place-items-center rounded-[0.65rem] bg-gradient-to-br from-pqBrandGradFrom to-pqBrandGradTo shadow-[0_6px_16px_-4px_rgba(124,58,237,0.45)]',
        tileClassName
      )}
    >
      <BrandMark className="size-full text-white" />
    </span>
    {wordmark && (
      <span
        className={clsx(
          'font-display font-extrabold leading-none tracking-tight',
          wordClassName
        )}
      >
        postqueen
      </span>
    )}
  </span>
);
