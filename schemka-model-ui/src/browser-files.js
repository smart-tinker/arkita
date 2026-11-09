/** Dispatch only: browsers do not expose whether a download reached disk. */
export function createDownloader({ document, URL, Blob, setTimeout, clearTimeout }) {
  const pending = new Map();
  function release(url) {
    const timer = pending.get(url);
    if (timer !== undefined) clearTimeout(timer);
    pending.delete(url); URL.revokeObjectURL(url);
  }
  return {
    download(bytes, name, type) {
      const blob = new Blob([bytes], { type });
      const url = URL.createObjectURL(blob);
      let anchor;
      try {
        anchor = document.createElement('a');
        anchor.href = url; anchor.download = name; anchor.hidden = true;
        document.body.append(anchor);
        anchor.click();
        // Do not revoke synchronously: the browser may consume the URL later.
        pending.set(url, setTimeout(() => release(url), 60000));
      } catch (error) { release(url); throw error; }
      finally { anchor?.remove(); }
    },
    dispose() { for (const url of [...pending.keys()]) release(url); },
  };
}
