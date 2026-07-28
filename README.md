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

## Schedule maintenance

The recurring schedule is defined in Pacific Time in `assets/js/app.js`. The Schedule page converts each weekly occurrence into the timezone reported by the visitor's browser, including local weekday changes, overnight streams, and daylight-saving offsets.

Schedule rows use:

- `data-day`: `0` Sunday through `6` Saturday
- `data-start`: start time in 24-hour `HH:MM` format
- `data-end`: end time in 24-hour `HH:MM` format
- `data-approx="true"`: optional; adds an `Approx.` prefix

To remove a stream, delete its complete `<tr>...</tr>` row. To add one, copy an existing row and change the day, times, and title. Table layout and timezone conversion update automatically.

## Branding assets

The logo and background are temporarily referenced from the existing Carrd-hosted files. Replace them with local copies before retiring the Carrd site; instructions are in `assets/branding/README.md`.

## Search indexing

Public pages are indexable. The custom `404.html` intentionally remains `noindex, nofollow`.

## Archive

A dated source-content snapshot remains in `archive/` as a migration safety net. It is not used to render the public site.
