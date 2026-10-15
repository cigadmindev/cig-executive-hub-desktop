import React from 'react';
import { Link } from 'react-router-dom';
import { pageHeader, pageAction, backLink } from '../theme/pageHeader';
import { useIsNarrow } from '../hooks/useIsNarrow';

// The one way every page opens (V1, 8 Oct 2026):
//   ‹ back link
//   TITLE                                   [extras] [+ Add …]
//   one line saying what the page is for
// The add button is always top right and always looks the same. The title's
// size lives in index.css (.hub-page-title) so it can shrink on a phone.
// On a phone (15 Oct 2026) the add button always stays top right beside the
// title, the same on every page; before, it dropped under the title on some
// pages and not others, depending on how long the title was. Anything else in
// the header (counts, a date bar, a second button) gets its own row under the
// title - unless the page says it's small enough to sit beside it
// (phoneExtras="inline": a search icon, an Edit button).
export default function PageHeader({ back, title, subtitle, extras, actionLabel, onAction, actionDisabled, icon, plainCase, phoneExtras = 'below' }) {
  const isNarrow = useIsNarrow();
  const extrasBelow = isNarrow && extras && phoneExtras !== 'inline';
  const action = actionLabel ? (
    <button data-primary="" style={isNarrow ? { ...pageAction, ...phoneAction } : pageAction} onClick={onAction} disabled={actionDisabled}>
      {actionLabel}
    </button>
  ) : null;
  const right = extrasBelow ? action : extras || action ? <>{extras}{action}</> : null;
  return (
    <>
      {back ? (
        back.to ? (
          <Link to={back.to} style={backLink}>‹ {back.label}</Link>
        ) : (
          back
        )
      ) : null}
      <div style={isNarrow ? { ...pageHeader, flexWrap: 'nowrap', gap: 12 } : pageHeader}>
        {/* Takes the room that's left, so the add button stays top right
            even on a phone instead of dropping under the title. */}
        <div style={{ minWidth: 0, flex: isNarrow ? '1 1 0' : '1 1 180px' }}>
          <h1 className="hub-page-title" style={{ margin: 0, display: icon ? 'flex' : undefined, alignItems: 'center', gap: 10, overflowWrap: 'break-word', ...(plainCase ? { textTransform: 'none' } : {}) }}>
            {icon}
            {title}
          </h1>
          {subtitle ? <p style={subtitleStyle}>{subtitle}</p> : null}
          {extrasBelow ? <div style={belowStyle}>{extras}</div> : null}
        </div>
        {right ? <div style={isNarrow ? { ...rightStyle, flexWrap: 'nowrap', flexShrink: 0 } : rightStyle}>{right}</div> : null}
      </div>
    </>
  );
}

// A long label ("+ Add unavailable dates") goes onto two lines rather than
// squeezing the title.
const phoneAction = { whiteSpace: 'normal', maxWidth: 150, textAlign: 'center', lineHeight: 1.25 };
const belowStyle = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 };
const subtitleStyle = { fontSize: 14, color: 'var(--text-secondary)', margin: '6px 0 0', lineHeight: 1.45 };
const rightStyle = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' };
