# Template Typescript lib

Template for a TypeScript library meant to be published on npm.

Setup and package versions should be current as of Feb 19 2023.

## Files

- `src/`: Source folder. Entry point is `index.ts`. Built to `build/esm` and `build/commonjs`.
- `test/`: Test folder. Runs using mocha.

## Commands

- Build with `npm run build`.
- Test, lint, etc. with `npm run test`. Use `npm run coverage` for code coverage (opens in browser).
- Preview typedoc with `npm run docs`. (Open `docs/index.html` in a browser.)
- Publish with `npm publish`.

## TODO

- Search for TODO.
- Write your library in `src/`.
- Replace this README.


- Iterators unsafe with concurrent mutation