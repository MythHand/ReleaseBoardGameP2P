# How the loader's sounds were made

Both sounds in `../` are synthesized from code — nothing in them is recorded. These are the
scripts that produced them (Python 3 + NumPy).

Third-party sounds were used only as examples of the frequency range: the loader's earlier,
borrowed sounds were measured for which frequencies they carry and how loud each band is over
time, and the scripts generate new sound to that shape. Those recordings are not part of this
repository.

| Script | Output | Run |
|---|---|---|
| `tick.py` | `tick.wav` | `python3 tick.py tick.wav` — the measured recipe is written into the script; this reproduces `tick.wav` exactly |
| `logo-theme.py` | `logo-theme.wav` | `python3 logo-theme.py <reference.f32> logo-theme.wav` — takes the band loudness, 20 ms at a time, from a reference recording; without that recording it documents how the sound was made but cannot rebuild it |
