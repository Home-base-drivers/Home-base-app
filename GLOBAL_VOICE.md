# Global voice language settings

The Copilot language menu offers 20 widely spoken languages. This is not a ranking by speaker population and does not expand Home Base's geographic data or platform coverage.

The browser language supplies the initial default; an existing saved preference wins, including es-DO. Users can change language, region and installed voice in the side menu. Preview samples and six basic command examples are provided in each language. Speech recognition uses the selected locale, but actual recognition/voice/accent availability depends on the browser and device. Arabic and Urdu transcripts use automatic text direction.

No voice from an unrelated language is silently selected. If no matching voice is installed, the response remains available as text. If a region-specific voice is missing, another voice in that language may be used and the menu explains this.

## Server deployment required for translated dynamic replies

GitHub Pages deploys only the web app. It does **not** deploy the Supabase `dispatch` function. Redeploy that function with the updated handler, language module and bundled engine using the project's existing Supabase deployment process. The existing server secrets `OPENAI_API_KEY` and `OPENAI_COPILOT_MODEL` must be configured; do not place credentials in browser assets.

Users must be signed in and enable the existing cloud language option to send requests to the cloud. Local basic commands and preview do not require that option. Dynamic translation sends the response text and locale to the authenticated dispatch function, never the private trip ledger. Requests set store:false. Numbers and platform names are protected against omission, duplication and numeric substitution. Model translation quality still requires native-speaker/device acceptance testing.

When cloud translation is disabled, undeployed or unavailable, Home Base explicitly labels the English response and uses an English voice, if one is installed. It does not pronounce English through the selected foreign-language voice or claim that the response was translated. The general app interface is still English.

## Verification

Run `node --test tests/voice.test.mjs tests/languages.test.mjs tests/dispatch.test.mjs` plus the standard Validate Home Base workflow. Check preview, microphone recognition and a dynamic reply on target iOS/Android devices before claiming end-to-end language support. Verify translations keep the advisory/estimated wording, amounts and platform limitations.
