# Purge

A Firefox extension that lets you persistently remove any element from any webpage by Shift-clicking it.

Deletions are saved per website and reapplied automatically on every visit, so removed elements stay gone across page reloads and browser restarts.

## Features

- **Shift+Click** any element to remove it
- Hold Shift while hovering to highlight what will be removed before you click
- Deletions persist across reloads, scoped per website
- Undo the last deletion in the current session
- Reset all deletions for the current site
- Toggle **Show Hidden Elements** to temporarily reveal purged elements without affecting stored rules
- Toggle **Shift+Click to Delete** to pause deletion mode without showing hidden elements

## How It Works

When you Shift+Click an element, the extension generates a stable CSS selector for it and stores that selector under the current site's hostname. On every subsequent visit to that site, the extension queries the DOM at load time and removes all stored elements.

No cross-site data is ever shared or applied. Rules for `example.com` only run on `example.com`.

## Usage

| Action | How |
|---|---|
| Remove an element | `Shift+Click` the element |
| Undo last removal | Open the extension popup and click **Undo Last** |
| Clear all rules for this site | Open the extension popup and click **Reset Site** |
| Temporarily show purged elements | Open the popup and enable **Show Hidden Elements** |
| Pause deletion mode | Open the popup and disable **Shift+Click to Delete** |

## Popup Toggles

| Toggle | Effect |
|---|---|
| **Shift+Click to Delete** | Enables Shift+Click deletion and hover highlighting. Disabled automatically when Show Hidden Elements is on. |
| **Show Hidden Elements** | Restores all purged elements to the DOM without touching storage. Re-disabling re-hides them. Blocks deletion while active. |

## Permissions

- `storage` — saves deletion rules locally in your browser
- `activeTab` — reads the current page's hostname to scope rules correctly
- `scripting` — injects the content script that applies stored rules on page load

[Install Purge on Firefox](https://addons.mozilla.org/en-US/firefox/addon/purge/)
