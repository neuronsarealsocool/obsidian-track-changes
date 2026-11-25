# Track Changes for Obsidian

Keep a permanent local revision archive and browse the history of individual changed paragraphs. Old text appears struck through; current text keeps its normal appearance without red/green colors or addition underlines. Hover over changed text to reveal **This area's revisions**. Previous / Next revision preview older and newer text in the same area of the note. Choose Use this revision to keep a displayed version.

## Features

- Inline revision markers in Markdown Source mode and Live Preview.
- Hover-only history boxes with Previous revision and Next revision controls. Only one box is shown, and hidden boxes leave no blank space.
- Struck-through old text marks a changed area. No Accept / Reject workflow or colored diff fills.
- Preview historical text in place while the current saved text remains intact. Cancel, Escape, moving away, or returning to the current revision restores the current display. Use this revision applies only that area and saves the preceding note first.
- Separate revision areas for separate paragraphs, including multi-paragraph pastes and deletions.
- Revision sidebar with full-note comparisons, named checkpoints, restoration, and recovery as a copy.
- Automatic snapshots after 800 ms of inactivity, or at most 5 seconds during continuous typing; disk save events also capture changes.
- Persistent, compressed, full-text revisions with no automatic expiration, revision-count limit, or archive-size limit.
- Track note and folder renames while Obsidian is running; retain deleted notes in the archive.
- Browse all tracked notes, including deleted notes, with search and paged history.
- External archive separated by vault, so uninstalling the plugin does not delete its history.

## Install

Desktop Obsidian 1.5 or later is required.

With [BRAT](https://github.com/TfTHacker/obsidian42-brat), add `neuronsarealsocool/obsidian-track-changes` as a beta plugin. The repository is public. GitHub releases include `main.js`, `manifest.json`, and `styles.css` as direct assets.

For a manual installation, create `.obsidian/plugins/track-changes/` inside your vault, copy those three release files into it, and enable **Track Changes** in Community plugins. The AI-ready release zip also includes source, tests, build files, and compiled plugin files in one top-level folder.

## Use

1. Enable the plugin. It records a first comparison version of each Markdown note as it scans the vault. It cannot reconstruct edits made before it was installed.
2. Edit a note normally in Source mode or Live Preview. Old text appears struck through, and current text appears normally. Hover either the struck-through text or changed current text to open **This area's revisions**. The box stays open while you move onto its buttons and closes shortly after you move away from both the text and the box. Moving the text cursor into a change does not open it.
3. Select **Previous revision / Next revision** to temporarily replace that area's on-screen text with a historical version. The current document, autosaves, and archive stay unchanged while browsing. Strikethrough shows current text that differs from the selected version; selected revision text appears normally. To apply the displayed version, choose **Use this revision**. **Cancel preview**, Escape, moving away, or Next back to Current text restores the current display. Other paragraphs remain unchanged.
4. Use **Save a named checkpoint** before rewriting a section. Checkpoints remain in the revision list even if the text did not change.
5. Open **Track Changes: Browse revision history** from the command palette or the history ribbon icon for the complete revision browser. Select a revision to inspect its diff. **Recover as copy** creates a separate note; **Restore this version** saves the present text before replacing it.
6. Select **Browse all notes** to find a deleted note and recover a copy.

Revision markers are editor decorations: they are never inserted into your Markdown or included in copies of its text. Reading view and published notes show the actual document text. Toggle **Inline revision markers and history boxes** in settings to hide or show both.

Updating to 0.6.0 preserves existing comparison baselines and archived revisions. Old text is compared against that baseline, which is the first captured version for new notes or the previously accepted version for notes reviewed in older releases. Removing Accept / Reject controls does not reset or erase that state.

## Storage and limits

By default, archives live in `~/Obsidian Track Changes History/<vault-id>/`. Choose a different absolute directory in settings. Reload the plugin after a directory change; move the existing vault-id folder manually if you want to preserve continuity. Moving or renaming the vault itself changes its vault identifier; keep the old archive and migrate its subfolder if necessary.

Each revision is a self-contained gzip-compressed JSON file with the full note text, accepted baseline, timestamp, event kind, and note identity. A revision is written to a unique temporary file, flushed, and renamed into place before the in-memory state advances. No automatic pruning is performed. Storage errors are visible in notices and the status bar; the plugin does not silently overwrite older revisions. Corruption is reported, and unreadable files are left in place for recovery.

“Unlimited history” means **no automatic retention limit**, not infinite disk capacity or guaranteed capture of every keystroke. History grows as you write, and it needs a separate backup to protect against drive failure, deletion, or sync problems. Text in the archive is compressed, not encrypted; it is as private as the directory you store it in. The plugin makes no network requests and does not upload note text to GitHub.

Only `.md` notes are tracked. Attachments, canvases, and other file types are not archived. Snapshots within the debounce window can be lost on a sudden crash or forced shutdown. Obsidian does not await asynchronous plugin-unload hooks; use **Refresh** in the sidebar to flush pending edits before disabling the plugin. Edits made while Obsidian is closed can only be captured as the next observed version. Offline renames are seen as deletion plus a new note. Documents created and deleted before their initial capture cannot be recovered by this plugin.

This is a local single-vault review workflow, without collaborator attribution or a Google Docs collaboration server. Inline diffing is disabled above 150,000 combined characters to keep the editor responsive; full history still works. For combined versions above 400,000 characters, or if the diff times out, a reversible whole-note replacement is used. The sidebar shows 30 history revisions per page; this does not limit stored history.

Your existing Edit History plugin can remain installed and keeps its own independent archive. Track Changes does not import or alter its data.

### Area revision browsing

The popup follows the hovered paragraph backward through adjacent full-note snapshots. Blank lines separate paragraphs; ordinary soft line breaks within a paragraph stay together. Paragraphs are aligned before their words are compared, so a pasted block or paragraph split produces independent review areas. Preview and restore ranges are bounded to each paragraph. Deleted paragraphs retain their own accepted-text origins, including when several paragraphs were deleted at once.

Area history adjusts boundaries when text before the paragraph is inserted or deleted and skips consecutive snapshots where only other parts of the note changed. Older snapshots are read on demand; reopening the popup starts at the current text. A return to a formerly used value remains a separate revision. If an older version cannot isolate a single paragraph safely, the popup explains that and leaves the full snapshot available in note history.

Historical text is shown as a temporary, read-only replacement in the editor, including older continuation lines. It is not written into the note, undo history, or revision archive while browsing. To start editing, cancel the preview first; a typing, paste, cut, or drop attempt also cancels it without applying that first input. Incoming document changes cancel the preview and preserve the new current text. The preview is removed when the review box closes, the highlighted area changes, or the plugin unloads.

The in-place preview uses neutral text while you browse. Strikethrough marks current text that would be removed, selected revision text appears normally, and unchanged text stays neutral. The comparison is temporary; Use this revision applies only the selected revision's text, without the struck-through comparison text.

If an older rewrite crosses an area's non-whitespace boundaries, or repeated text makes the match ambiguous, browsing stops and explains why. It does not substitute a whole document or another paragraph. The complete snapshot is still available in the sidebar's full-note revision history. Browsing also stops at the point where an inserted area did not yet exist. Hovering a deletion follows the removed text at its insertion point rather than taking the surviving paragraph beside it.

**Use this revision** changes only the area's current boundaries. The rest of the current note, including other pending edits, is preserved. The comparison baseline stays unchanged, so restored text may retain revision markers.

## Development

### 0.1.2 startup fixes

- Restored sidebar and Markdown leaves can be deferred by Obsidian. Refresh skips views that are not loaded yet, preventing `leaf.view.requestRefresh is not a function` during startup and file-open events.
- The archive scan starts after the workspace layout is ready and the plugin startup hook returns. The status bar shows loading until tracking is ready.
- Unloading cancels scheduled initialization or waits for initialization already in progress before handing off pending saves.
- Inline decorations reuse their previous diff when the text, comparison baseline, and marker setting are unchanged.
- Regression tests cover deferred views, startup scheduling, and unloading before or during initialization.

```sh
npm ci
npm test
npm run build
```

Tests cover exact diff reconstruction, Unicode and CRLF, randomized edits, large-note fallback, restart persistence, baseline acceptance, duplicate suppression, concurrent saves, rename/delete/recreation identities, corruption, failed writes, and path validation. Test archives stay under ignored `tests/.runtime/` in the source project.

## Recovery format

Each document has its own UUID directory containing `<monotonic-timestamp>-<uuid>.json.gz`. Decompress any individual file with a gzip utility and read its `content` field to recover that complete version without Obsidian. `baseline` is the comparison text at that revision (the accepted text in earlier releases); `aliases` records observed names. Keep the complete archive folder in backups.

## License

MIT.
