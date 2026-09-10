import { useId } from 'react';

/*
 * A folder-shaped media card: a cover sits behind a dark folder panel that is
 * notched over it, with the title and subtitle riding in the tab and a stat
 * line along the bottom.
 *
 * On hover the panel slides down to reveal more of the cover, the cover drifts
 * in, and the whole card lifts. All three move off a single :hover on the root
 * (see .folder-card in styles.css) so the parts stay in sync.
 *
 * Every dimension is in container query units, so the card is pixel-exact at
 * any width.
 */

/*
 * The folder silhouette. The viewBox matches the inner (inside-bezel) box
 * exactly, so preserveAspectRatio="none" scales it without distorting radii.
 *
 * The notch is one cubic Bézier: a long, flat shoulder easing out of the tab,
 * then a steepening sweep that lands softly on the body. 76 across, 59 down,
 * horizontal tangents at both ends so it meets the straight edges without a
 * kink.
 *
 *   tab top   y = 135, straight edge ends x = 261
 *   body top  y = 194   outer corner radius 32, tab corner 16
 *
 * The path runs past the left/right edges and well past the bottom, so the
 * panel always overhangs the cover and still fills the card while it slides
 * down on hover.
 */
const FOLDER_PATH =
  'M-2,151 a16,16 0 0 1 16,-16 h247 ' +
  'c26.6,0 59.3,59 76,59 ' +
  'h149 a32,32 0 0 1 32,32 v368 ' +
  'a32,32 0 0 1 -32,32 h-456 a32,32 0 0 1 -32,-32 Z';

export default function FolderCard({
  title,
  subtitle,
  count,
  countLabel,
  meta,
  cover,
  coverAlt = '',
}) {
  // useId() ships colons, which are legal in a URL fragment but awkward
  // everywhere else — strip them so the gradient reference stays plain.
  const gradientId = `folder-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <article className="folder-card">
      <div className="folder-card-bezel">
        <div className="folder-card-inner">
          {/*
            The card's edge lands on a fractional device pixel, so anything
            clipped there paints at partial alpha. The cover is held 1px in and
            the folder runs 1px proud, which leaves that column filled with
            surface/panel colour instead of a hairline of cover.
          */}
          <div className="folder-card-cover-clip">
            <div className="folder-card-cover">
              {cover ? (
                <img src={cover} alt={coverAlt} loading="lazy" draggable={false} />
              ) : (
                <div className="folder-card-aurora" aria-hidden="true" />
              )}
            </div>
          </div>

          {/* folder front: panel + tab copy, moving as one */}
          <div className="folder-card-front-clip">
            <div className="folder-card-front">
              <svg aria-hidden="true" viewBox="0 0 516 494" preserveAspectRatio="none">
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="var(--folder-card-panel-from)" />
                    <stop offset="1" stopColor="var(--folder-card-panel-to)" />
                  </linearGradient>
                </defs>
                {/* stroked as well as filled so no seam shows at the edges */}
                <path
                  d={FOLDER_PATH}
                  fill={`url(#${gradientId})`}
                  stroke={`url(#${gradientId})`}
                  strokeWidth="2"
                />
              </svg>

              <div className={`folder-card-tab${subtitle ? '' : ' is-single'}`}>
                {/* the tab is only so wide before the notch cuts into it, so a long
                    name ellipses here and keeps its full text in the tooltip */}
                <h3 className="folder-card-title" title={title}>{title}</h3>
                {subtitle ? (
                  <p className="folder-card-subtitle" title={subtitle}>{subtitle}</p>
                ) : null}
              </div>
            </div>
          </div>

          {/* footer stays put while the folder front slides */}
          <div className="folder-card-footer">
            <p>
              <span className="folder-card-count">{count}</span>
              <span className="folder-card-count-label">{countLabel}</span>
            </p>
            {meta ? <p className="folder-card-meta">{meta}</p> : null}
          </div>
        </div>
      </div>
    </article>
  );
}
