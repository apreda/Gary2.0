# Gary website overview — 30 seconds

This is a **still-image website overview**, not a continuous screen recording or founder-led Loom. It assembles the three already-reviewed Product Hunt website gallery JPGs unchanged, in their existing order, with ten seconds per image. Their visible headings provide the captions; no new overlays, crops, fabricated interactions or app footage are added.

| Time | Existing image | Context retained |
| --- | --- | --- |
| 0–10 s | `../exports/01-find-your-game.jpg` | Real website example, September 7, 2026; not current picks. |
| 10–20 s | `../exports/02-read-the-reasoning.jpg` | Historical Mets–Marlins example; an excerpt, not the full analysis; confidence is not calibrated win probability. |
| 20–30 s | `../exports/03-check-the-record.jpg` | September 7 game-pick record, including losing windows; figures will change; props are separate. |

All three source images visibly retain their 21+ notices and outcome/wagering caveats. The historical record and match example are not September 13 results or newly checked advice. The small analysis excerpt is illustrative: viewers should open the website to read the complete original pick.

## Local output and verification

The verified output is [gary-website-overview-30s.mp4](gary-website-overview-30s.mp4): 1280 × 720, 30 fps, 900 frames, H.264/yuv420p, fast-start MP4, **silent**, 601,816 bytes. Completed September 8 at 10:05 AM Eastern. All three source images were visually inspected before assembly; ffprobe, full MP4 decode and before/after source hashes passed. No generated voice, music, founder footage, new raster images or platform watermark is used. Source JPGs are preserved byte-for-byte; ordinary video encoding compresses their representation in the MP4 and converts JPEG full-range color to standard video range without resizing.

Run from this folder with the existing Homebrew tools:

```sh
node assemble-overview.cjs
```

The script refuses to overwrite an existing output. It checks source dimensions and hashes, encodes the three ten-second segments, verifies the result with ffprobe, fully decodes the MP4, and prints a receipt. See [verification.json](verification.json) for the actual completed-run result. It does not contact any account, provider or production app.

A separate in-memory comparison checked the encoded samples at 5, 15 and 25 seconds against their respective source images: SSIM 0.999012, 0.999330 and 0.999318. This verifies the expected scene order and close encoding fidelity without writing new raster frames; it is not a hosted-player or Product Hunt preview check.

## Publication status

The assembly task created only the local file. The launch owner subsequently uploaded it once to the existing Gary A.I. YouTube channel on September 8 and published it **Unlisted** at [the verified video URL](https://youtu.be/DsPIea4KyD0). English timed captions from [the SRT](gary-website-overview-en.srt) are published. The saved Product Hunt gallery opens the video and rendered the captions during actual playback. YouTube's copyright check was still running at the last inspection; playback is not platform approval. Full settings and remaining notices are in [the extras receipt](../../PRODUCT_HUNT_EXTRAS_2026-09-08.md).

Suggested title: **Gary website overview: picks, reasoning and the public record**.

Suggested description: **A 30-second still-image overview of the Gary website using September 7, 2026 examples. Find a posted game pick, read the reasoning and inspect the public game-pick record, including losses. Historical examples, not current picks. 21+. Sports information; no wagers placed or guaranteed outcomes.**

The [existing gallery README](../README.md) and [submission packet](../../PRODUCT_HUNT_PACKET.md) remain the source for product fields, source URLs and the separately verified Product Hunt schedule. This local video does not change that schedule or establish platform approval.
