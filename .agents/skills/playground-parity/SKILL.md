---
name: playground-parity
description: "Use when an application implementation must match its playground or Storybook reference exactly, including visual appearance, interactions, animations, responsive states, or requests for 100 percent or 1:1 parity."
---

# Playground Parity

Playground is the reference for observable appearance, behavior, and animations. The goal is 100% parity across explicitly listed scenes and conditions. Record confirmed differences as DIFFERENT and unchecked cases as UNVERIFIED. Partial coverage cannot establish complete parity.

## Scope

Identify the project, revisions, startup commands, playground/Storybook, reference scenes, and corresponding application routes. Read project instructions and reference scene sources. For a named component, cover all its reference variants and transitions; without a narrower scope, cover the available playground. Clarify an ambiguous reference while continuing independent checks.

## Two steps by default

1. **Find differences.** Compare using the matrix below before changing the implementation. Record confirmed differences, reproduction steps, and original evidence; list unchecked cases separately. Give a brief progress update with the findings, then proceed to fixes.
2. **Fix differences.** Fix every confirmed difference in the implementation, keeping playground as the reference. Replay the original scenarios and checks affected by each fix. Continue fixing and rechecking remaining differences until MATCH or a concrete blocker. The final report must show what was found, what was fixed, and what repeat verification confirmed.

Invoking this skill includes both steps by default; a separate request to fix is unnecessary. If the user explicitly requests an audit only or prohibits changes, perform step one and report. Change the reference only at the user's explicit request. Limit changes to the identified differences; unrelated refactoring, publishing, and deployment are outside this workflow.

## Coverage matrix and browser

Before checking, build a matrix: scene → state/gesture → viewport/theme/locale → application route → appearance/behavior/animation → evidence → result.

Derive coverage from playground: initial and final states, hover/focus/disabled, keyboard input, outside clicks, scrolling, drag-and-drop with actual release and cancellation, empty/long data, errors, and responsive variants where the reference defines them. Include container boundary sizes and transitions across responsive breakpoints. Report checked entries alongside the total; never drop entries to obtain a passing result.

Run both versions in a real browser using available automation. In the application, reproduce the same scenario through the real route, data, and handlers. A debug page helps deterministic reproduction; verify the normal application screen separately. A shared component import and passing unit tests do not prove integration.

## Appearance and animations

Match browser/OS, viewport, DPR, zoom, fonts, theme, locale, data, state, scroll, and pointer position. Wait for resources to load. Define the comparison region in advance; check geometry relative to the container and include portal elements/overlays. Preserve original PNGs from both versions.

For exact comparison, use Python with Pillow and [scripts/compare_screenshots.py](scripts/compare_screenshots.py):

```sh
python3 /path/to/playground-parity/scripts/compare_screenshots.py playground.png implementation.png --output-dir evidence/menu-open
```

The script compares RGBA without tolerance: exit 0 is MATCH, 1 is DIFFERENT, and 2 is UNVERIFIED. It saves JSON, a difference map, and an overlay. If Pillow is unavailable, use an available environment with Pillow or an equivalent exact pixel comparison.

Matching image dimensions and changed_pixels=0 are required for a visual MATCH. Investigate every differing pixel; eliminate rendering noise through identical conditions. Thresholds, masks, resizing, blurring, hiding elements, disabling animations, or updating the reference cannot establish 100% parity. Mark unresolved uncertainty as UNVERIFIED.

For animations, compare the start, intermediate frames, completion, duration, delays, easing, trajectory, event order, and response to repetition/interruption. A matching final frame does not prove a matching transition. Identical interactions must produce identical visible states, focus, action availability, and side effects.

## Result

| Status | Condition |
| --- | --- |
| MATCH | Every entry in the declared matrix was checked and matched, with evidence saved |
| DIFFERENT | A reproducible difference exists; unchecked entries are listed separately |
| UNVERIFIED | No difference is confirmed, but coverage gaps or uncertainty remain |

Start the final report with the current overall status and coverage after fixes, then provide the results matrix. For each identified difference, include the scene, route, conditions/steps, expected and original actual behavior, fix and verified code location, before/after evidence, and repeat-check result. Retain fixed findings in the report. Finish with remaining differences, unchecked entries, and concrete blockers/next actions. Claim "100% parity" only for the complete declared matrix with an overall MATCH; make no guarantees beyond that scope.
