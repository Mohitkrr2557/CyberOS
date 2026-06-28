# Cyber OS

A browser-based desktop OS simulation built with vanilla HTML, CSS, and JavaScript. No frameworks, no backend, no build step — just open `index.html` and it runs.

---

## Features

**Boot & Login**
- Login screen with avatar picker and multi-user profile support
- Profiles are saved locally and restored on sign-in
- Lock, sign out, restart, and shutdown

**Desktop**
- Draggable, resizable, and minimizable windows
- Taskbar with app search, pinned shortcuts, and a live clock
- Start menu, right-click context menu, and alt-tab switcher
- Snap layout for window arrangement
- System tray with action center, network, battery, and volume
- Toast notifications and an onboarding tour for new users
- Animated canvas background

**File System**
- Virtual file system with real file nodes (name, type, content, last modified)
- File Explorer for opening, editing, renaming, and deleting files
- Working Recycle Bin — restore or permanently delete files
- Files stay in sync with the apps that open them

**Apps**
- Notepad, Calendar, Calculator, To-Do List, AI Chat, Settings, Task Manager
- Terminal, PowerShell, and an Ubuntu-style shell
- Paint, Media Player, Snipping Tool, and a mock browser

**Games**
Snake, Tic-Tac-Toe, Solitaire, Minesweeper, Blackjack, Memory, 2048, Pac-Man — all with persistent high scores.

---

## Getting Started

```bash
git clone https://github.com/<your-username>/cyber-os.git
cd cyber-os
```

Open `index.html` in a browser, or serve it locally:

```bash
npx serve .
```

---

## Project Structure
cyber-os/

├── index.html   # markup and app shell

├── style.css    # layout, theming, animations

└── script.js    # sessions, file system, windows, apps, games

---

## Built With

- HTML5 / CSS3
- Vanilla JavaScript
- [html2canvas](https://html2canvas.hertzen.com/) for the snipping tool

---

## Roadmap

- [ ] Drag-and-drop file moves between folders
- [ ] Smoother animations for snap layout and alt-tab
- [ ] More games and high-score sharing

---

## License

No license specified yet. MIT is a good default if you plan to share or accept contributions.
