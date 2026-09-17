# Samples

A 20-second public-domain sample project for tests, CI, and demos.

## `tiny-demo/`

A minimal 3-beat narrated video project:

- **Script**: ~80 words describing a sunrise landscape
- **Beats**: 3 beats, each matched to an image
- **Transitions**: dissolve (0.5s), Ken Burns zoom at spec defaults (1.035/1.04)
- **End card**: 5-second "SUBSCRIBE" card from the last frame

### Media

The `media/` directory must contain:

| File | Description |
|------|-------------|
| `narration.mp3` | ~20s narration of the script text |
| `01_sunrise_mountains.jpg` | 1920×1080 sunrise over mountains |
| `02_meadow_wildflowers.jpg` | 1920×1080 meadow with wildflowers |
| `03_stream_landscape.jpg` | 1920×1080 stream through landscape |

**To generate media for testing**, use any public-domain source or synthetic
generation tool.  The project.json works with any 1920×1080 JPEG images and
any ~20s MP3 narration.

### Usage

```bash
# Run the sample through the browser renderer in headless Chromium (CI)
pnpm --filter @nva/web test:e2e -- --grep "sample render"

# Import manually: zip the tiny-demo/ folder and import it in the app
```
