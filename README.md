# Track Changes for Obsidian

Review edits without losing the text you replace. Additions appear underlined, deletions appear struck through, and the sidebar lets you accept or reject individual changes or all changes. The accepted version is separate from the revision archive: accepting an edit never removes its history.

## Features

- Inline tracking in Markdown Source mode and Live Preview.
- Review sidebar with Accept / Reject per change and Accept all / Reject all.
- Automatic snapshots after 800 ms of inactivity, or at most 5 seconds during continuous typing; disk save events also capture changes.
- Named checkpoints before a significant rewrite.
- Persistent, compressed, full-text revisions with no automatic expiration, revision-count limit, or archive-size limit.
- Revisions and accepted baselines persist across app restarts.
- Track note and folder renames while Obsidian is running; retain deleted notes in the archive.
- Browse all tracked notes, including deleted notes, with search and paged history.
- Compare any saved revision to its predecessor, restore it after confirmation, or recover it as a separate note.
- Save the current text before rejection or restoration. Refuse a replacement if the note changed while you were reviewing it.
- External archive separated by vault, so uninstalling the plugin does not delete its history.

## Install

Desktop Obsidian 1.5 or later is required.

With [BRAT](https://github.com/TfTHacker/obsidian42-brat), add `neuronsarealsocool/obsidian-track-changes` as a beta plugin. GitHub releases include `main.js`, `manifest.json`, and `styles.css` as direct assets. If the repository is private, use an authenticated manual download; public BRAT access may require making the repository public.

For a manual installation, create `.obsidian/plugins/track-changes/` inside your vault, copy those three release files into it, and enable **Track Changes** in Community plugins. The AI-ready release zip also includes source, tests, build files, and compiled plugin files in one top-level folder.

## Use

1. Enable the plugin. It creates a first accepted version of each Markdown note as it scans the vault. It cannot reconstruct edits made before it was installed.
2. Open **Track Changes: Review tracked changes and history** from the command palette, or select the history ribbon icon.
3. Edit a note normally. The sidebar groups differences from its last accepted version. Select Accept to keep a change in that accepted version; Reject puts the earlier text back.
4. Use **Save a named checkpoint** before rewriting a section. Checkpoints remain in the revision list even if the text did not change.
5. Select a revision to inspect its diff. **Recover as copy** creates a separate note; **Restore this version** saves the present text before replacing it.
6. Select **Browse all notes** to find a deleted note and recover a copy.

Tracked highlights are visual decorations: they are never inserted into your Markdown. Reading view and published notes show the actual document text.

## Storage and limits

By default, archives live in `~/Obsidian Track Changes History/<vault-id>/`. Choose a different absolute directory in settings. Reload the plugin after a directory change; move the existing vault-id folder manually if you want to preserve continuity. Moving or renaming the vault itself changes its vault identifier; keep the old archive and migrate its subfolder if necessary.

Each revision is a self-contained gzip-compressed JSON file with the full note text, accepted baseline, timestamp, event kind, and note identity. A revision is written to a unique temporary file, flushed, and renamed into place before the in-memory state advances. No automatic pruning is performed. Storage errors are visible in notices and the status bar; the plugin does not silently overwrite older revisions. Corruption is reported, and unreadable files are left in place for recovery.

“Unlimited history” means **no automatic retention limit**, not infinite disk capacity or guaranteed capture of every keystroke. History grows as you write, and it needs a separate backup to protect against drive failure, deletion, or sync problems. Text in the archive is compressed, not encrypted; it is as private as the directory you store it in. The plugin makes no network requests and does not upload note text to GitHub.

Only `.md` notes are tracked. Attachments, canvases, and other file types are not archived. Snapshots within the debounce window can be lost on a sudden crash or forced shutdown. Obsidian does not await asynchronous plugin-unload hooks; use **Refresh** in the sidebar to flush pending edits before disabling the plugin. Edits made while Obsidian is closed can only be captured as the next observed version. Offline renames are seen as deletion plus a new note. Documents created and deleted before their initial capture cannot be recovered by this plugin.

This is a local single-vault review workflow, without collaborator attribution or a Google Docs collaboration server. Inline diffing is disabled above 150,000 combined characters to keep the editor responsive; full history still works. For combined versions above 400,000 characters, or if the diff times out, a reversible whole-note replacement is used. The sidebar shows up to 100 pending changes at a time and 30 history revisions per page; this does not limit stored history.

Your existing Edit History plugin can remain installed and keeps its own independent archive. Track Changes does not import or alter its data.

## Development

```sh
npm ci
npm test
npm run build
```

Tests cover exact diff reconstruction, Unicode and CRLF, randomized edits, large-note fallback, restart persistence, baseline acceptance, duplicate suppression, concurrent saves, rename/delete/recreation identities, corruption, failed writes, and path validation. Test archives stay under ignored `tests/.runtime/` in the source project.

## Recovery format

Each document has its own UUID directory containing `<monotonic-timestamp>-<uuid>.json.gz`. Decompress any individual file with a gzip utility and read its `content` field to recover that complete version without Obsidian. `baseline` is the accepted text at that revision; `aliases` records observed names. Keep the complete archive folder in backups.

## License

MIT.
