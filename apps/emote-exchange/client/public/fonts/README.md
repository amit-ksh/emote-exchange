# Local fonts

Variable TTF assets downloaded from the Google Fonts repository on October 28, 2026:

- [JetBrains Mono](https://github.com/google/fonts/tree/main/ofl/jetbrainsmono), `JetBrainsMono[wght].ttf` → `JetBrainsMono.ttf`; license in `JetBrainsMono-OFL.txt`.
- [Space Grotesk](https://github.com/google/fonts/tree/main/ofl/spacegrotesk), `SpaceGrotesk[wght].ttf` → `SpaceGrotesk.ttf`; license in `SpaceGrotesk-OFL.txt`.

Both are served locally; the overlay does not contact a font CDN.

R1 adds [Inter Tight](https://github.com/google/fonts/tree/main/ofl/intertight) and [Doto](https://github.com/google/fonts/tree/main/ofl/doto), downloaded from the official Google Fonts repository on October 28, 2026. Their OFL licenses accompany the local TTF assets. They replace the original fonts in the UI; no font CDN is contacted at runtime.
