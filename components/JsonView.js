'use client';

import { Fragment } from 'react';

const TOKEN = /("(?:\\.|[^"\\])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
const MAX_CHARS = 120000;

// Menampilkan JSON dengan pewarnaan sintaks, dirender sebagai elemen React (bukan innerHTML).
export function JsonView({ value }) {
  let text;
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  if (text === undefined) text = 'undefined';
  const truncated = text.length > MAX_CHARS;
  if (truncated) text = text.slice(0, MAX_CHARS);

  const parts = [];
  let last = 0;
  let match;
  TOKEN.lastIndex = 0;
  while ((match = TOKEN.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    let cls = 'json-num';
    if (match[2]) cls = 'json-key';
    else if (token.startsWith('"')) cls = 'json-str';
    else if (token === 'true' || token === 'false') cls = 'json-bool';
    else if (token === 'null') cls = 'json-null';
    parts.push({ cls, token });
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));

  return (
    <pre className="json-pre">
      {parts.map((part, i) =>
        typeof part === 'string' ? (
          <Fragment key={i}>{part}</Fragment>
        ) : (
          <span key={i} className={part.cls}>{part.token}</span>
        )
      )}
      {truncated ? '\n… (dipotong, gunakan Unduh JSON untuk data lengkap)' : ''}
    </pre>
  );
}
