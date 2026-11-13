# Test fixture deck (never shipped)

Three made-up items that exercise the deen build (`scripts/build-deen.mjs`) in
`src/lib/deen/content-integrity.test.ts`. They are not religious content: the Arabic says
"this is test text", and the collection, numbering, scholar, work and witness sources they
cite are fictional entries in this folder's own `registry-additions.json`, which the build
merges only when the fixture is being checked. The build refuses to emit this deck.
