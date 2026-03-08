---
name: theming
description: Design language, theme tokens, layout rules, and component patterns for the Karabiner app. Covers VSCode-inspired UI structure, Tailwind CSS v4 theme system with light/dark/auto modes, file tree with git status indicators, tabbed editor with diff rendering via @pierre/diffs, and the secondary context panel. Use this skill when building or styling any UI component.
license: MIT
metadata:
  framework: tailwindcss-v4
  design-system: vscode-inspired
---

# Karabiner App — Theming & Design Language

This document defines the visual design language, layout architecture, component patterns, and theming rules for the Karabiner desktop app. The app is a window that hosts coding agent harnesses (like OpenCode), with a VSCode-inspired interface built in React + Tailwind CSS v4 running inside Electrobun.

## Design Philosophy

- Mirror VSCode's visual language — users should feel immediately at home
- Fully Tailwind CSS v4 utility-driven; no CSS modules, no styled-components
- All colors are defined as CSS custom properties in `src/mainview/index.css` via `@theme`
- Support three color modes: **dark** (default), **light**, and **auto** (follows system)
- Use semantic token names, not raw hex values, in all components
- Pixel-perfect attention to spacing, borders, and subtle separators

## Color Mode System

### How It Works

The `<html>` element controls color mode via CSS classes:

| Class on `<html>` | Behavior |
|---|---|
| (none) | Auto — follows `prefers-color-scheme` |
| `class="dark"` | Force dark mode |
| `class="light"` | Force light mode |

Dark is the default theme (defined in `@theme`). Light overrides are applied via `.light` class and via `@media (prefers-color-scheme: light)` for auto mode.

### Implementation Pattern

```tsx
// Theme switcher utility
type ColorMode = 'auto' | 'light' | 'dark';

function setColorMode(mode: ColorMode) {
  const html = document.documentElement;
  html.classList.remove('light', 'dark');
  if (mode !== 'auto') {
    html.classList.add(mode);
  }
}
```

### Rules

- NEVER use raw hex colors in JSX — always use the theme tokens via Tailwind utilities
- NEVER use Tailwind's built-in `dark:` variant — our system uses CSS custom properties that switch automatically
- All components automatically adapt to the current mode through CSS variables

## Layout Architecture

The app follows VSCode's layout structure exactly:

```
+-------+------------------+-------------------------+----------------+
| Title Bar (drag region, window controls)                            |
+-------+------------------+-------------------------+----------------+
|       |  Tab Bar         |                         |                |
| A     +------------------+  Context Panel          |                |
| c     |                  |  (MCPs, LSP,            |                |
| t     |  File Tree       |   Modified Files,       |                |
| i     |  (Sidebar)       |   Context Info)         |                |
| v     |                  |                         |                |
| i     |                  +-------------------------+                |
| t     |                  |                                          |
| y     |                  |  Main Editor Panel                      |
|       |                  |  (OpenCode instance / Diff viewer)      |
| B     |                  |                                          |
| a     |                  |                                          |
| r     |                  |                                          |
+-------+------------------+------------------------------------------+
| Status Bar                                                          |
+---------------------------------------------------------------------+
```

### Layout Regions

| Region | Token | Width/Height | Description |
|---|---|---|---|
| Title Bar | `bg-titlebar` | `h-[--spacing-titlebar-height]` (30px) | Window drag region, app title, window controls |
| Activity Bar | `bg-activitybar` | `w-[--spacing-activitybar-width]` (48px) | Icon rail for switching sidebar views |
| Sidebar (File Tree) | `bg-sidebar` | `w-[--spacing-sidebar-width]` (240px) | File explorer tree with git status |
| Tab Bar | `bg-tab-bar` | `h-[--spacing-tab-height]` (35px) | Editor tabs, one per open file/diff |
| Main Editor Panel | `bg-editor` | Fills remaining space | OpenCode harness or diff viewer |
| Context Panel | `bg-context-panel` | `w-[--spacing-context-panel-width]` (300px) | Secondary panel: MCPs, LSP, modified files |
| Status Bar | `bg-statusbar` | `h-[--spacing-statusbar-height]` (22px) | Status info, git branch, notifications |

### Layout Implementation

```tsx
// Root layout shell — use CSS Grid for the full viewport
<div className="grid h-screen w-screen grid-rows-[var(--spacing-titlebar-height)_1fr_var(--spacing-statusbar-height)] grid-cols-1 overflow-hidden bg-bg">
  {/* Title Bar */}
  <header className="bg-titlebar text-titlebar-fg flex items-center px-4 electrobun-webkit-app-region-drag">
    <span className="text-[length:--font-size-sm]">Karabiner</span>
  </header>

  {/* Main content area */}
  <div className="grid grid-cols-[var(--spacing-activitybar-width)_var(--spacing-sidebar-width)_1fr_var(--spacing-context-panel-width)] overflow-hidden">
    <ActivityBar />
    <Sidebar />
    <EditorArea />
    <ContextPanel />
  </div>

  {/* Status Bar */}
  <footer className="bg-statusbar text-statusbar-fg flex items-center px-2 text-[length:--font-size-xs]">
    <span>main</span>
  </footer>
</div>
```

### Resizable Panels

The sidebar and context panel should be resizable via drag handles. Use a 1px separator element:

```tsx
<div
  className="w-[--spacing-panel-gap] cursor-col-resize bg-separator hover:bg-border-active transition-colors"
  onMouseDown={handleDragStart}
/>
```

## Component Patterns

### File Tree

The file tree mirrors VSCode's Explorer sidebar. Each node shows:
- Chevron icon for expand/collapse (folders)
- File/folder icon
- File name
- Git status indicator (colored letter badge on the right)

#### Git Status Decorations

| Status | Color Token | Label | Example |
|---|---|---|---|
| Modified | `text-git-modified` | M | File content changed |
| Added | `text-git-added` | A | New file staged |
| Deleted | `text-git-deleted` | D | File deleted |
| Untracked | `text-git-untracked` | U | New untracked file |
| Renamed | `text-git-renamed` | R | File renamed |
| Conflict | `text-git-conflict` | C | Merge conflict |
| Ignored | `text-git-ignored` | (dimmed) | Gitignored file |

#### File Tree Item Pattern

```tsx
<div
  className={cn(
    "flex items-center h-[22px] px-2 cursor-pointer text-[length:--font-size-sm]",
    isSelected ? "bg-list-active text-list-active-fg" : "hover:bg-list-hover"
  )}
  style={{ paddingLeft: `${depth * 16 + 8}px` }}
>
  {/* Chevron for folders */}
  {isFolder && <ChevronIcon className="w-4 h-4 mr-0.5 text-fg-muted" expanded={isExpanded} />}

  {/* File/folder icon */}
  <FileIcon className="w-4 h-4 mr-1.5 shrink-0" filename={name} />

  {/* Name */}
  <span className="truncate flex-1 text-sidebar-fg">{name}</span>

  {/* Git status badge */}
  {gitStatus && (
    <span className={cn("ml-auto text-[length:--font-size-xs] font-medium", gitStatusColor(gitStatus))}>
      {gitStatusLabel(gitStatus)}
    </span>
  )}
</div>
```

#### Tree Indent Guides

```tsx
// Vertical indent guide lines (one per depth level)
<div
  className="absolute left-0 top-0 bottom-0 w-px bg-tree-indent-guide"
  style={{ left: `${depth * 16 + 12}px` }}
/>
```

#### Folder Decoration

When any file inside a folder has been modified, the folder should also show the status color on its name (propagated from children), matching VSCode behavior.

### Tabs

Tabs sit above the editor area. Active tab has a colored top border and opaque text.

```tsx
<div className="flex h-[--spacing-tab-height] bg-tab-bar items-end overflow-x-auto">
  {tabs.map(tab => (
    <div
      key={tab.id}
      className={cn(
        "flex items-center h-full px-3 gap-1.5 min-w-0 text-[length:--font-size-sm] border-r border-tab-border cursor-pointer",
        tab.isActive
          ? "bg-tab-active text-tab-active-fg border-t-2 border-t-tab-active-border-top"
          : "bg-tab-inactive text-tab-inactive-fg hover:bg-tab-hover"
      )}
    >
      <FileIcon className="w-4 h-4 shrink-0" filename={tab.filename} />
      <span className="truncate">{tab.filename}</span>

      {/* Modified dot */}
      {tab.isModified && (
        <span className="w-2.5 h-2.5 rounded-full bg-tab-modified shrink-0" />
      )}

      {/* Close button (appears on hover or when active) */}
      <button className="w-4 h-4 shrink-0 rounded-sm hover:bg-bg-surface flex items-center justify-center">
        <XIcon className="w-3 h-3" />
      </button>
    </div>
  ))}
</div>
```

### Diff Viewer (using @pierre/diffs)

When a user clicks a modified file in the tree, open a tab showing the diff using `@pierre/diffs`.

#### Installation

```bash
bun add @pierre/diffs
```

#### React Components

Import from `@pierre/diffs/react`:

| Component | Use Case |
|---|---|
| `MultiFileDiff` | Compare two file versions (old/new `FileContents` objects) |
| `PatchDiff` | Render from a unified patch string |
| `FileDiff` | Render from pre-parsed `FileDiffMetadata` |
| `File` | Render a single file with syntax highlighting (no diff) |
| `WorkerPoolContextProvider` | Wrap tree for worker-based syntax highlighting |

#### Basic Diff Usage

```tsx
import { MultiFileDiff, WorkerPoolContextProvider } from '@pierre/diffs/react';

function DiffTab({ oldContent, newContent, filename }: DiffTabProps) {
  return (
    <WorkerPoolContextProvider>
      <MultiFileDiff
        oldFile={{ name: filename, contents: oldContent }}
        newFile={{ name: filename, contents: newContent }}
        options={{
          diffStyle: 'split',           // 'split' | 'unified'
          diffIndicators: 'bars',       // 'bars' | 'classic' | 'none'
          lineDiffType: 'word-alt',     // 'word-alt' | 'word' | 'char' | 'none'
          overflow: 'scroll',           // 'scroll' | 'wrap'
          theme: {
            dark: 'pierre-dark',
            light: 'pierre-light',
          },
          themeType: 'system',          // 'system' | 'light' | 'dark'
        }}
        className="h-full"
      />
    </WorkerPoolContextProvider>
  );
}
```

#### Patch Diff Usage

```tsx
import { PatchDiff } from '@pierre/diffs/react';

function PatchTab({ patch }: { patch: string }) {
  return (
    <PatchDiff
      patch={patch}
      options={{
        diffStyle: 'unified',
        theme: { dark: 'pierre-dark', light: 'pierre-light' },
        themeType: 'system',
      }}
    />
  );
}
```

#### Key Types

```typescript
interface FileContents {
  name: string;       // Filename (used for header display and language detection)
  contents: string;   // Raw file text
  lang?: string;      // Override syntax highlighting language
  cacheKey?: string;  // Cache key for worker pool optimization
}

interface FileDiffOptions {
  diffStyle?: 'unified' | 'split';           // Default: 'split'
  diffIndicators?: 'classic' | 'bars' | 'none';  // Default: 'bars'
  lineDiffType?: 'word-alt' | 'word' | 'char' | 'none';  // Default: 'word-alt'
  overflow?: 'scroll' | 'wrap';              // Default: 'scroll'
  theme?: string | { dark: string; light: string };
  themeType?: 'system' | 'light' | 'dark';  // Default: 'system'
  disableLineNumbers?: boolean;
  disableFileHeader?: boolean;
  collapsed?: boolean;
  expandUnchanged?: boolean;
  hunkSeparators?: 'simple' | 'metadata' | 'line-info' | 'line-info-basic';
}
```

#### Theming Integration

`@pierre/diffs` is built on Shiki and adapts to any Shiki theme. It ships with `pierre-dark` and `pierre-light` themes that complement our VSCode-inspired design. Use `themeType: 'system'` so diffs automatically follow the app's color mode.

For custom header content in diff views (e.g., revert button, copy path):

```tsx
<MultiFileDiff
  oldFile={oldFile}
  newFile={newFile}
  renderHeaderMetadata={() => (
    <div className="flex items-center gap-2">
      <button className="text-fg-secondary hover:text-fg text-[length:--font-size-xs]">
        Copy Path
      </button>
    </div>
  )}
/>
```

### Context Panel (Secondary Panel)

The context panel sits to the right of the editor and displays supplementary information. It contains collapsible sections:

1. **Modified Files** — list of files changed in the current session, with git status badges
2. **MCP Servers** — connected MCP server status and tools
3. **LSP Info** — language server status, diagnostics summary
4. **Context** — active context files/selections

#### Section Pattern

```tsx
<div className="bg-context-panel text-context-panel-fg h-full overflow-y-auto">
  {/* Section */}
  <div className="border-b border-context-panel-border">
    <button
      className="flex items-center w-full px-3 h-[22px] bg-context-panel-header text-[length:--font-size-xs] font-bold uppercase tracking-wide hover:bg-list-hover"
      onClick={toggleCollapsed}
    >
      <ChevronIcon className="w-3.5 h-3.5 mr-1" expanded={!collapsed} />
      Modified Files
      <span className="ml-auto text-badge-fg bg-badge rounded-full px-1.5 min-w-[18px] text-center text-[length:--font-size-xs]">
        {count}
      </span>
    </button>

    {!collapsed && (
      <div className="py-0.5">
        {/* File items — same pattern as file tree items */}
      </div>
    )}
  </div>
</div>
```

### Activity Bar

Vertical icon rail on the far left. Icons for switching between sidebar views.

```tsx
<div className="bg-activitybar flex flex-col items-center py-1 w-full">
  {items.map(item => (
    <button
      key={item.id}
      className={cn(
        "w-full h-[48px] flex items-center justify-center relative",
        item.isActive
          ? "text-activitybar-fg border-l-2 border-l-activitybar-fg"
          : "text-activitybar-inactive hover:text-activitybar-fg"
      )}
      title={item.label}
    >
      <item.icon className="w-6 h-6" />
      {item.badge && (
        <span className="absolute top-2 right-2 bg-activitybar-badge text-activitybar-badge-fg text-[length:--font-size-xs] rounded-full w-[16px] h-[16px] flex items-center justify-center">
          {item.badge}
        </span>
      )}
    </button>
  ))}
</div>
```

### Status Bar

```tsx
<footer className="bg-statusbar text-statusbar-fg flex items-center h-[--spacing-statusbar-height] text-[length:--font-size-xs] select-none">
  {/* Left items */}
  <div className="flex items-center gap-0.5 h-full">
    <button className="px-2 h-full hover:bg-statusbar-hover flex items-center gap-1">
      <GitBranchIcon className="w-3.5 h-3.5" />
      main
    </button>
  </div>

  {/* Right items */}
  <div className="flex items-center gap-0.5 h-full ml-auto">
    <button className="px-2 h-full hover:bg-statusbar-hover">
      Ln 42, Col 18
    </button>
    <button className="px-2 h-full hover:bg-statusbar-hover">
      UTF-8
    </button>
  </div>
</footer>
```

## Token Reference (Quick Lookup)

### Backgrounds

| Token | Dark | Light | Usage |
|---|---|---|---|
| `bg-bg` | `#1e1e1e` | `#ffffff` | App base background |
| `bg-bg-elevated` | `#252526` | `#f3f3f3` | Elevated surfaces |
| `bg-bg-surface` | `#2d2d2d` | `#f8f8f8` | Cards, popovers |
| `bg-editor` | `#1e1e1e` | `#ffffff` | Editor area |
| `bg-sidebar` | `#252526` | `#f3f3f3` | File tree sidebar |
| `bg-panel` | `#1e1e1e` | `#f8f8f8` | Bottom panel |
| `bg-context-panel` | `#252526` | `#f3f3f3` | Right context panel |
| `bg-activitybar` | `#2c2c2c` | `#2c2c2c` | Activity bar (always dark) |
| `bg-titlebar` | `#3c3c3c` | `#dddddd` | Title bar |
| `bg-statusbar` | `#007acc` | `#007acc` | Status bar |

### Foregrounds

| Token | Dark | Light | Usage |
|---|---|---|---|
| `text-fg` | `#cccccc` | `#1f1f1f` | Primary text |
| `text-fg-secondary` | `#969696` | `#616161` | Secondary text |
| `text-fg-muted` | `#6e7681` | `#6e7681` | De-emphasized text |
| `text-fg-disabled` | `#585858` | `#a0a0a0` | Disabled text |
| `text-editor-fg` | `#d4d4d4` | `#1f1f1f` | Editor text |
| `text-sidebar-fg` | `#cccccc` | `#616161` | Sidebar text |

### Borders

| Token | Dark | Light | Usage |
|---|---|---|---|
| `border-border` | `#80808059` | `#e5e5e5` | Default borders |
| `border-separator` | `#80808059` | `#e5e5e5` | Panel separators |
| `border-border-active` | `#007fd4` | `#007fd4` | Active/focus border |
| `border-focus-border` | `#007fd4` | `#0090f1` | Focus rings |

### Typography

| Property | Value | Usage |
|---|---|---|
| `font-family: var(--font-sans)` | system sans-serif | UI text |
| `font-family: var(--font-mono)` | SF Mono, Fira Code, etc. | Code, editor, terminal |
| `--font-size-xs` | 11px | Status bar, badges |
| `--font-size-sm` | 12px | File tree, tabs, sidebar headers |
| `--font-size-base` | 13px | Default UI text |
| `--font-size-editor` | 13px | Editor content |

## Rules for Contributors

1. **Always use semantic tokens** — write `bg-editor` not `bg-[#1e1e1e]`
2. **Never use Tailwind `dark:` variant** — our CSS variable system handles it
3. **All spacing in px** — VSCode uses pixel-perfect layouts, not rem
4. **Use `text-[length:--font-size-*]`** for font sizes referencing CSS variables
5. **Test both modes** — every component must look correct in light and dark
6. **1px borders** — panel separators are always `1px solid`, never thicker
7. **No shadows on panels** — only on floating elements (dropdowns, modals, tooltips)
8. **Scrollbars** — style with `scrollbar-thumb` and `scrollbar-track` tokens
9. **Truncate with `truncate`** — filenames and paths should never wrap, always ellipsis
10. **22px item height** — file tree items and list items are 22px tall (VSCode standard)
11. **48px activity bar icons** — each icon cell is 48px square
12. **Diff viewer** — always use `@pierre/diffs` React components, never hand-roll diff UI
13. **Worker pool** — wrap diff-heavy views in `WorkerPoolContextProvider` for performance
