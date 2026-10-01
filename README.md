# Clean Gmail

A Chrome extension that turns Gmail into a calm, centered, single-column inbox.
It only changes how Gmail looks: no new features, no network calls, and it never reads or sends your mail anywhere.

## What it changes

**Inbox**
- One centered column, with the width you choose.
- Letter avatars in a stable color per sender.
- Date-group labels: *Yesterday*, *This month*, then month names and years.
- Rounded rows that highlight on hover, with the star moved to the right.
- No checkboxes or message previews by default. Both can be turned back on.

**Everywhere**
- The Mail / Chat / Meet rail and the right side panel (Calendar, Keep, Tasks) are hidden.
- The hamburger switches between Gmail's normal sidebar and no sidebar at all.
- The Gemini buttons, the "Summarize this email" chip and the Workspace logo are hidden.
- Support, Settings and the apps grid only appear while you hover the header.
- Compose becomes a round button in the bottom-right corner.
- Open emails are centered, with a larger subject line.

## Customize

Click the **⚙ Customize** pill next to your avatar. Settings are saved through `chrome.storage.sync`, so they follow your Chrome profile.

| Setting | Options |
| --- | --- |
| On / off | Turns the whole restyle on or off without uninstalling it |
| Content width | 480–1600 px, using the slider or the px box, with Narrow (640), Medium (760) and Wide (900) presets |
| List text size | 11–22 px |
| Email text size | 11–22 px. Applies to plain-text and Gmail-written emails; designed HTML emails keep their own sizes so their layout doesn't break |
| Row spacing | Compact or comfy |
| Show | Avatars, date groups, message preview, checkboxes |
| Header icons | Shown on hover, or always |
| Row hover color | Any color |

**Reset to defaults** at the bottom of the panel puts everything back.

## Install

The extension isn't on the Chrome Web Store, so you load it from this folder:

1. Clone this repo.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the cloned folder.
4. Reload any open Gmail tab.

To update it, `git pull`, click ↻ on the extension's card in `chrome://extensions`, and reload Gmail.

## How it works

| File | Role |
| --- | --- |
| `manifest.json` | Manifest V3. Runs one content script on `mail.google.com` and asks for the `storage` permission only |
| `content.css` | All of the styling, scoped under `html.sg` so the on/off switch can remove it in one step |
| `content.js` | Applies your settings as CSS variables and `sg-*` classes on `<html>`, tags inbox rows with avatar and date-group data attributes, and builds the Customize panel |

A few things worth knowing before you edit:

- **The panel uses no `innerHTML`.** Gmail enforces Trusted Types, so the panel is built with DOM calls inside a shadow root. The shadow root also keeps Gmail's styles out of the panel.
- **Gmail re-renders all the time.** A `MutationObserver` re-applies the row decorations and puts the Customize pill back after each burst of changes, at most once per animation frame.
- **Selectors are best-effort.** Gmail's class names are obfuscated and change without notice, so the CSS prefers `role`, `gh` and `aria-label` attributes and uses classes only where nothing else works.

## Known limitations

- **Gmail updates can break parts of the styling.** When something looks off after a Gmail update, a renamed class is the usual cause. Inspect the element and update its selector in `content.css`.
- **Avatars are letters, not photos.** Gmail doesn't include profile pictures in the inbox list.
- **Some selectors assume Gmail is in English**, because they match `aria-label` text such as "Main menu" or "Google Account".
- **Only the default light theme** has been styled so far.
