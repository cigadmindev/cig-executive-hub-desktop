import React, { useState, useCallback } from 'react';
import Dialog from '../components/Dialog';

// Wraps the Dialog component so a screen doesn't need its own open/title/body
// state for every confirmation. Replaces window.confirm and window.alert.
//
//   const { dialogNode, confirm, notify } = useDialog();
//   confirm({ title: 'Delete this?', tone: 'danger', onConfirm: () => del(id) });
//   ...
//   {dialogNode}
export function useDialog() {
  const [state, setState] = useState(null);

  const close = useCallback(() => setState(null), []);

  const confirm = useCallback((opts) => setState(opts), []);

  // A message with a single OK — no destructive action behind it.
  const notify = useCallback((title, body) => setState({ title, body }), []);

  const dialogNode = (
    <Dialog
      open={Boolean(state)}
      title={state?.title}
      body={state?.body}
      confirmLabel={state?.confirmLabel}
      tone={state?.tone}
      onConfirm={state?.onConfirm}
      onClose={close}
    />
  );

  return { dialogNode, confirm, notify };
}
