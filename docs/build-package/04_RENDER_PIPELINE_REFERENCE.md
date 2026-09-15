# Render Pipeline Reference (proven)

Everything below was used to produce a real 9:18 video (42 images, 553.7 s of
narration, 5 s end card) that decoded cleanly end-to-end. Port it faithfully.

## Constants
- Output 1920×1080, 30 fps, H.264 High, yuv420p, CRF 18 (final) / 26 (preview),
  AAC 160 kbps, `+faststart`.
- Crossfade `T = 0.5 s`, transition `dissolve`.
- Ken Burns zoom target alternates: odd beats 1.04, even beats 1.035; zoom
  increases linearly per frame so it *completes exactly at the clip's end*.
- End card 5 s: last frame → `boxblur=8:1`, `eq=brightness=-0.35:saturation=0`,
  centred "SUBSCRIBE" (serif bold 90 px) + tagline (serif 36 px, 85 % white).

## Beat splitting (script → beats)
Sentence boundary = `.`, `!`, `?` followed by optional closing quotes/brackets,
**unless** the preceding word is an abbreviation
(`mr mrs ms dr st jr sr vs mme mlle messrs gen col capt lt rev`) **or** the
next non-space character is lowercase (protects "Mrs. Benn"). Group
sentences greedily to a target of 25–40 words, never splitting a sentence;
merge a trailing group under 12 words into the previous one. Bracketed cues
(`[pause]`) stay attached to their sentence for TTS but are stripped for
timing. **Verify**: sum of words across beats == words in the script.

## Timing
### Proportional (fallback, no AI)
```
text  = normalise(script)          # strip [cues], unify quotes/dashes, collapse whitespace
for each beat: off = text.find(first 60/40/25/15 chars of normalised excerpt, from last off)
first_off = offset of the first *spoken* beat (handles hooks not in the audio)
span = len(text) - first_off
start(beat) = (off - first_off) / span * audio_duration ; start(first) = 0
dur(beat)   = start(next) - start(beat) ; last beat runs to audio end
```
### Aligned (accurate)
1. Transcribe narration → words with `start,end` (Whisper).
2. Normalise both transcript and script words (lowercase, strip punctuation,
   numbers→words optional).
3. Needleman-Wunsch / DTW alignment of script words to transcript words with
   substitution tolerance (TTS mispronunciations).
4. Beat start = start time of its first aligned word (skip to the first
   aligned word if the beat's first word was unmatched). If a beat has no
   aligned words, interpolate from neighbours and flag it.
5. Enforce min/max hold: if a beat exceeds maxHold, either split it (preferred)
   or insert an alternate image; if under minHold, merge with the neighbour.

## Clip render (per beat) — ffmpeg reference
```
render_dur = dur + T   (last clip: dur only)
ffmpeg -loop 1 -i IMG -t render_dur \
  -vf "scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160,\
zoompan=z='min(zoom+ZINC,ZOOM_TARGET)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30,\
format=yuv420p" -r 30 -c:v libx264 -preset veryfast -crf 18 -an clip.mp4
ZINC = (ZOOM_TARGET - 1) / round(render_dur*30)
```
**Always verify each clip's duration** (±0.25 s) before merging — a truncated
clip silently shortens the whole video (this bug happened; the check caught it).

## Crossfade merge — tree merge, not a chain
Merging clips one at a time re-encodes the growing file every step (O(n²)) and
becomes unusably slow past ~15 clips. Merge **pairwise** instead:
```
items = [(clip_i, len_i)]           # len_i includes the trailing T except the last
while len(items) > 1:
   for each adjacent pair (L, R):
       offset  = L.len - T
       new_len = offset + R.len
       ffmpeg -i L -i R -filter_complex "[0:v][1:v]xfade=transition=dissolve:duration=T:offset=offset[v]" -map [v] ... out
       verify probe(out) ≈ new_len (±0.5 s)
   carry an odd leftover to the next level
```
Six levels for 42 clips; total work ~n·log n. Result length == audio length.

## Browser equivalent (WebCodecs)
Don't port the ffmpeg filter graph literally; reproduce the *math*:
- For frame at time t: active beat b where start_b ≤ t < start_b + dur_b.
  Progress p = (t - start_b)/dur_b; zoom = 1 + (target-1)·p; draw image
  cover-cropped to the canvas, scaled by zoom about the centre (or focal point).
- Dissolve window: for t in [start_{b+1} - T, start_{b+1}], draw beat b, then
  beat b+1 with alpha = (t - (start_{b+1} - T))/T. (This is equivalent to the
  xfade offset math above.)
- Pan variants: translate by ±(zoom-1)·width·p.
- Encode every frame; never drop frames to "catch up" — the encoder is offline.

## Audio
- Mux narration as-is (`-c:a aac -b:a 160k`); `-shortest` against the video.
- Speed change: `atempo` (ffmpeg) chained within 0.5–2.0 per stage, or
  SoundTouch/rubberband for higher quality; recompute all beat times by ÷speed.
- Loudness: `loudnorm=I=-16:TP=-1.5:LRA=11` (two-pass for accuracy).

## End card + concat
Build the card with **the same fps and timebase** as the main video
(`-r 30 -video_track_timescale 15360`) and an audio track (silence) so the
concat demuxer can stream-copy: `-f concat -safe 0 -i list -c copy` then
`-fflags +genpts -c copy -movflags +faststart`. Mismatched timebases here
caused audible/visual glitches once; the explicit flags fixed it.

## Verification (every render)
- Full decode: `ffmpeg -v warning -i out.mp4 -map 0:v:0 -f null -` → no
  "non monotonic DTS", no errors.
- `duration == audio_duration + card_seconds` (±1 s ffmpeg / ±0.1 s browser).
- `-sseof -1` seek test succeeds (moov present, faststart).
- Spot-check frames at 5 timestamps and show them to the user.
- Print SHA-256.

## Cost/perf notes from the reference run (2-core sandbox)
- Zoompan at 4K source: ~17 s per 15-s clip → the biggest cost; a desktop is
  3–5× faster; the browser WebCodecs path is faster still (no 4K intermediate).
- Tree merge for 42 clips: ~4 minutes. Mux/card/concat/verify: ~1 minute.
