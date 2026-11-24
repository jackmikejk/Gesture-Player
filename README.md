<p align="center">
  <img src="icon-512.png" alt="Gesture Player logo" width="120">
</p>

<h1 align="center">Gesture Player</h1>

<p align="center">
  A video player you control with your hands, built for dance practice.<br>
  <a href="https://jackmikejk.github.io/Gesture-Player/"><b>Open Gesture Player →</b></a>
</p>

Prop your iPad up, step back and practise. Pause, rewind, slow down or loop a section with a hand sign instead of walking back to the screen with sweaty hands.

## Features

- **Hand gestures** through the front camera (see the table below)
- **Dance-safe lock**: gestures stay off until you hold up ✌️, so dancing doesn't set anything off
- **Mirror video** so moves match your left and right
- **Loop a section**: tap Loop at the start, then Set end
- **3‑2‑1 countdown** before play
- **Speed** from 0.3× to 2× with normal pitch
- **Library** of your videos from Photos, Files or YouTube links; each one remembers its spot, speed, loop and mirror setting
- Follows light and dark mode, and works as a Home Screen app

## Gestures

| Gesture | Action |
|---|---|
| ✌️ Peace sign, hold 1 s | Wake the remote for 5 s (when the lock is on) |
| ✋ Open palm, hold | Play or pause |
| 👉 / 👈 Point right / left | Skip forward / back |
| ☝️ / 👇 Point up / down | Faster / slower |
| 👍 / 👎 Thumb up / down | Volume up / down |
| ✊ Fist, hold | Mute or unmute |

## Install on iPad or iPhone

1. Open the link in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. Open it from the Home Screen icon, add a video with **+**, then tap the camera button in the player and allow camera access.

It also works in recent Chrome and Edge on desktop or Android.

## Privacy

- **No accounts, no ads, no analytics, no tracking.**
- **The camera never leaves your device.** Hand tracking runs locally in your browser, and no images or video are recorded, stored or uploaded.
- **Your videos stay on your device.** They're saved in your browser's own storage for this app. Deleting the app or clearing website data removes them, so keep your originals.
- YouTube videos play through YouTube's official embedded player, which follows YouTube's own privacy policy.

## What it doesn't do

- It doesn't download videos from YouTube, Instagram or anywhere else.
- Instagram links can't be played. Save the reel to your device first, then add it from Photos.
- Some YouTube videos can't be played if their owner turned off embedding.

## How it works

One static web page with no build step and no server code:

- `index.html`: layout and styles
- `app.js`: player, library (IndexedDB) and gesture logic
- `vendor/mediapipe/`: Google's [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe) (v0.10.14, Apache 2.0) for hand landmarks and gestures, kept in this repo so the app doesn't depend on outside code
- A strict Content Security Policy limits what the page can load and where it can connect

## Credits and licence

Made by [jackmikejk](https://github.com/jackmikejk). Released under the [MIT License](LICENSE).

Hand tracking by MediaPipe © Google, used under the Apache License 2.0 ([`vendor/mediapipe/LICENSE`](vendor/mediapipe/LICENSE)).

Found a problem? See [SECURITY.md](SECURITY.md) for security issues, or open an issue for anything else.
