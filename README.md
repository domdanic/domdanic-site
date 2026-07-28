# domdanic-site

Static multi-page migration of `domdanic.carrd.co`, designed for GitHub Pages.

## Draft goals

- preserve all Carrd sections and source data before rewriting
- keep frequently changed credits and artist information in `assets/js/data.js`
- retain a rough Viking/metal presentation with sharp geometry
- cast decorative shadows upward because the visual fire source sits below the frame
- remain framework-free and easy to host on GitHub Pages

## Pages

- `/` — Home
- `/socials/`
- `/music/`
- `/about/`
- `/credits/`
- `/affiliates/`
- `/schedule/`

## Updating data

- Music directory, social links, and art credits: `assets/js/data.js`
- Page copy and rendering: `assets/js/app.js`
- Full Carrd preservation snapshot: `archive/carrd-snapshot-2026-07-28.md`

## Known draft items

- The logo and background are temporarily referenced from Carrd. Upload the original files before retiring Carrd.
- Artist names and rights holders are preserved. Some Spotify buttons use Spotify search links until the original Carrd artist URIs are audited.
- The schedule is deliberately marked for review because the Carrd version uses Mountain Time.
- `noindex, nofollow` remains enabled until the custom domain is ready.
