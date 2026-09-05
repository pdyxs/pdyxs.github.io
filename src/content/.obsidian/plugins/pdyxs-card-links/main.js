'use strict';

/*
 * pdyxs.wtf links
 * ---------------
 * Inserts the three body-content link protocols the site understands:
 *
 *   [Numbeanies](card:what/games/digital/numbeanies)
 *   [The Arctic Circle](collection:what:stories/arctic)
 *   [Svalbard](tag:where:europe/norway/svalbard)
 *
 * An ordinary /card/... or https://pdyxs.wtf/... href is a full page load that
 * discards the card stack, and is a data bug (src/lib/content-links.test.ts).
 *
 * The index has two sources, and the vault one is always authoritative:
 *
 *   cards       every folder holding an index.md; uid is the folder path,
 *               title is frontmatter `title` (which is all resolveCardTitle
 *               reads), via the metadata cache.
 *   collections every folder whose _config.yaml declares a `name`.
 *   tags        every *.tag.yaml, plus every dimensioned tag actually in use
 *               — in a card's frontmatter or cascaded from a _config.yaml.
 *
 * That covers everything a human authored, and it is all that exists inside
 * the vault. The *derived* values — the travel-log where:*, the when:* eras,
 * what:puzzles/level-N — are computed at build into src/data/tag-manifest.json,
 * which sits OUTSIDE the vault root: reading it needs node fs, so that half is
 * desktop-only and degrades to nothing on mobile (see readDerivedTags).
 *
 * Two consequences of the manifest being a build artifact, both real:
 *   - it is only as fresh as the last predev/prebuild, so a value can be
 *     missing, or stale enough to link somewhere that no longer exists;
 *   - it carries no display names, so a derived entry is named by humanising
 *     its own last segment.
 * Which is why a vault-known value always wins the dedupe, and derived ones
 * sort last.
 */

const {
  Plugin,
  PluginSettingTab,
  Setting,
  FuzzySuggestModal,
  EditorSuggest,
  parseYaml,
  prepareFuzzySearch,
  Notice,
} = require('obsidian');

const DIMENSIONS = ['what', 'when', 'where', 'who', 'why'];

const DEFAULT_SETTINGS = {
  inlineTrigger: ';;',
  inlineEnabled: true,
  includeDerived: true,
  // Relative to the vault root, which is the site's src/content.
  manifestPath: '../data/tag-manifest.json',
};

// --- pure helpers ----------------------------------------------------------

/** "the-neighbourhood" -> "The Neighbourhood". Only ever a fallback. */
function humanise(slug) {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Authored slash form -> canonical colon form. Idempotent; see five-w.ts. */
function toFilterValue(raw) {
  const value = String(raw || '').trim();
  if (!value || value.includes(':')) return value;
  const slash = value.indexOf('/');
  if (slash === -1) return value;
  const head = value.slice(0, slash);
  if (!DIMENSIONS.includes(head)) return value;
  return head + ':' + value.slice(slash + 1);
}

/**
 * A derived value has no declared name, so it is named after itself. A numeric
 * last segment is a `when:` month or year, which alone ("03") says nothing —
 * those keep their whole path instead.
 */
function derivedTitle(value) {
  const rest = value.slice(value.indexOf(':') + 1);
  const segs = rest.split('/');
  const last = segs[segs.length - 1];
  return /^\d+$/.test(last) ? rest : humanise(last);
}

/** A path segment starting with `_` means "not content" (_templates, _original). */
function inUnderscoreDir(path) {
  return path.split('/').slice(0, -1).some((seg) => seg.startsWith('_'));
}

function hrefFor(item) {
  if (item.kind === 'card') return 'card:' + item.id;
  if (item.kind === 'collection') return 'collection:' + item.id;
  return 'tag:' + item.id;
}

function markdownFor(item, label) {
  const text = (label || item.title || humanise(item.id.split('/').pop())).replace(/[\[\]]/g, '');
  return '[' + text + '](' + hrefFor(item) + ')';
}

// --- index -----------------------------------------------------------------

class LinkIndex {
  constructor(app, settings) {
    this.app = app;
    this.settings = settings;
    this.items = null;
    this.building = null;
  }

  /**
   * The build-time tag manifest, if this device can reach it. Desktop only:
   * `getBasePath` exists on FileSystemAdapter and nowhere else, and `require`
   * of a node module throws on mobile — hence the whole thing inside a
   * try/catch that degrades to "no derived values" rather than to an error.
   */
  readDerivedTags() {
    if (!this.settings.includeDerived) return [];
    try {
      const adapter = this.app.vault.adapter;
      if (typeof adapter.getBasePath !== 'function') return [];
      const fs = require('fs');
      const path = require('path');
      const file = path.resolve(adapter.getBasePath(), this.settings.manifestPath);
      if (!fs.existsSync(file)) return [];
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      return Array.isArray(parsed) ? parsed.map((e) => e && e.uid).filter(Boolean) : [];
    } catch (e) {
      console.warn('[pdyxs-links] could not read the tag manifest', e);
      return [];
    }
  }

  invalidate() {
    this.items = null;
    this.building = null;
  }

  async get() {
    if (this.items) return this.items;
    if (!this.building) this.building = this.build().then((items) => (this.items = items));
    return this.building;
  }

  async readYaml(file) {
    try {
      return parseYaml(await this.app.vault.cachedRead(file)) || {};
    } catch (e) {
      console.warn('[pdyxs-links] could not parse ' + file.path, e);
      return {};
    }
  }

  async build() {
    const files = this.app.vault.getFiles().filter((f) => !inUnderscoreDir(f.path));
    const cards = [];
    const collections = [];
    const tags = [];
    const seenTag = new Set();

    // Cards: metadata cache only, so 300 of them cost no reads.
    for (const file of files) {
      if (file.name !== 'index.md') continue;
      const uid = file.parent ? file.parent.path : '';
      if (!uid || uid === '/') continue;
      const fm = (this.app.metadataCache.getFileCache(file) || {}).frontmatter || {};
      cards.push({
        kind: 'card',
        id: uid,
        title: fm.title || humanise(uid.split('/').pop()),
        detail: uid,
      });
      for (const raw of [].concat(fm.tags || [])) {
        const value = toFilterValue(raw);
        if (value.includes(':') && !seenTag.has(value)) {
          seenTag.add(value);
          tags.push({ kind: 'tag', id: value, title: humanise(value.split('/').pop()), detail: value, used: true });
        }
      }
    }

    // Containers and declared tag values: a handful of YAML reads.
    for (const file of files) {
      if (file.name === '_config.yaml') {
        const dir = file.parent ? file.parent.path : '';
        const segs = dir.split('/');
        // A dimension root is panel config, not a filter value.
        if (segs.length < 2 || !DIMENSIONS.includes(segs[0])) continue;
        const data = await this.readYaml(file);
        // A folder's cascade tags are values in use as surely as a card's are —
        // where:europe/norway/svalbard lives only on the Arctic folder.
        for (const raw of [].concat(data.tags || [])) {
          const cascaded = toFilterValue(raw);
          if (cascaded.includes(':') && !seenTag.has(cascaded)) {
            seenTag.add(cascaded);
            tags.push({
              kind: 'tag',
              id: cascaded,
              title: humanise(cascaded.split('/').pop()),
              detail: cascaded,
              used: true,
            });
          }
        }
        if (!data.name) continue;
        const value = segs[0] + ':' + segs.slice(1).join('/');
        collections.push({ kind: 'collection', id: value, title: data.name, detail: value });
        seenTag.add(value);
      } else if (file.name.endsWith('.tag.yaml')) {
        const path = file.path.slice(0, -'.tag.yaml'.length);
        const segs = path.split('/');
        if (segs.length < 2 || !DIMENSIONS.includes(segs[0])) continue;
        const data = await this.readYaml(file);
        const value = segs[0] + ':' + segs.slice(1).join('/');
        seenTag.add(value);
        tags.push({
          kind: 'tag',
          id: value,
          title: data.name || humanise(segs[segs.length - 1]),
          detail: value,
          declared: true,
        });
      }
    }

    // A frontmatter value that names a container or a declared tag is the same
    // value twice; the declared entry (which has a real name) wins.
    const declared = new Set(tags.filter((t) => t.declared).map((t) => t.id));
    const deduped = tags.filter((t) => t.declared || (!declared.has(t.id) && !collections.some((c) => c.id === t.id)));

    // Anything the vault already knows wins: it has a declared name, and it is
    // current in a way a build artifact isn't.
    const known = new Set([...seenTag, ...deduped.map((t) => t.id)]);
    const derived = [];
    for (const value of this.readDerivedTags()) {
      if (!value.includes(':') || known.has(value)) continue;
      known.add(value);
      derived.push({
        kind: 'tag',
        id: value,
        title: derivedTitle(value),
        detail: value,
        derived: true,
      });
    }

    const byTitle = (a, b) => a.title.localeCompare(b.title);
    const items = [
      ...cards.sort(byTitle),
      ...collections.sort(byTitle),
      ...deduped.sort(byTitle),
      ...derived.sort(byTitle),
    ];
    for (const item of items) item.search = item.title + ' ' + item.detail;
    return items;
  }
}

// --- insertion -------------------------------------------------------------

function insertLink(editor, item) {
  const selection = editor.getSelection();
  const markdown = markdownFor(item, selection);
  if (selection) {
    editor.replaceSelection(markdown);
    return;
  }
  const cursor = editor.getCursor();
  editor.replaceRange(markdown, cursor);
  editor.setCursor({ line: cursor.line, ch: cursor.ch + markdown.length });
  editor.focus();
}

function renderItem(el, item) {
  el.addClass('pdyxs-link-suggestion');
  const kind = el.createSpan({ text: item.kind, cls: 'pdyxs-link-kind' });
  kind.style.cssText =
    'display:inline-block;min-width:5.5em;margin-right:.6em;opacity:.55;font-size:.8em;text-transform:uppercase;letter-spacing:.04em;';
  el.createSpan({ text: item.title });
  const detail = el.createDiv({ text: item.derived ? item.detail + '  · derived' : item.detail });
  detail.style.cssText = 'opacity:.55;font-size:.8em;margin-left:6.1em;';
}

// --- command modal ---------------------------------------------------------

class LinkModal extends FuzzySuggestModal {
  constructor(app, items, editor, placeholder) {
    super(app);
    this.items = items;
    this.editor = editor;
    this.setPlaceholder(placeholder);
  }
  getItems() {
    return this.items;
  }
  getItemText(item) {
    return item.search;
  }
  renderSuggestion(match, el) {
    renderItem(el, match.item);
  }
  onChooseItem(item) {
    insertLink(this.editor, item);
  }
}

// --- inline suggester ------------------------------------------------------

class LinkSuggest extends EditorSuggest {
  constructor(plugin) {
    super(plugin.app);
    this.plugin = plugin;
  }

  onTrigger(cursor, editor) {
    const settings = this.plugin.settings;
    if (!settings.inlineEnabled) return null;
    const trigger = settings.inlineTrigger;
    if (!trigger) return null;
    const line = editor.getLine(cursor.line).slice(0, cursor.ch);
    const start = line.lastIndexOf(trigger);
    if (start === -1) return null;
    const query = line.slice(start + trigger.length);
    // A query never spans a line break or runs away: bail once it stops
    // looking like something being typed.
    // A space straight after the trigger means it wasn't one — `;;` sitting in
    // prose earlier on the line must not open the picker as you type past it.
    if (query.length > 60 || /^\s/.test(query) || /[\[\]()]/.test(query)) return null;
    return {
      start: { line: cursor.line, ch: start },
      end: cursor,
      query,
    };
  }

  async getSuggestions(context) {
    const items = await this.plugin.index.get();
    const query = context.query.trim();
    if (!query) return items.slice(0, 20);
    const fuzzy = prepareFuzzySearch(query);
    const scored = [];
    for (const item of items) {
      const result = fuzzy(item.search);
      if (result) scored.push({ item, score: result.score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 20).map((s) => s.item);
  }

  renderSuggestion(item, el) {
    renderItem(el, item);
  }

  selectSuggestion(item) {
    const { editor, start, end } = this.context;
    // The trigger string itself is part of the replaced range.
    editor.replaceRange(markdownFor(item, ''), start, end);
    const inserted = markdownFor(item, '').length;
    editor.setCursor({ line: start.line, ch: start.ch + inserted });
    this.close();
  }
}

// --- settings --------------------------------------------------------------

class LinkSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Inline suggestions')
      .setDesc('Show the picker as you type the trigger string, like [[ does.')
      .addToggle((t) =>
        t.setValue(this.plugin.settings.inlineEnabled).onChange(async (v) => {
          this.plugin.settings.inlineEnabled = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Derived tags (desktop only)')
      .setDesc(
        'Also offer the tag values the site computes at build — travel locations, ' +
          'eras, puzzle difficulty levels. Read from the tag manifest below, so they ' +
          'are as fresh as the last dev-server or build run, and unavailable on mobile.',
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.includeDerived).onChange(async (v) => {
          this.plugin.settings.includeDerived = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Tag manifest path')
      .setDesc('Relative to the vault root (which is the site\'s src/content).')
      .addText((t) =>
        t
          .setPlaceholder(DEFAULT_SETTINGS.manifestPath)
          .setValue(this.plugin.settings.manifestPath)
          .onChange(async (v) => {
            this.plugin.settings.manifestPath = v.trim() || DEFAULT_SETTINGS.manifestPath;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Trigger string')
      .setDesc('Typing this opens the inline picker. Pick something you never type in prose.')
      .addText((t) =>
        t
          .setPlaceholder(';;')
          .setValue(this.plugin.settings.inlineTrigger)
          .onChange(async (v) => {
            this.plugin.settings.inlineTrigger = v.trim();
            await this.plugin.saveSettings();
          }),
      );
  }
}

// --- plugin ----------------------------------------------------------------

module.exports = class PdyxsLinksPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.index = new LinkIndex(this.app, this.settings);

    const invalidate = () => this.index.invalidate();
    this.registerEvent(this.app.vault.on('create', invalidate));
    this.registerEvent(this.app.vault.on('delete', invalidate));
    this.registerEvent(this.app.vault.on('rename', invalidate));
    this.registerEvent(this.app.metadataCache.on('changed', invalidate));

    const command = (id, name, kinds, placeholder) =>
      this.addCommand({
        id,
        name,
        editorCallback: async (editor) => {
          const items = (await this.index.get()).filter((i) => kinds.includes(i.kind));
          if (!items.length) {
            new Notice('pdyxs links: nothing indexed yet');
            return;
          }
          new LinkModal(this.app, items, editor, placeholder).open();
        },
      });

    command('insert-link', 'Insert link (card, collection or tag)', ['card', 'collection', 'tag'], 'Link to…');
    command('insert-card-link', 'Insert card link', ['card'], 'Link to a card…');
    command('insert-collection-link', 'Insert collection link', ['collection'], 'Link to a folder or series…');
    command('insert-tag-link', 'Insert tag link', ['tag'], 'Link to a tag…');

    this.registerEditorSuggest(new LinkSuggest(this));
    this.addSettingTab(new LinkSettingTab(this.app, this));
  }

  async saveSettings() {
    await this.saveData(this.settings);
    // The derived half of the index is a function of these settings.
    this.index.invalidate();
  }
};
