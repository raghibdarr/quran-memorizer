---
name: Voice recognition accuracy limitations and native app path
description: Whisper-base is the ceiling for browser-based Quran voice recognition; native app can use whisper-large-v3 for much better accuracy
type: project
---

Browser voice recognition uses whisper-base (74M params, ~100MB download) which gives rough but imperfect accuracy. whisper-large-v3-Tarteel (1.5B params, ~1.5GB) exists and is much more accurate but too large for browser.

**Why:** Browser WASM is limited — can only run small quantized models. Native apps can use device NPUs to run large models efficiently.

**How to apply:** For the future native app (Play Store / App Store), plan to use whisper-large-v3-Tarteel running on-device via ONNX Runtime Mobile (Android) or Core ML (iOS). For the web app, keep whisper-base as supplementary feedback with self-assessment buttons as the primary mechanism. Server-side GPU inference is also an option if a backend is added later.
