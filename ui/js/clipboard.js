// Clipboard: copies text with the async Clipboard API, falling back to a hidden textarea and
// execCommand where that API is missing or rejects.

function fallbackCopy(text) {
  const temp = document.createElement('textarea');
  temp.value = text;
  temp.style.position = 'fixed';
  temp.style.opacity = '0';
  document.body.appendChild(temp);
  temp.focus();
  temp.select();
  document.execCommand('copy');
  document.body.removeChild(temp);
}

// Resolves once the copy has gone through without error; rejects if the fallback throws.
// (execCommand can report failure by returning false, which is not treated as an error.)
export function copyText(text) {
  const attemptFallback = () => new Promise(resolve => {
    fallbackCopy(text);
    resolve();
  });
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).catch(attemptFallback);
  }
  return attemptFallback();
}
