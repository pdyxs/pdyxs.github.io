---
inspected: true
title: Friends in the Fog
date: 2025-04-13
series: experimental-fog
order: 8
url: https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=000MVQ
sudokupad_url: https://sudokupad.app/pdyxs/friends-in-the-fog
image: bild.png
difficulty: Level 2 (Easy)
tags: []
imagePad: 2.5%
description: Some cells are friends, some are fog.
---

This is a follow-up to [Whispers in the Mist](card:what/puzzles/experimental-fog/whispers-in-the-mist), where fog clearance has a clear and defined meaning.

## Rules

**Sudoku:** Fill the grid with the digits 1-9, so that each digit occurs exactly once in every row, every column and every 3x3 box.

**Nurikabe:** Divide the grid into a number of islands — orthogonally-connected groups of cells. Every island contains a single circled cell; the digit in the circle indicates the number of cells making up the island.
The islands are surrounded by a waterway — a single orthogonally-connected group of cells. Digits on islands can repeat if otherwise allowed.
All caged cells are waterway cells; the digit in a caged cell indicates how many waterway cells are seen orthogonally from that position, including itself (island cells block vision). The waterway cannot form any 2x2 areas.

**Nurikabe fog:** The grid is covered in fog. A correct digit entered into a waterway cell will clear fog from that cell, and from any waterway cells which are adjacent (either orthogonally or diagonally). The fog on island cells will never be cleared.

**Friendly Islands:** A cell is “friendly” if it has a value identical to its row-, column- or box-number (e.g. r2c3 can be a 1, 2 or 3). All friendly cells in the grid must be on islands, and all circled cells are friendly.

**Kropki:** Digits connected by a white dot are consecutive.
