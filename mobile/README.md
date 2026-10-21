# LexiGuide mobile

LexiGuide mobile is the Expo Go version of the LexiGuide source analyzer. It keeps the website intact and provides a native phone interface for editing, analyzing, correcting, and sharing source code.

## Run in Expo Go

1. Install [Expo Go](https://expo.dev/go) on your phone.
2. From this folder, run:

   ```powershell
   npm start
   ```

3. Keep your computer and phone on the same Wi-Fi network, then scan the QR code shown by Expo CLI with Expo Go (Android) or the Camera app (iPhone).

If the local network blocks device-to-device connections, run `npx expo start --tunnel` instead. On Windows, allow Node.js through the firewall on private networks if Windows asks.

## Features

- Source editor with language selection, starter examples, reset, copy, and native share/export.
- Local draft, language, and theme persistence.
- Light and dark appearance.
- Lexical and delimiter analysis, issue context, suggested corrections, and re-analysis.
- Compiler stage flow, selectable phase explanations, and a nested syntax-structure preview.
- Local Lexi AI helper with contextual explanations and suggested prompts.

LexiGuide runs lightweight lexical and delimiter checks in the app. Its parse tree is a structural preview; full language grammar, semantic checks, optimization, and code generation require a language-specific compiler.
