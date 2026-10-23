# UI uses native ES modules with no build step

The UI is split into native ES modules (`<script type="module">`) and per-feature CSS files, served as-is by GitHub Pages with no bundler. Browsers block module imports on `file://`, so opening `ui/index.html` by double-click no longer works; the UI must be served over HTTP (`python3 -m http.server 8000 --directory ui`). We chose this over classic `<script>` files sharing a `window` namespace because explicit `import` lines let people and agents trace dependencies without knowing a load order.

## Considered Options

- **Classic scripts on one namespace:** keeps `file://` working, but dependencies are implicit and depend on script order.
- **A bundler (Vite etc.):** rejected to keep the deploy a plain copy of `ui/` and avoid a build step in `deploy-pages.yml`.
