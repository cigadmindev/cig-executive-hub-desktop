import React from 'react';
import { Link } from 'react-router-dom';
import { pageHeader, pageAction, backLink } from '../theme/pageHeader';

// The one way every page opens (V1, 8 Oct 2026):
//   ‹ back link
//   TITLE                                   [extras] [+ Add …]
//   one line saying what the page is for
// The add button is always top right and always looks the same. The title's
// size lives in index.css (.hub-page-title) so it can shrink on a phone.
export default function PageHeader({ back, title, subtitle, extras, actionLabel, onAction, actionDisabled, icon, plainCase }) {
  return (
    <>
      {back ? (
        back.to ? (
          <Link to={back.to} style={backLink}>‹ {back.label}</Link>
        ) : (
          back
        )
      ) : null}
      <div style={pageHeader}>
        <div style={{ minWidth: 0 }}>
          <h1 className="hub-page-title" style={{ margin: 0, display: icon ? 'flex' : undefined, alignItems: 'center', gap: 10, ...(plainCase ? { textTransform: 'none' } : {}) }}>
            {icon}
            {title}
          </h1>
          {subtitle ? <p style={subtitleStyle}>{subtitle}</p> : null}
        </div>
        {extras || actionLabel ? (
          <div style={rightStyle}>
            {extras}
            {actionLabel ? (
              <button data-primary="" style={pageAction} onClick={onAction} disabled={actionDisabled}>
                {actionLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

const subtitleStyle = { fontSize: 14, color: 'var(--text-secondary)', margin: '6px 0 0', lineHeight: 1.45 };
const rightStyle = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' };
