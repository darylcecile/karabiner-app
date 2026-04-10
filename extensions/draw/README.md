# Draw

Draw adds first-party tldraw support to Karabiner.

## What it adds

- **Inline editor block**: creates a new `.tldraw` file and inserts a link into the active note.
- **File preview handler**: opens `.tldraw` files in a dedicated preview tab.

## Permissions

- `notes.write`: insert links into the active editor.
- `filesystem.read` (`$workspace`): read `.tldraw` files from your current workspace.
- `filesystem.write` (`$workspace`): create new `.tldraw` files in your current workspace.
