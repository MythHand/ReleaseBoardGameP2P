// Autoprefixer derives vendor prefixes from the `browserslist` field in
// package.json, so CSS is written unprefixed and the support target lives in
// one place. This also covers @release/ui, which the frontend consumes from
// source — its CSS goes through this pipeline too.
export default {
  plugins: {
    autoprefixer: {},
  },
}
