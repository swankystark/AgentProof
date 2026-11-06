# AgentProof Design System

## 1. Atmosphere & Identity

AgentProof feels like a calm payment operations room: legible under pressure, dense enough for investigations, and honest about what is verified. Its signature is a thin mint evidence line that connects agent decisions to sandbox payment state.

## 2. Color

| Role | Token | Light | Dark | Usage |
|---|---|---|---|---|
| Surface/primary | `--surface-primary` | `#f3f6f4` | `#101714` | Page background |
| Surface/secondary | `--surface-secondary` | `#ffffff` | `#17211c` | Panels |
| Surface/elevated | `--surface-elevated` | `#ffffff` | `#1d2923` | Focused cards |
| Text/primary | `--text-primary` | `#18241d` | `#ecf4ee` | Headlines and body |
| Text/secondary | `--text-secondary` | `#65736a` | `#a5b5aa` | Supporting copy |
| Text/tertiary | `--text-tertiary` | `#87948b` | `#74857a` | Metadata |
| Border/default | `--border-default` | `#dce5de` | `#2b3a31` | Dividers |
| Border/subtle | `--border-subtle` | `#e9efea` | `#223027` | Quiet boundaries |
| Accent/primary | `--accent-primary` | `#146b45` | `#6bd6a0` | Actions and evidence |
| Accent/hover | `--accent-hover` | `#0e5638` | `#8ae5b5` | Hover and focus |
| Status/success | `--status-success` | `#17834e` | `#6bd6a0` | Verified |
| Status/warning | `--status-warning` | `#a76012` | `#f2bd68` | Needs attention |
| Status/error | `--status-error` | `#bd423d` | `#ff8078` | Invariant failure |
| Status/info | `--status-info` | `#3471a7` | `#8ab9ec` | Informational |

## 3. Typography

Use system UI sans for product UI and a system monospace for IDs and trace values. Display 40/44, H1 30/36, H2 22/28, H3 17/24, body 14/22, small 12/18, labels 11/16 uppercase with 0.08em tracking.

## 4. Spacing & Shape

Base spacing unit is 4px. Use 8, 12, 16, 20, 24, 32, and 40px. Panel corners are 12px, controls 8px, pills fully rounded. Prefer tonal layers and fine borders over heavy shadows.

## 5. Components

Panels use a title, optional right-aligned action, and consistent 16px body inset. Status pills pair a text label with color. Evidence rows show a timestamp, event, and source. Data grids are reserved for trace/invariant records and include readable empty states. Buttons have primary, secondary, and danger variants with visible keyboard focus.

## 6. Motion

Use 140–220ms opacity/transform transitions for menus, panels, and status changes. Respect `prefers-reduced-motion`. Do not animate payment amounts or imply a payment completed before PayPal confirms it.

## 7. Accessibility & Content

Use semantic landmarks, explicit labels, keyboard-operable controls, and status text that does not depend on color alone. Distinguish configured, connected, and verified states. Keep money movement claims tied to PayPal evidence.
