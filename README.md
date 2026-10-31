# Spectrumizer Card

**Current version: 2.0.2**

A custom Lovelace dashboard card for the [Spectrumizer Home Assistant integration](https://github.com/arnenys89/Spectrumizer). It displays the live FFT spectrum and a waterfall spectrogram of recent history, with interactive pan and zoom.

## Installation with HACS

1. Open **HACS → ⋮ → Custom repositories**.
2. Add `https://github.com/arnenys89/spectrumizer-card` and select **Dashboard** as the category.
3. Find **Spectrumizer Card** in HACS and install it.
4. Reload the Home Assistant dashboard (and clear the browser cache if the old version remains visible).
5. Add a manual card or use the visual card picker.

HACS installs the card resource. Updates are delivered through HACS releases; install an available update in HACS to receive the new version.

## Configuration

```yaml
type: custom:spectrumizer-card
entity: sensor.spectrum
name: Live spectrum
# Optional: maximum frequency displayed in Hz
# max_frequency: 2000
# Optional: number of history frames, from 1 to 80
history_frames: 80
```

Replace `sensor.spectrum` with the entity ID created by your Spectrumizer integration.

## Requirements

- Home Assistant
- [Spectrumizer integration](https://github.com/arnenys89/Spectrumizer) providing `frequencies`, `magnitudes`, `sampling_rate_hz` and `history` attributes.
