# Why this empty folder exists

The app's screens live in `src/pages/`, but they are ordinary React components, not Next.js routes.
Next.js looks for `pages/` and `app/` in the project root first and only falls back to `src/`.
With `app/` in the root and no root `pages/`, it would pick up `src/pages/` as a Pages Router folder
and refuse to build. This folder (with no route files in it) keeps Next.js away from `src/pages/`.
All routes are in `app/`.
