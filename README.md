# domdanic-site

Multi-page static website for the domdanic creator brand.

## Pages

- Home
- Socials
- Stream Music
- About
- Art Credits
- Affiliates
- Schedule

## Content maintenance

Frequently updated content lives in `assets/js/data.js`:

- social destinations
- Spotify playlists
- stream-use and licensing references
- labels and rights holders
- artist directory entries
- art credits

The page layout and behavior live in `assets/js/app.js`. Shared styling lives in `assets/css/styles.css`.

## Schedule behavior

The recurring schedule is defined in Mountain Time in `assets/js/app.js`. The Schedule page converts the next weekly occurrence into the timezone reported by each visitor's browser, including overnight day changes and daylight-saving offsets.

## Branding assets

The logo and background are temporarily referenced from the existing Carrd-hosted files. Replace them with local copies before retiring the Carrd site; instructions are in `assets/branding/README.md`.

## Launch state

All page shells currently include `noindex, nofollow` while the site is under review. Remove that meta directive before the public search-indexed launch.

A dated source-content snapshot remains in `archive/` as a migration safety net.
