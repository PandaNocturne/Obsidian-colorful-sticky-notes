'use strict';

var obsidian = require('obsidian');
var language = require('@codemirror/language');
var state = require('@codemirror/state');
var view = require('@codemirror/view');

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */

function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

function getDocumentTitle(state) {
    return state.field(obsidian.editorViewField).getDisplayText();
}

function getEditorViewFromEditorState(state) {
    return state.field(obsidian.editorEditorField);
}

function cleanTitle(title) {
    return title
        .trim()
        .replace(/^#+(\s)/, "$1")
        .replace(/^([-+*]|\d+\.)(\s)/, "$2")
        .trim();
}

class CollectBreadcrumbs {
    constructor(getDocumentTitle) {
        this.getDocumentTitle = getDocumentTitle;
    }
    collectBreadcrumbs(state, pos) {
        const breadcrumbs = [
            { title: this.getDocumentTitle.getDocumentTitle(state), pos: null },
        ];
        const posLine = state.doc.lineAt(pos);
        for (let i = 1; i < posLine.number; i++) {
            const line = state.doc.line(i);
            const f = language.foldable(state, line.from, line.to);
            if (f && f.to > posLine.from) {
                breadcrumbs.push({ title: cleanTitle(line.text), pos: line.from });
            }
        }
        breadcrumbs.push({
            title: cleanTitle(posLine.text),
            pos: posLine.from,
        });
        return breadcrumbs;
    }
}

function calculateVisibleContentBoundariesViolation(tr, hiddenRanges) {
    let touchedBefore = false;
    let touchedAfter = false;
    let touchedInside = false;
    const t = (f, t) => Boolean(tr.changes.touchesRange(f, t));
    if (hiddenRanges.length === 2) {
        const [a, b] = hiddenRanges;
        touchedBefore = t(a.from, a.to);
        touchedInside = t(a.to + 1, b.from - 1);
        touchedAfter = t(b.from, b.to);
    }
    if (hiddenRanges.length === 1) {
        const [a] = hiddenRanges;
        if (a.from === 0) {
            touchedBefore = t(a.from, a.to);
            touchedInside = t(a.to + 1, tr.newDoc.length);
        }
        else {
            touchedInside = t(0, a.from - 1);
            touchedAfter = t(a.from, a.to);
        }
    }
    const touchedOutside = touchedBefore || touchedAfter;
    const res = {
        touchedOutside,
        touchedBefore,
        touchedAfter,
        touchedInside,
    };
    return res;
}

class DetectRangeBeforeVisibleRangeChanged {
    constructor(calculateHiddenContentRanges, rangeBeforeVisibleRangeChanged) {
        this.calculateHiddenContentRanges = calculateHiddenContentRanges;
        this.rangeBeforeVisibleRangeChanged = rangeBeforeVisibleRangeChanged;
        this.detectVisibleContentBoundariesViolation = (tr) => {
            const hiddenRanges = this.calculateHiddenContentRanges.calculateHiddenContentRanges(tr.startState);
            const { touchedBefore, touchedInside } = calculateVisibleContentBoundariesViolation(tr, hiddenRanges);
            if (touchedBefore && !touchedInside) {
                setImmediate(() => {
                    this.rangeBeforeVisibleRangeChanged.rangeBeforeVisibleRangeChanged(tr.state);
                });
            }
            return null;
        };
    }
    getExtension() {
        return state.EditorState.transactionExtender.of(this.detectVisibleContentBoundariesViolation);
    }
}

function renderHeader(doc, ctx) {
    const { breadcrumbs, onClick } = ctx;
    const h = doc.createElement("div");
    h.classList.add("zoom-plugin-header");
    for (let i = 0; i < breadcrumbs.length; i++) {
        if (i > 0) {
            const d = doc.createElement("span");
            d.classList.add("zoom-plugin-delimiter");
            d.innerText = ">";
            h.append(d);
        }
        const breadcrumb = breadcrumbs[i];
        const b = doc.createElement("a");
        b.classList.add("zoom-plugin-title");
        b.dataset.pos = String(breadcrumb.pos);
        b.appendChild(doc.createTextNode(breadcrumb.title));
        b.addEventListener("click", (e) => {
            e.preventDefault();
            const t = e.target;
            const pos = t.dataset.pos;
            onClick(pos === "null" ? null : Number(pos));
        });
        h.appendChild(b);
    }
    return h;
}

const showHeaderEffect = state.StateEffect.define();
const hideHeaderEffect = state.StateEffect.define();
const headerState = state.StateField.define({
    create: () => null,
    update: (value, tr) => {
        for (const e of tr.effects) {
            if (e.is(showHeaderEffect)) {
                value = e.value;
            }
            if (e.is(hideHeaderEffect)) {
                value = null;
            }
        }
        return value;
    },
    provide: (f) => view.showPanel.from(f, (state) => {
        if (!state) {
            return null;
        }
        return (view) => ({
            top: true,
            dom: renderHeader(view.dom.ownerDocument, {
                breadcrumbs: state.breadcrumbs,
                onClick: (pos) => state.onClick(view, pos),
            }),
        });
    }),
});
class RenderNavigationHeader {
    getExtension() {
        return headerState;
    }
    constructor(logger, zoomIn, zoomOut) {
        this.logger = logger;
        this.zoomIn = zoomIn;
        this.zoomOut = zoomOut;
        this.onClick = (view, pos) => {
            if (pos === null) {
                this.zoomOut.zoomOut(view);
            }
            else {
                this.zoomIn.zoomIn(view, pos);
            }
        };
    }
    showHeader(view, breadcrumbs) {
        const l = this.logger.bind("ToggleNavigationHeaderLogic:showHeader");
        l("show header");
        view.dispatch({
            effects: [
                showHeaderEffect.of({
                    breadcrumbs,
                    onClick: this.onClick,
                }),
            ],
        });
    }
    hideHeader(view) {
        const l = this.logger.bind("ToggleNavigationHeaderLogic:hideHeader");
        l("hide header");
        view.dispatch({
            effects: [hideHeaderEffect.of()],
        });
    }
}

class ShowHeaderAfterZoomIn {
    constructor(notifyAfterZoomIn, collectBreadcrumbs, renderNavigationHeader) {
        this.notifyAfterZoomIn = notifyAfterZoomIn;
        this.collectBreadcrumbs = collectBreadcrumbs;
        this.renderNavigationHeader = renderNavigationHeader;
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.notifyAfterZoomIn.notifyAfterZoomIn((view, pos) => {
                const breadcrumbs = this.collectBreadcrumbs.collectBreadcrumbs(view.state, pos);
                this.renderNavigationHeader.showHeader(view, breadcrumbs);
            });
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}
class HideHeaderAfterZoomOut {
    constructor(notifyAfterZoomOut, renderNavigationHeader) {
        this.notifyAfterZoomOut = notifyAfterZoomOut;
        this.renderNavigationHeader = renderNavigationHeader;
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.notifyAfterZoomOut.notifyAfterZoomOut((view) => {
                this.renderNavigationHeader.hideHeader(view);
            });
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}
class UpdateHeaderAfterRangeBeforeVisibleRangeChanged {
    constructor(plugin, calculateHiddenContentRanges, calculateVisibleContentRange, collectBreadcrumbs, renderNavigationHeader) {
        this.plugin = plugin;
        this.calculateHiddenContentRanges = calculateHiddenContentRanges;
        this.calculateVisibleContentRange = calculateVisibleContentRange;
        this.collectBreadcrumbs = collectBreadcrumbs;
        this.renderNavigationHeader = renderNavigationHeader;
        this.detectRangeBeforeVisibleRangeChanged = new DetectRangeBeforeVisibleRangeChanged(this.calculateHiddenContentRanges, {
            rangeBeforeVisibleRangeChanged: (state) => this.rangeBeforeVisibleRangeChanged(state),
        });
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.registerEditorExtension(this.detectRangeBeforeVisibleRangeChanged.getExtension());
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
    rangeBeforeVisibleRangeChanged(state) {
        const view = getEditorViewFromEditorState(state);
        const pos = this.calculateVisibleContentRange.calculateVisibleContentRange(state).from;
        const breadcrumbs = this.collectBreadcrumbs.collectBreadcrumbs(state, pos);
        this.renderNavigationHeader.showHeader(view, breadcrumbs);
    }
}
class HeaderNavigationFeature {
    constructor(plugin, logger, calculateHiddenContentRanges, calculateVisibleContentRange, zoomIn, zoomOut, notifyAfterZoomIn, notifyAfterZoomOut) {
        this.plugin = plugin;
        this.logger = logger;
        this.calculateHiddenContentRanges = calculateHiddenContentRanges;
        this.calculateVisibleContentRange = calculateVisibleContentRange;
        this.zoomIn = zoomIn;
        this.zoomOut = zoomOut;
        this.notifyAfterZoomIn = notifyAfterZoomIn;
        this.notifyAfterZoomOut = notifyAfterZoomOut;
        this.collectBreadcrumbs = new CollectBreadcrumbs({
            getDocumentTitle: getDocumentTitle,
        });
        this.renderNavigationHeader = new RenderNavigationHeader(this.logger, this.zoomIn, this.zoomOut);
        this.showHeaderAfterZoomIn = new ShowHeaderAfterZoomIn(this.notifyAfterZoomIn, this.collectBreadcrumbs, this.renderNavigationHeader);
        this.hideHeaderAfterZoomOut = new HideHeaderAfterZoomOut(this.notifyAfterZoomOut, this.renderNavigationHeader);
        this.updateHeaderAfterRangeBeforeVisibleRangeChanged = new UpdateHeaderAfterRangeBeforeVisibleRangeChanged(this.plugin, this.calculateHiddenContentRanges, this.calculateVisibleContentRange, this.collectBreadcrumbs, this.renderNavigationHeader);
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.registerEditorExtension(this.renderNavigationHeader.getExtension());
            this.showHeaderAfterZoomIn.load();
            this.hideHeaderAfterZoomOut.load();
            this.updateHeaderAfterRangeBeforeVisibleRangeChanged.load();
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () {
            this.showHeaderAfterZoomIn.unload();
            this.hideHeaderAfterZoomOut.unload();
            this.updateHeaderAfterRangeBeforeVisibleRangeChanged.unload();
        });
    }
}

function calculateLimitedSelection(selection, from, to) {
    const mainSelection = selection.main;
    const newSelection = state.EditorSelection.range(Math.min(Math.max(mainSelection.anchor, from), to), Math.min(Math.max(mainSelection.head, from), to), mainSelection.goalColumn);
    const shouldUpdate = selection.ranges.length > 1 ||
        newSelection.anchor !== mainSelection.anchor ||
        newSelection.head !== mainSelection.head;
    return shouldUpdate ? newSelection : null;
}

const zoomInEffect = state.StateEffect.define();
const zoomOutEffect = state.StateEffect.define();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isZoomInEffect(e) {
    return e.is(zoomInEffect);
}

class LimitSelectionOnZoomingIn {
    constructor(logger) {
        this.logger = logger;
        this.limitSelectionOnZoomingIn = (tr) => {
            const e = tr.effects.find(isZoomInEffect);
            if (!e) {
                return tr;
            }
            const newSelection = calculateLimitedSelection(tr.newSelection, e.value.from, e.value.to);
            if (!newSelection) {
                return tr;
            }
            this.logger.log("LimitSelectionOnZoomingIn:limitSelectionOnZoomingIn", "limiting selection", newSelection.toJSON());
            return [tr, { selection: newSelection }];
        };
    }
    getExtension() {
        return state.EditorState.transactionFilter.of(this.limitSelectionOnZoomingIn);
    }
}

class LimitSelectionWhenZoomedIn {
    constructor(logger, calculateVisibleContentRange) {
        this.logger = logger;
        this.calculateVisibleContentRange = calculateVisibleContentRange;
        this.limitSelectionWhenZoomedIn = (tr) => {
            if (!tr.selection || !tr.isUserEvent("select")) {
                return tr;
            }
            const range = this.calculateVisibleContentRange.calculateVisibleContentRange(tr.state);
            if (!range) {
                return tr;
            }
            const newSelection = calculateLimitedSelection(tr.newSelection, range.from, range.to);
            if (!newSelection) {
                return tr;
            }
            this.logger.log("LimitSelectionWhenZoomedIn:limitSelectionWhenZoomedIn", "limiting selection", newSelection.toJSON());
            return [tr, { selection: newSelection }];
        };
    }
    getExtension() {
        return state.EditorState.transactionFilter.of(this.limitSelectionWhenZoomedIn);
    }
}

class LimitSelectionFeature {
    constructor(plugin, logger, calculateVisibleContentRange) {
        this.plugin = plugin;
        this.logger = logger;
        this.calculateVisibleContentRange = calculateVisibleContentRange;
        this.limitSelectionOnZoomingIn = new LimitSelectionOnZoomingIn(this.logger);
        this.limitSelectionWhenZoomedIn = new LimitSelectionWhenZoomedIn(this.logger, this.calculateVisibleContentRange);
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.registerEditorExtension(this.limitSelectionOnZoomingIn.getExtension());
            this.plugin.registerEditorExtension(this.limitSelectionWhenZoomedIn.getExtension());
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}

class ListsStylesFeature {
    constructor(settings) {
        this.settings = settings;
        this.onZoomOnClickSettingChange = (zoomOnClick) => {
            if (zoomOnClick) {
                this.addZoomStyles();
            }
            else {
                this.removeZoomStyles();
            }
        };
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.settings.zoomOnClick) {
                this.addZoomStyles();
            }
            this.settings.onChange("zoomOnClick", this.onZoomOnClickSettingChange);
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () {
            this.settings.removeCallback("zoomOnClick", this.onZoomOnClickSettingChange);
            this.removeZoomStyles();
        });
    }
    addZoomStyles() {
        document.body.classList.add("zoom-plugin-bls-zoom");
    }
    removeZoomStyles() {
        document.body.classList.remove("zoom-plugin-bls-zoom");
    }
}

class DetectVisibleContentBoundariesViolation {
    constructor(calculateHiddenContentRanges, visibleContentBoundariesViolated) {
        this.calculateHiddenContentRanges = calculateHiddenContentRanges;
        this.visibleContentBoundariesViolated = visibleContentBoundariesViolated;
        this.detectVisibleContentBoundariesViolation = (tr) => {
            const hiddenRanges = this.calculateHiddenContentRanges.calculateHiddenContentRanges(tr.startState);
            const { touchedOutside, touchedInside } = calculateVisibleContentBoundariesViolation(tr, hiddenRanges);
            if (touchedOutside && touchedInside) {
                setImmediate(() => {
                    this.visibleContentBoundariesViolated.visibleContentBoundariesViolated(tr.state);
                });
            }
            return null;
        };
    }
    getExtension() {
        return state.EditorState.transactionExtender.of(this.detectVisibleContentBoundariesViolation);
    }
}

class ResetZoomWhenVisibleContentBoundariesViolatedFeature {
    constructor(plugin, logger, calculateHiddenContentRanges, zoomOut) {
        this.plugin = plugin;
        this.logger = logger;
        this.calculateHiddenContentRanges = calculateHiddenContentRanges;
        this.zoomOut = zoomOut;
        this.detectVisibleContentBoundariesViolation = new DetectVisibleContentBoundariesViolation(this.calculateHiddenContentRanges, {
            visibleContentBoundariesViolated: (state) => this.visibleContentBoundariesViolated(state),
        });
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.registerEditorExtension(this.detectVisibleContentBoundariesViolation.getExtension());
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
    visibleContentBoundariesViolated(state) {
        const l = this.logger.bind("ResetZoomWhenVisibleContentBoundariesViolatedFeature:visibleContentBoundariesViolated");
        l("visible content boundaries violated, zooming out");
        this.zoomOut.zoomOut(getEditorViewFromEditorState(state));
    }
}

class ObsidianZoomPluginSettingTab extends obsidian.PluginSettingTab {
    constructor(app, plugin, settings) {
        super(app, plugin);
        this.settings = settings;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        new obsidian.Setting(containerEl)
            .setName("Zooming in when clicking on the bullet")
            .addToggle((toggle) => {
            toggle.setValue(this.settings.zoomOnClick).onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.settings.zoomOnClick = value;
                yield this.settings.save();
            }));
        });
        new obsidian.Setting(containerEl)
            .setName("Debug mode")
            .setDesc("Open DevTools (Command+Option+I or Control+Shift+I) to copy the debug logs.")
            .addToggle((toggle) => {
            toggle.setValue(this.settings.debug).onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.settings.debug = value;
                yield this.settings.save();
            }));
        });
    }
}
class SettingsTabFeature {
    constructor(plugin, settings) {
        this.plugin = plugin;
        this.settings = settings;
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.addSettingTab(new ObsidianZoomPluginSettingTab(this.plugin.app, this.plugin, this.settings));
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}

function isFoldingEnabled(app) {
    const config = Object.assign({ foldHeading: true, foldIndent: true }, app.vault.config);
    return config.foldHeading && config.foldIndent;
}

class CalculateRangeForZooming {
    calculateRangeForZooming(state, pos) {
        const line = state.doc.lineAt(pos);
        const foldRange = language.foldable(state, line.from, line.to);
        if (!foldRange && /^\s*([-*+]|\d+\.)\s+/.test(line.text)) {
            return { from: line.from, to: line.to };
        }
        if (!foldRange) {
            return null;
        }
        return { from: line.from, to: foldRange.to };
    }
}

function rangeSetToArray(rs) {
    const res = [];
    const i = rs.iter();
    while (i.value !== null) {
        res.push({ from: i.from, to: i.to });
        i.next();
    }
    return res;
}

const zoomMarkHidden = view.Decoration.replace({ block: true });
const zoomStateField = state.StateField.define({
    create: () => {
        return view.Decoration.none;
    },
    update: (value, tr) => {
        value = value.map(tr.changes);
        for (const e of tr.effects) {
            if (e.is(zoomInEffect)) {
                value = value.update({ filter: () => false });
                if (e.value.from > 0) {
                    value = value.update({
                        add: [zoomMarkHidden.range(0, e.value.from - 1)],
                    });
                }
                if (e.value.to < tr.newDoc.length) {
                    value = value.update({
                        add: [zoomMarkHidden.range(e.value.to + 1, tr.newDoc.length)],
                    });
                }
            }
            if (e.is(zoomOutEffect)) {
                value = value.update({ filter: () => false });
            }
        }
        return value;
    },
    provide: (zoomStateField) => view.EditorView.decorations.from(zoomStateField),
});
class KeepOnlyZoomedContentVisible {
    constructor(logger) {
        this.logger = logger;
    }
    getExtension() {
        return zoomStateField;
    }
    calculateHiddenContentRanges(state) {
        return rangeSetToArray(state.field(zoomStateField));
    }
    calculateVisibleContentRange(state) {
        const hidden = this.calculateHiddenContentRanges(state);
        if (hidden.length === 1) {
            const [a] = hidden;
            if (a.from === 0) {
                return { from: a.to + 1, to: state.doc.length };
            }
            else {
                return { from: 0, to: a.from - 1 };
            }
        }
        if (hidden.length === 2) {
            const [a, b] = hidden;
            return { from: a.to + 1, to: b.from - 1 };
        }
        return null;
    }
    keepOnlyZoomedContentVisible(view$1, from, to, options = {}) {
        const { scrollIntoView } = Object.assign({ scrollIntoView: true }, options);
        const effect = zoomInEffect.of({ from, to });
        this.logger.log("KeepOnlyZoomedContent:keepOnlyZoomedContentVisible", "keep only zoomed content visible", effect.value.from, effect.value.to);
        view$1.dispatch({
            effects: [effect],
        });
        if (scrollIntoView) {
            view$1.dispatch({
                effects: [
                    view.EditorView.scrollIntoView(view$1.state.selection.main, {
                        y: "start",
                    }),
                ],
            });
        }
    }
    showAllContent(view$1) {
        this.logger.log("KeepOnlyZoomedContent:showAllContent", "show all content");
        view$1.dispatch({ effects: [zoomOutEffect.of()] });
        view$1.dispatch({
            effects: [
                view.EditorView.scrollIntoView(view$1.state.selection.main, {
                    y: "center",
                }),
            ],
        });
    }
}

function getEditorViewFromEditor(editor) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return editor.cm;
}

class ZoomFeature {
    constructor(plugin, logger) {
        this.plugin = plugin;
        this.logger = logger;
        this.zoomInCallbacks = [];
        this.zoomOutCallbacks = [];
        this.keepOnlyZoomedContentVisible = new KeepOnlyZoomedContentVisible(this.logger);
        this.calculateRangeForZooming = new CalculateRangeForZooming();
    }
    calculateVisibleContentRange(state) {
        return this.keepOnlyZoomedContentVisible.calculateVisibleContentRange(state);
    }
    calculateHiddenContentRanges(state) {
        return this.keepOnlyZoomedContentVisible.calculateHiddenContentRanges(state);
    }
    notifyAfterZoomIn(cb) {
        this.zoomInCallbacks.push(cb);
    }
    notifyAfterZoomOut(cb) {
        this.zoomOutCallbacks.push(cb);
    }
    refreshZoom(view) {
        const prevRange = this.keepOnlyZoomedContentVisible.calculateVisibleContentRange(view.state);
        if (!prevRange) {
            return;
        }
        const newRange = this.calculateRangeForZooming.calculateRangeForZooming(view.state, prevRange.from);
        if (!newRange) {
            return;
        }
        this.keepOnlyZoomedContentVisible.keepOnlyZoomedContentVisible(view, newRange.from, newRange.to, { scrollIntoView: false });
    }
    zoomIn(view, pos) {
        const l = this.logger.bind("ZoomFeature:zoomIn");
        l("zooming in");
        if (!isFoldingEnabled(this.plugin.app)) {
            new obsidian.Notice(`In order to zoom, you must first enable "Fold heading" and "Fold indent" under Settings -> Editor`);
            return;
        }
        const range = this.calculateRangeForZooming.calculateRangeForZooming(view.state, pos);
        if (!range) {
            l("unable to calculate range for zooming");
            return;
        }
        this.keepOnlyZoomedContentVisible.keepOnlyZoomedContentVisible(view, range.from, range.to);
        for (const cb of this.zoomInCallbacks) {
            cb(view, pos);
        }
    }
    zoomOut(view) {
        const l = this.logger.bind("ZoomFeature:zoomIn");
        l("zooming out");
        this.keepOnlyZoomedContentVisible.showAllContent(view);
        for (const cb of this.zoomOutCallbacks) {
            cb(view);
        }
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.registerEditorExtension(this.keepOnlyZoomedContentVisible.getExtension());
            this.plugin.addCommand({
                id: "zoom-in",
                name: "Zoom in",
                icon: "zoom-in",
                editorCallback: (editor) => {
                    const view = getEditorViewFromEditor(editor);
                    this.zoomIn(view, view.state.selection.main.head);
                },
                hotkeys: [
                    {
                        modifiers: ["Mod"],
                        key: ".",
                    },
                ],
            });
            this.plugin.addCommand({
                id: "zoom-out",
                name: "Zoom out the entire document",
                icon: "zoom-out",
                editorCallback: (editor) => this.zoomOut(getEditorViewFromEditor(editor)),
                hotkeys: [
                    {
                        modifiers: ["Mod", "Shift"],
                        key: ".",
                    },
                ],
            });
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}

function isBulletPoint(e) {
    return (e instanceof HTMLSpanElement &&
        (e.classList.contains("list-bullet") ||
            e.classList.contains("cm-formatting-list")));
}

class DetectClickOnBullet {
    constructor(settings, clickOnBullet) {
        this.settings = settings;
        this.clickOnBullet = clickOnBullet;
        this.detectClickOnBullet = (e, view) => {
            if (!this.settings.zoomOnClick ||
                !(e.target instanceof HTMLElement) ||
                !isBulletPoint(e.target)) {
                return;
            }
            const pos = view.posAtDOM(e.target);
            this.clickOnBullet.clickOnBullet(view, pos);
        };
    }
    getExtension() {
        return view.EditorView.domEventHandlers({
            click: this.detectClickOnBullet,
        });
    }
    moveCursorToLineEnd(view, pos) {
        const line = view.state.doc.lineAt(pos);
        view.dispatch({
            selection: state.EditorSelection.cursor(line.to),
        });
    }
}

class ZoomOnClickFeature {
    constructor(plugin, settings, zoomIn) {
        this.plugin = plugin;
        this.settings = settings;
        this.zoomIn = zoomIn;
        this.detectClickOnBullet = new DetectClickOnBullet(this.settings, {
            clickOnBullet: (view, pos) => this.clickOnBullet(view, pos),
        });
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.registerEditorExtension(this.detectClickOnBullet.getExtension());
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
    clickOnBullet(view, pos) {
        this.detectClickOnBullet.moveCursorToLineEnd(view, pos);
        this.zoomIn.zoomIn(view, pos);
    }
}

class LoggerService {
    constructor(settings) {
        this.settings = settings;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    log(method, ...args) {
        if (!this.settings.debug) {
            return;
        }
        console.info(method, ...args);
    }
    bind(method) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (...args) => this.log(method, ...args);
    }
}

const DEFAULT_SETTINGS = {
    debug: false,
    zoomOnClick: true,
    zoomOnClickMobile: false,
};
const zoomOnClickProp = obsidian.Platform.isDesktop
    ? "zoomOnClick"
    : "zoomOnClickMobile";
const mappingToJson = {
    zoomOnClick: zoomOnClickProp,
    debug: "debug",
};
class SettingsService {
    constructor(storage) {
        this.storage = storage;
        this.handlers = new Map();
    }
    get debug() {
        return this.values.debug;
    }
    set debug(value) {
        this.set("debug", value);
    }
    get zoomOnClick() {
        return this.values[mappingToJson.zoomOnClick];
    }
    set zoomOnClick(value) {
        this.set("zoomOnClick", value);
    }
    onChange(key, cb) {
        if (!this.handlers.has(key)) {
            this.handlers.set(key, new Set());
        }
        this.handlers.get(key).add(cb);
    }
    removeCallback(key, cb) {
        const handlers = this.handlers.get(key);
        if (handlers) {
            handlers.delete(cb);
        }
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.values = Object.assign({}, DEFAULT_SETTINGS, yield this.storage.loadData());
        });
    }
    save() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.storage.saveData(this.values);
        });
    }
    set(key, value) {
        this.values[mappingToJson[key]] = value;
        const callbacks = this.handlers.get(key);
        if (!callbacks) {
            return;
        }
        for (const cb of callbacks.values()) {
            cb(value);
        }
    }
}

class ObsidianZoomPlugin extends obsidian.Plugin {
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`Loading obsidian-zoom`);
            window.ObsidianZoomPlugin = this;
            const settings = new SettingsService(this);
            yield settings.load();
            const logger = new LoggerService(settings);
            const settingsTabFeature = new SettingsTabFeature(this, settings);
            this.zoomFeature = new ZoomFeature(this, logger);
            const limitSelectionFeature = new LimitSelectionFeature(this, logger, this.zoomFeature);
            const resetZoomWhenVisibleContentBoundariesViolatedFeature = new ResetZoomWhenVisibleContentBoundariesViolatedFeature(this, logger, this.zoomFeature, this.zoomFeature);
            const headerNavigationFeature = new HeaderNavigationFeature(this, logger, this.zoomFeature, this.zoomFeature, this.zoomFeature, this.zoomFeature, this.zoomFeature, this.zoomFeature);
            const zoomOnClickFeature = new ZoomOnClickFeature(this, settings, this.zoomFeature);
            const listsStylesFeature = new ListsStylesFeature(settings);
            this.features = [
                settingsTabFeature,
                this.zoomFeature,
                limitSelectionFeature,
                resetZoomWhenVisibleContentBoundariesViolatedFeature,
                headerNavigationFeature,
                zoomOnClickFeature,
                listsStylesFeature,
            ];
            for (const feature of this.features) {
                yield feature.load();
            }
        });
    }
    onunload() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`Unloading obsidian-zoom`);
            delete window.ObsidianZoomPlugin;
            for (const feature of this.features) {
                yield feature.unload();
            }
        });
    }
    getZoomRange(editor) {
        const cm = getEditorViewFromEditor(editor);
        const range = this.zoomFeature.calculateVisibleContentRange(cm.state);
        if (!range) {
            return null;
        }
        const from = cm.state.doc.lineAt(range.from);
        const to = cm.state.doc.lineAt(range.to);
        return {
            from: {
                line: from.number - 1,
                ch: range.from - from.from,
            },
            to: {
                line: to.number - 1,
                ch: range.to - to.from,
            },
        };
    }
    zoomOut(editor) {
        this.zoomFeature.zoomOut(getEditorViewFromEditor(editor));
    }
    zoomIn(editor, line) {
        const cm = getEditorViewFromEditor(editor);
        const pos = cm.state.doc.line(line + 1).from;
        this.zoomFeature.zoomIn(cm, pos);
    }
    refreshZoom(editor) {
        this.zoomFeature.refreshZoom(getEditorViewFromEditor(editor));
    }
}

module.exports = ObsidianZoomPlugin;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXMiOlsibm9kZV9tb2R1bGVzL3RzbGliL3RzbGliLmVzNi5qcyIsInNyYy9mZWF0dXJlcy91dGlscy9nZXREb2N1bWVudFRpdGxlLnRzIiwic3JjL2ZlYXR1cmVzL3V0aWxzL2dldEVkaXRvclZpZXdGcm9tRWRpdG9yU3RhdGUudHMiLCJzcmMvbG9naWMvdXRpbHMvY2xlYW5UaXRsZS50cyIsInNyYy9sb2dpYy9Db2xsZWN0QnJlYWRjcnVtYnMudHMiLCJzcmMvbG9naWMvdXRpbHMvY2FsY3VsYXRlVmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0aW9uLnRzIiwic3JjL2xvZ2ljL0RldGVjdFJhbmdlQmVmb3JlVmlzaWJsZVJhbmdlQ2hhbmdlZC50cyIsInNyYy9sb2dpYy91dGlscy9yZW5kZXJIZWFkZXIudHMiLCJzcmMvbG9naWMvUmVuZGVyTmF2aWdhdGlvbkhlYWRlci50cyIsInNyYy9mZWF0dXJlcy9IZWFkZXJOYXZpZ2F0aW9uRmVhdHVyZS50cyIsInNyYy9sb2dpYy91dGlscy9jYWxjdWxhdGVMaW1pdGVkU2VsZWN0aW9uLnRzIiwic3JjL2xvZ2ljL3V0aWxzL2VmZmVjdHMudHMiLCJzcmMvbG9naWMvTGltaXRTZWxlY3Rpb25Pblpvb21pbmdJbi50cyIsInNyYy9sb2dpYy9MaW1pdFNlbGVjdGlvbldoZW5ab29tZWRJbi50cyIsInNyYy9mZWF0dXJlcy9MaW1pdFNlbGVjdGlvbkZlYXR1cmUudHMiLCJzcmMvZmVhdHVyZXMvTGlzdHNTdHlsZXNGZWF0dXJlLnRzIiwic3JjL2xvZ2ljL0RldGVjdFZpc2libGVDb250ZW50Qm91bmRhcmllc1Zpb2xhdGlvbi50cyIsInNyYy9mZWF0dXJlcy9SZXNldFpvb21XaGVuVmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0ZWRGZWF0dXJlLnRzIiwic3JjL2ZlYXR1cmVzL1NldHRpbmdzVGFiRmVhdHVyZS50cyIsInNyYy9mZWF0dXJlcy91dGlscy9pc0ZvbGRpbmdFbmFibGVkLnRzIiwic3JjL2xvZ2ljL0NhbGN1bGF0ZVJhbmdlRm9yWm9vbWluZy50cyIsInNyYy9sb2dpYy91dGlscy9yYW5nZVNldFRvQXJyYXkudHMiLCJzcmMvbG9naWMvS2VlcE9ubHlab29tZWRDb250ZW50VmlzaWJsZS50cyIsInNyYy91dGlscy9nZXRFZGl0b3JWaWV3RnJvbUVkaXRvci50cyIsInNyYy9mZWF0dXJlcy9ab29tRmVhdHVyZS50cyIsInNyYy9sb2dpYy91dGlscy9pc0J1bGxldFBvaW50LnRzIiwic3JjL2xvZ2ljL0RldGVjdENsaWNrT25CdWxsZXQudHMiLCJzcmMvZmVhdHVyZXMvWm9vbU9uQ2xpY2tGZWF0dXJlLnRzIiwic3JjL3NlcnZpY2VzL0xvZ2dlclNlcnZpY2UudHMiLCJzcmMvc2VydmljZXMvU2V0dGluZ3NTZXJ2aWNlLnRzIiwic3JjL09ic2lkaWFuWm9vbVBsdWdpbi50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXHJcbkNvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLlxyXG5cclxuUGVybWlzc2lvbiB0byB1c2UsIGNvcHksIG1vZGlmeSwgYW5kL29yIGRpc3RyaWJ1dGUgdGhpcyBzb2Z0d2FyZSBmb3IgYW55XHJcbnB1cnBvc2Ugd2l0aCBvciB3aXRob3V0IGZlZSBpcyBoZXJlYnkgZ3JhbnRlZC5cclxuXHJcblRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIgQU5EIFRIRSBBVVRIT1IgRElTQ0xBSU1TIEFMTCBXQVJSQU5USUVTIFdJVEhcclxuUkVHQVJEIFRPIFRISVMgU09GVFdBUkUgSU5DTFVESU5HIEFMTCBJTVBMSUVEIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZXHJcbkFORCBGSVRORVNTLiBJTiBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SIEJFIExJQUJMRSBGT1IgQU5ZIFNQRUNJQUwsIERJUkVDVCxcclxuSU5ESVJFQ1QsIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFUyBPUiBBTlkgREFNQUdFUyBXSEFUU09FVkVSIFJFU1VMVElORyBGUk9NXHJcbkxPU1MgT0YgVVNFLCBEQVRBIE9SIFBST0ZJVFMsIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBORUdMSUdFTkNFIE9SXHJcbk9USEVSIFRPUlRJT1VTIEFDVElPTiwgQVJJU0lORyBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBVU0UgT1JcclxuUEVSRk9STUFOQ0UgT0YgVEhJUyBTT0ZUV0FSRS5cclxuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiogKi9cclxuLyogZ2xvYmFsIFJlZmxlY3QsIFByb21pc2UgKi9cclxuXHJcbnZhciBleHRlbmRTdGF0aWNzID0gZnVuY3Rpb24oZCwgYikge1xyXG4gICAgZXh0ZW5kU3RhdGljcyA9IE9iamVjdC5zZXRQcm90b3R5cGVPZiB8fFxyXG4gICAgICAgICh7IF9fcHJvdG9fXzogW10gfSBpbnN0YW5jZW9mIEFycmF5ICYmIGZ1bmN0aW9uIChkLCBiKSB7IGQuX19wcm90b19fID0gYjsgfSkgfHxcclxuICAgICAgICBmdW5jdGlvbiAoZCwgYikgeyBmb3IgKHZhciBwIGluIGIpIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoYiwgcCkpIGRbcF0gPSBiW3BdOyB9O1xyXG4gICAgcmV0dXJuIGV4dGVuZFN0YXRpY3MoZCwgYik7XHJcbn07XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19leHRlbmRzKGQsIGIpIHtcclxuICAgIGlmICh0eXBlb2YgYiAhPT0gXCJmdW5jdGlvblwiICYmIGIgIT09IG51bGwpXHJcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkNsYXNzIGV4dGVuZHMgdmFsdWUgXCIgKyBTdHJpbmcoYikgKyBcIiBpcyBub3QgYSBjb25zdHJ1Y3RvciBvciBudWxsXCIpO1xyXG4gICAgZXh0ZW5kU3RhdGljcyhkLCBiKTtcclxuICAgIGZ1bmN0aW9uIF9fKCkgeyB0aGlzLmNvbnN0cnVjdG9yID0gZDsgfVxyXG4gICAgZC5wcm90b3R5cGUgPSBiID09PSBudWxsID8gT2JqZWN0LmNyZWF0ZShiKSA6IChfXy5wcm90b3R5cGUgPSBiLnByb3RvdHlwZSwgbmV3IF9fKCkpO1xyXG59XHJcblxyXG5leHBvcnQgdmFyIF9fYXNzaWduID0gZnVuY3Rpb24oKSB7XHJcbiAgICBfX2Fzc2lnbiA9IE9iamVjdC5hc3NpZ24gfHwgZnVuY3Rpb24gX19hc3NpZ24odCkge1xyXG4gICAgICAgIGZvciAodmFyIHMsIGkgPSAxLCBuID0gYXJndW1lbnRzLmxlbmd0aDsgaSA8IG47IGkrKykge1xyXG4gICAgICAgICAgICBzID0gYXJndW1lbnRzW2ldO1xyXG4gICAgICAgICAgICBmb3IgKHZhciBwIGluIHMpIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocywgcCkpIHRbcF0gPSBzW3BdO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdDtcclxuICAgIH1cclxuICAgIHJldHVybiBfX2Fzc2lnbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19yZXN0KHMsIGUpIHtcclxuICAgIHZhciB0ID0ge307XHJcbiAgICBmb3IgKHZhciBwIGluIHMpIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocywgcCkgJiYgZS5pbmRleE9mKHApIDwgMClcclxuICAgICAgICB0W3BdID0gc1twXTtcclxuICAgIGlmIChzICE9IG51bGwgJiYgdHlwZW9mIE9iamVjdC5nZXRPd25Qcm9wZXJ0eVN5bWJvbHMgPT09IFwiZnVuY3Rpb25cIilcclxuICAgICAgICBmb3IgKHZhciBpID0gMCwgcCA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eVN5bWJvbHMocyk7IGkgPCBwLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGlmIChlLmluZGV4T2YocFtpXSkgPCAwICYmIE9iamVjdC5wcm90b3R5cGUucHJvcGVydHlJc0VudW1lcmFibGUuY2FsbChzLCBwW2ldKSlcclxuICAgICAgICAgICAgICAgIHRbcFtpXV0gPSBzW3BbaV1dO1xyXG4gICAgICAgIH1cclxuICAgIHJldHVybiB0O1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19kZWNvcmF0ZShkZWNvcmF0b3JzLCB0YXJnZXQsIGtleSwgZGVzYykge1xyXG4gICAgdmFyIGMgPSBhcmd1bWVudHMubGVuZ3RoLCByID0gYyA8IDMgPyB0YXJnZXQgOiBkZXNjID09PSBudWxsID8gZGVzYyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IodGFyZ2V0LCBrZXkpIDogZGVzYywgZDtcclxuICAgIGlmICh0eXBlb2YgUmVmbGVjdCA9PT0gXCJvYmplY3RcIiAmJiB0eXBlb2YgUmVmbGVjdC5kZWNvcmF0ZSA9PT0gXCJmdW5jdGlvblwiKSByID0gUmVmbGVjdC5kZWNvcmF0ZShkZWNvcmF0b3JzLCB0YXJnZXQsIGtleSwgZGVzYyk7XHJcbiAgICBlbHNlIGZvciAodmFyIGkgPSBkZWNvcmF0b3JzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSBpZiAoZCA9IGRlY29yYXRvcnNbaV0pIHIgPSAoYyA8IDMgPyBkKHIpIDogYyA+IDMgPyBkKHRhcmdldCwga2V5LCByKSA6IGQodGFyZ2V0LCBrZXkpKSB8fCByO1xyXG4gICAgcmV0dXJuIGMgPiAzICYmIHIgJiYgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRhcmdldCwga2V5LCByKSwgcjtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fcGFyYW0ocGFyYW1JbmRleCwgZGVjb3JhdG9yKSB7XHJcbiAgICByZXR1cm4gZnVuY3Rpb24gKHRhcmdldCwga2V5KSB7IGRlY29yYXRvcih0YXJnZXQsIGtleSwgcGFyYW1JbmRleCk7IH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fZXNEZWNvcmF0ZShjdG9yLCBkZXNjcmlwdG9ySW4sIGRlY29yYXRvcnMsIGNvbnRleHRJbiwgaW5pdGlhbGl6ZXJzLCBleHRyYUluaXRpYWxpemVycykge1xyXG4gICAgZnVuY3Rpb24gYWNjZXB0KGYpIHsgaWYgKGYgIT09IHZvaWQgMCAmJiB0eXBlb2YgZiAhPT0gXCJmdW5jdGlvblwiKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiRnVuY3Rpb24gZXhwZWN0ZWRcIik7IHJldHVybiBmOyB9XHJcbiAgICB2YXIga2luZCA9IGNvbnRleHRJbi5raW5kLCBrZXkgPSBraW5kID09PSBcImdldHRlclwiID8gXCJnZXRcIiA6IGtpbmQgPT09IFwic2V0dGVyXCIgPyBcInNldFwiIDogXCJ2YWx1ZVwiO1xyXG4gICAgdmFyIHRhcmdldCA9ICFkZXNjcmlwdG9ySW4gJiYgY3RvciA/IGNvbnRleHRJbltcInN0YXRpY1wiXSA/IGN0b3IgOiBjdG9yLnByb3RvdHlwZSA6IG51bGw7XHJcbiAgICB2YXIgZGVzY3JpcHRvciA9IGRlc2NyaXB0b3JJbiB8fCAodGFyZ2V0ID8gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcih0YXJnZXQsIGNvbnRleHRJbi5uYW1lKSA6IHt9KTtcclxuICAgIHZhciBfLCBkb25lID0gZmFsc2U7XHJcbiAgICBmb3IgKHZhciBpID0gZGVjb3JhdG9ycy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG4gICAgICAgIHZhciBjb250ZXh0ID0ge307XHJcbiAgICAgICAgZm9yICh2YXIgcCBpbiBjb250ZXh0SW4pIGNvbnRleHRbcF0gPSBwID09PSBcImFjY2Vzc1wiID8ge30gOiBjb250ZXh0SW5bcF07XHJcbiAgICAgICAgZm9yICh2YXIgcCBpbiBjb250ZXh0SW4uYWNjZXNzKSBjb250ZXh0LmFjY2Vzc1twXSA9IGNvbnRleHRJbi5hY2Nlc3NbcF07XHJcbiAgICAgICAgY29udGV4dC5hZGRJbml0aWFsaXplciA9IGZ1bmN0aW9uIChmKSB7IGlmIChkb25lKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiQ2Fubm90IGFkZCBpbml0aWFsaXplcnMgYWZ0ZXIgZGVjb3JhdGlvbiBoYXMgY29tcGxldGVkXCIpOyBleHRyYUluaXRpYWxpemVycy5wdXNoKGFjY2VwdChmIHx8IG51bGwpKTsgfTtcclxuICAgICAgICB2YXIgcmVzdWx0ID0gKDAsIGRlY29yYXRvcnNbaV0pKGtpbmQgPT09IFwiYWNjZXNzb3JcIiA/IHsgZ2V0OiBkZXNjcmlwdG9yLmdldCwgc2V0OiBkZXNjcmlwdG9yLnNldCB9IDogZGVzY3JpcHRvcltrZXldLCBjb250ZXh0KTtcclxuICAgICAgICBpZiAoa2luZCA9PT0gXCJhY2Nlc3NvclwiKSB7XHJcbiAgICAgICAgICAgIGlmIChyZXN1bHQgPT09IHZvaWQgMCkgY29udGludWU7XHJcbiAgICAgICAgICAgIGlmIChyZXN1bHQgPT09IG51bGwgfHwgdHlwZW9mIHJlc3VsdCAhPT0gXCJvYmplY3RcIikgdGhyb3cgbmV3IFR5cGVFcnJvcihcIk9iamVjdCBleHBlY3RlZFwiKTtcclxuICAgICAgICAgICAgaWYgKF8gPSBhY2NlcHQocmVzdWx0LmdldCkpIGRlc2NyaXB0b3IuZ2V0ID0gXztcclxuICAgICAgICAgICAgaWYgKF8gPSBhY2NlcHQocmVzdWx0LnNldCkpIGRlc2NyaXB0b3Iuc2V0ID0gXztcclxuICAgICAgICAgICAgaWYgKF8gPSBhY2NlcHQocmVzdWx0LmluaXQpKSBpbml0aWFsaXplcnMucHVzaChfKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSBpZiAoXyA9IGFjY2VwdChyZXN1bHQpKSB7XHJcbiAgICAgICAgICAgIGlmIChraW5kID09PSBcImZpZWxkXCIpIGluaXRpYWxpemVycy5wdXNoKF8pO1xyXG4gICAgICAgICAgICBlbHNlIGRlc2NyaXB0b3Jba2V5XSA9IF87XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgaWYgKHRhcmdldCkgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRhcmdldCwgY29udGV4dEluLm5hbWUsIGRlc2NyaXB0b3IpO1xyXG4gICAgZG9uZSA9IHRydWU7XHJcbn07XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19ydW5Jbml0aWFsaXplcnModGhpc0FyZywgaW5pdGlhbGl6ZXJzLCB2YWx1ZSkge1xyXG4gICAgdmFyIHVzZVZhbHVlID0gYXJndW1lbnRzLmxlbmd0aCA+IDI7XHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGluaXRpYWxpemVycy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIHZhbHVlID0gdXNlVmFsdWUgPyBpbml0aWFsaXplcnNbaV0uY2FsbCh0aGlzQXJnLCB2YWx1ZSkgOiBpbml0aWFsaXplcnNbaV0uY2FsbCh0aGlzQXJnKTtcclxuICAgIH1cclxuICAgIHJldHVybiB1c2VWYWx1ZSA/IHZhbHVlIDogdm9pZCAwO1xyXG59O1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fcHJvcEtleSh4KSB7XHJcbiAgICByZXR1cm4gdHlwZW9mIHggPT09IFwic3ltYm9sXCIgPyB4IDogXCJcIi5jb25jYXQoeCk7XHJcbn07XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19zZXRGdW5jdGlvbk5hbWUoZiwgbmFtZSwgcHJlZml4KSB7XHJcbiAgICBpZiAodHlwZW9mIG5hbWUgPT09IFwic3ltYm9sXCIpIG5hbWUgPSBuYW1lLmRlc2NyaXB0aW9uID8gXCJbXCIuY29uY2F0KG5hbWUuZGVzY3JpcHRpb24sIFwiXVwiKSA6IFwiXCI7XHJcbiAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnR5KGYsIFwibmFtZVwiLCB7IGNvbmZpZ3VyYWJsZTogdHJ1ZSwgdmFsdWU6IHByZWZpeCA/IFwiXCIuY29uY2F0KHByZWZpeCwgXCIgXCIsIG5hbWUpIDogbmFtZSB9KTtcclxufTtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX21ldGFkYXRhKG1ldGFkYXRhS2V5LCBtZXRhZGF0YVZhbHVlKSB7XHJcbiAgICBpZiAodHlwZW9mIFJlZmxlY3QgPT09IFwib2JqZWN0XCIgJiYgdHlwZW9mIFJlZmxlY3QubWV0YWRhdGEgPT09IFwiZnVuY3Rpb25cIikgcmV0dXJuIFJlZmxlY3QubWV0YWRhdGEobWV0YWRhdGFLZXksIG1ldGFkYXRhVmFsdWUpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19hd2FpdGVyKHRoaXNBcmcsIF9hcmd1bWVudHMsIFAsIGdlbmVyYXRvcikge1xyXG4gICAgZnVuY3Rpb24gYWRvcHQodmFsdWUpIHsgcmV0dXJuIHZhbHVlIGluc3RhbmNlb2YgUCA/IHZhbHVlIDogbmV3IFAoZnVuY3Rpb24gKHJlc29sdmUpIHsgcmVzb2x2ZSh2YWx1ZSk7IH0pOyB9XHJcbiAgICByZXR1cm4gbmV3IChQIHx8IChQID0gUHJvbWlzZSkpKGZ1bmN0aW9uIChyZXNvbHZlLCByZWplY3QpIHtcclxuICAgICAgICBmdW5jdGlvbiBmdWxmaWxsZWQodmFsdWUpIHsgdHJ5IHsgc3RlcChnZW5lcmF0b3IubmV4dCh2YWx1ZSkpOyB9IGNhdGNoIChlKSB7IHJlamVjdChlKTsgfSB9XHJcbiAgICAgICAgZnVuY3Rpb24gcmVqZWN0ZWQodmFsdWUpIHsgdHJ5IHsgc3RlcChnZW5lcmF0b3JbXCJ0aHJvd1wiXSh2YWx1ZSkpOyB9IGNhdGNoIChlKSB7IHJlamVjdChlKTsgfSB9XHJcbiAgICAgICAgZnVuY3Rpb24gc3RlcChyZXN1bHQpIHsgcmVzdWx0LmRvbmUgPyByZXNvbHZlKHJlc3VsdC52YWx1ZSkgOiBhZG9wdChyZXN1bHQudmFsdWUpLnRoZW4oZnVsZmlsbGVkLCByZWplY3RlZCk7IH1cclxuICAgICAgICBzdGVwKChnZW5lcmF0b3IgPSBnZW5lcmF0b3IuYXBwbHkodGhpc0FyZywgX2FyZ3VtZW50cyB8fCBbXSkpLm5leHQoKSk7XHJcbiAgICB9KTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fZ2VuZXJhdG9yKHRoaXNBcmcsIGJvZHkpIHtcclxuICAgIHZhciBfID0geyBsYWJlbDogMCwgc2VudDogZnVuY3Rpb24oKSB7IGlmICh0WzBdICYgMSkgdGhyb3cgdFsxXTsgcmV0dXJuIHRbMV07IH0sIHRyeXM6IFtdLCBvcHM6IFtdIH0sIGYsIHksIHQsIGc7XHJcbiAgICByZXR1cm4gZyA9IHsgbmV4dDogdmVyYigwKSwgXCJ0aHJvd1wiOiB2ZXJiKDEpLCBcInJldHVyblwiOiB2ZXJiKDIpIH0sIHR5cGVvZiBTeW1ib2wgPT09IFwiZnVuY3Rpb25cIiAmJiAoZ1tTeW1ib2wuaXRlcmF0b3JdID0gZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzOyB9KSwgZztcclxuICAgIGZ1bmN0aW9uIHZlcmIobikgeyByZXR1cm4gZnVuY3Rpb24gKHYpIHsgcmV0dXJuIHN0ZXAoW24sIHZdKTsgfTsgfVxyXG4gICAgZnVuY3Rpb24gc3RlcChvcCkge1xyXG4gICAgICAgIGlmIChmKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiR2VuZXJhdG9yIGlzIGFscmVhZHkgZXhlY3V0aW5nLlwiKTtcclxuICAgICAgICB3aGlsZSAoZyAmJiAoZyA9IDAsIG9wWzBdICYmIChfID0gMCkpLCBfKSB0cnkge1xyXG4gICAgICAgICAgICBpZiAoZiA9IDEsIHkgJiYgKHQgPSBvcFswXSAmIDIgPyB5W1wicmV0dXJuXCJdIDogb3BbMF0gPyB5W1widGhyb3dcIl0gfHwgKCh0ID0geVtcInJldHVyblwiXSkgJiYgdC5jYWxsKHkpLCAwKSA6IHkubmV4dCkgJiYgISh0ID0gdC5jYWxsKHksIG9wWzFdKSkuZG9uZSkgcmV0dXJuIHQ7XHJcbiAgICAgICAgICAgIGlmICh5ID0gMCwgdCkgb3AgPSBbb3BbMF0gJiAyLCB0LnZhbHVlXTtcclxuICAgICAgICAgICAgc3dpdGNoIChvcFswXSkge1xyXG4gICAgICAgICAgICAgICAgY2FzZSAwOiBjYXNlIDE6IHQgPSBvcDsgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIDQ6IF8ubGFiZWwrKzsgcmV0dXJuIHsgdmFsdWU6IG9wWzFdLCBkb25lOiBmYWxzZSB9O1xyXG4gICAgICAgICAgICAgICAgY2FzZSA1OiBfLmxhYmVsKys7IHkgPSBvcFsxXTsgb3AgPSBbMF07IGNvbnRpbnVlO1xyXG4gICAgICAgICAgICAgICAgY2FzZSA3OiBvcCA9IF8ub3BzLnBvcCgpOyBfLnRyeXMucG9wKCk7IGNvbnRpbnVlO1xyXG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgICAgICBpZiAoISh0ID0gXy50cnlzLCB0ID0gdC5sZW5ndGggPiAwICYmIHRbdC5sZW5ndGggLSAxXSkgJiYgKG9wWzBdID09PSA2IHx8IG9wWzBdID09PSAyKSkgeyBfID0gMDsgY29udGludWU7IH1cclxuICAgICAgICAgICAgICAgICAgICBpZiAob3BbMF0gPT09IDMgJiYgKCF0IHx8IChvcFsxXSA+IHRbMF0gJiYgb3BbMV0gPCB0WzNdKSkpIHsgXy5sYWJlbCA9IG9wWzFdOyBicmVhazsgfVxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChvcFswXSA9PT0gNiAmJiBfLmxhYmVsIDwgdFsxXSkgeyBfLmxhYmVsID0gdFsxXTsgdCA9IG9wOyBicmVhazsgfVxyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0ICYmIF8ubGFiZWwgPCB0WzJdKSB7IF8ubGFiZWwgPSB0WzJdOyBfLm9wcy5wdXNoKG9wKTsgYnJlYWs7IH1cclxuICAgICAgICAgICAgICAgICAgICBpZiAodFsyXSkgXy5vcHMucG9wKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgXy50cnlzLnBvcCgpOyBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBvcCA9IGJvZHkuY2FsbCh0aGlzQXJnLCBfKTtcclxuICAgICAgICB9IGNhdGNoIChlKSB7IG9wID0gWzYsIGVdOyB5ID0gMDsgfSBmaW5hbGx5IHsgZiA9IHQgPSAwOyB9XHJcbiAgICAgICAgaWYgKG9wWzBdICYgNSkgdGhyb3cgb3BbMV07IHJldHVybiB7IHZhbHVlOiBvcFswXSA/IG9wWzFdIDogdm9pZCAwLCBkb25lOiB0cnVlIH07XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCB2YXIgX19jcmVhdGVCaW5kaW5nID0gT2JqZWN0LmNyZWF0ZSA/IChmdW5jdGlvbihvLCBtLCBrLCBrMikge1xyXG4gICAgaWYgKGsyID09PSB1bmRlZmluZWQpIGsyID0gaztcclxuICAgIHZhciBkZXNjID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcihtLCBrKTtcclxuICAgIGlmICghZGVzYyB8fCAoXCJnZXRcIiBpbiBkZXNjID8gIW0uX19lc01vZHVsZSA6IGRlc2Mud3JpdGFibGUgfHwgZGVzYy5jb25maWd1cmFibGUpKSB7XHJcbiAgICAgICAgZGVzYyA9IHsgZW51bWVyYWJsZTogdHJ1ZSwgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIG1ba107IH0gfTtcclxuICAgIH1cclxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShvLCBrMiwgZGVzYyk7XHJcbn0pIDogKGZ1bmN0aW9uKG8sIG0sIGssIGsyKSB7XHJcbiAgICBpZiAoazIgPT09IHVuZGVmaW5lZCkgazIgPSBrO1xyXG4gICAgb1trMl0gPSBtW2tdO1xyXG59KTtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2V4cG9ydFN0YXIobSwgbykge1xyXG4gICAgZm9yICh2YXIgcCBpbiBtKSBpZiAocCAhPT0gXCJkZWZhdWx0XCIgJiYgIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvLCBwKSkgX19jcmVhdGVCaW5kaW5nKG8sIG0sIHApO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX192YWx1ZXMobykge1xyXG4gICAgdmFyIHMgPSB0eXBlb2YgU3ltYm9sID09PSBcImZ1bmN0aW9uXCIgJiYgU3ltYm9sLml0ZXJhdG9yLCBtID0gcyAmJiBvW3NdLCBpID0gMDtcclxuICAgIGlmIChtKSByZXR1cm4gbS5jYWxsKG8pO1xyXG4gICAgaWYgKG8gJiYgdHlwZW9mIG8ubGVuZ3RoID09PSBcIm51bWJlclwiKSByZXR1cm4ge1xyXG4gICAgICAgIG5leHQ6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgaWYgKG8gJiYgaSA+PSBvLmxlbmd0aCkgbyA9IHZvaWQgMDtcclxuICAgICAgICAgICAgcmV0dXJuIHsgdmFsdWU6IG8gJiYgb1tpKytdLCBkb25lOiAhbyB9O1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKHMgPyBcIk9iamVjdCBpcyBub3QgaXRlcmFibGUuXCIgOiBcIlN5bWJvbC5pdGVyYXRvciBpcyBub3QgZGVmaW5lZC5cIik7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX3JlYWQobywgbikge1xyXG4gICAgdmFyIG0gPSB0eXBlb2YgU3ltYm9sID09PSBcImZ1bmN0aW9uXCIgJiYgb1tTeW1ib2wuaXRlcmF0b3JdO1xyXG4gICAgaWYgKCFtKSByZXR1cm4gbztcclxuICAgIHZhciBpID0gbS5jYWxsKG8pLCByLCBhciA9IFtdLCBlO1xyXG4gICAgdHJ5IHtcclxuICAgICAgICB3aGlsZSAoKG4gPT09IHZvaWQgMCB8fCBuLS0gPiAwKSAmJiAhKHIgPSBpLm5leHQoKSkuZG9uZSkgYXIucHVzaChyLnZhbHVlKTtcclxuICAgIH1cclxuICAgIGNhdGNoIChlcnJvcikgeyBlID0geyBlcnJvcjogZXJyb3IgfTsgfVxyXG4gICAgZmluYWxseSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgaWYgKHIgJiYgIXIuZG9uZSAmJiAobSA9IGlbXCJyZXR1cm5cIl0pKSBtLmNhbGwoaSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGZpbmFsbHkgeyBpZiAoZSkgdGhyb3cgZS5lcnJvcjsgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIGFyO1xyXG59XHJcblxyXG4vKiogQGRlcHJlY2F0ZWQgKi9cclxuZXhwb3J0IGZ1bmN0aW9uIF9fc3ByZWFkKCkge1xyXG4gICAgZm9yICh2YXIgYXIgPSBbXSwgaSA9IDA7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspXHJcbiAgICAgICAgYXIgPSBhci5jb25jYXQoX19yZWFkKGFyZ3VtZW50c1tpXSkpO1xyXG4gICAgcmV0dXJuIGFyO1xyXG59XHJcblxyXG4vKiogQGRlcHJlY2F0ZWQgKi9cclxuZXhwb3J0IGZ1bmN0aW9uIF9fc3ByZWFkQXJyYXlzKCkge1xyXG4gICAgZm9yICh2YXIgcyA9IDAsIGkgPSAwLCBpbCA9IGFyZ3VtZW50cy5sZW5ndGg7IGkgPCBpbDsgaSsrKSBzICs9IGFyZ3VtZW50c1tpXS5sZW5ndGg7XHJcbiAgICBmb3IgKHZhciByID0gQXJyYXkocyksIGsgPSAwLCBpID0gMDsgaSA8IGlsOyBpKyspXHJcbiAgICAgICAgZm9yICh2YXIgYSA9IGFyZ3VtZW50c1tpXSwgaiA9IDAsIGpsID0gYS5sZW5ndGg7IGogPCBqbDsgaisrLCBrKyspXHJcbiAgICAgICAgICAgIHJba10gPSBhW2pdO1xyXG4gICAgcmV0dXJuIHI7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX3NwcmVhZEFycmF5KHRvLCBmcm9tLCBwYWNrKSB7XHJcbiAgICBpZiAocGFjayB8fCBhcmd1bWVudHMubGVuZ3RoID09PSAyKSBmb3IgKHZhciBpID0gMCwgbCA9IGZyb20ubGVuZ3RoLCBhcjsgaSA8IGw7IGkrKykge1xyXG4gICAgICAgIGlmIChhciB8fCAhKGkgaW4gZnJvbSkpIHtcclxuICAgICAgICAgICAgaWYgKCFhcikgYXIgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChmcm9tLCAwLCBpKTtcclxuICAgICAgICAgICAgYXJbaV0gPSBmcm9tW2ldO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiB0by5jb25jYXQoYXIgfHwgQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoZnJvbSkpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19hd2FpdCh2KSB7XHJcbiAgICByZXR1cm4gdGhpcyBpbnN0YW5jZW9mIF9fYXdhaXQgPyAodGhpcy52ID0gdiwgdGhpcykgOiBuZXcgX19hd2FpdCh2KTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fYXN5bmNHZW5lcmF0b3IodGhpc0FyZywgX2FyZ3VtZW50cywgZ2VuZXJhdG9yKSB7XHJcbiAgICBpZiAoIVN5bWJvbC5hc3luY0l0ZXJhdG9yKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiU3ltYm9sLmFzeW5jSXRlcmF0b3IgaXMgbm90IGRlZmluZWQuXCIpO1xyXG4gICAgdmFyIGcgPSBnZW5lcmF0b3IuYXBwbHkodGhpc0FyZywgX2FyZ3VtZW50cyB8fCBbXSksIGksIHEgPSBbXTtcclxuICAgIHJldHVybiBpID0ge30sIHZlcmIoXCJuZXh0XCIpLCB2ZXJiKFwidGhyb3dcIiksIHZlcmIoXCJyZXR1cm5cIiksIGlbU3ltYm9sLmFzeW5jSXRlcmF0b3JdID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gdGhpczsgfSwgaTtcclxuICAgIGZ1bmN0aW9uIHZlcmIobikgeyBpZiAoZ1tuXSkgaVtuXSA9IGZ1bmN0aW9uICh2KSB7IHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbiAoYSwgYikgeyBxLnB1c2goW24sIHYsIGEsIGJdKSA+IDEgfHwgcmVzdW1lKG4sIHYpOyB9KTsgfTsgfVxyXG4gICAgZnVuY3Rpb24gcmVzdW1lKG4sIHYpIHsgdHJ5IHsgc3RlcChnW25dKHYpKTsgfSBjYXRjaCAoZSkgeyBzZXR0bGUocVswXVszXSwgZSk7IH0gfVxyXG4gICAgZnVuY3Rpb24gc3RlcChyKSB7IHIudmFsdWUgaW5zdGFuY2VvZiBfX2F3YWl0ID8gUHJvbWlzZS5yZXNvbHZlKHIudmFsdWUudikudGhlbihmdWxmaWxsLCByZWplY3QpIDogc2V0dGxlKHFbMF1bMl0sIHIpOyB9XHJcbiAgICBmdW5jdGlvbiBmdWxmaWxsKHZhbHVlKSB7IHJlc3VtZShcIm5leHRcIiwgdmFsdWUpOyB9XHJcbiAgICBmdW5jdGlvbiByZWplY3QodmFsdWUpIHsgcmVzdW1lKFwidGhyb3dcIiwgdmFsdWUpOyB9XHJcbiAgICBmdW5jdGlvbiBzZXR0bGUoZiwgdikgeyBpZiAoZih2KSwgcS5zaGlmdCgpLCBxLmxlbmd0aCkgcmVzdW1lKHFbMF1bMF0sIHFbMF1bMV0pOyB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2FzeW5jRGVsZWdhdG9yKG8pIHtcclxuICAgIHZhciBpLCBwO1xyXG4gICAgcmV0dXJuIGkgPSB7fSwgdmVyYihcIm5leHRcIiksIHZlcmIoXCJ0aHJvd1wiLCBmdW5jdGlvbiAoZSkgeyB0aHJvdyBlOyB9KSwgdmVyYihcInJldHVyblwiKSwgaVtTeW1ib2wuaXRlcmF0b3JdID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gdGhpczsgfSwgaTtcclxuICAgIGZ1bmN0aW9uIHZlcmIobiwgZikgeyBpW25dID0gb1tuXSA/IGZ1bmN0aW9uICh2KSB7IHJldHVybiAocCA9ICFwKSA/IHsgdmFsdWU6IF9fYXdhaXQob1tuXSh2KSksIGRvbmU6IGZhbHNlIH0gOiBmID8gZih2KSA6IHY7IH0gOiBmOyB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2FzeW5jVmFsdWVzKG8pIHtcclxuICAgIGlmICghU3ltYm9sLmFzeW5jSXRlcmF0b3IpIHRocm93IG5ldyBUeXBlRXJyb3IoXCJTeW1ib2wuYXN5bmNJdGVyYXRvciBpcyBub3QgZGVmaW5lZC5cIik7XHJcbiAgICB2YXIgbSA9IG9bU3ltYm9sLmFzeW5jSXRlcmF0b3JdLCBpO1xyXG4gICAgcmV0dXJuIG0gPyBtLmNhbGwobykgOiAobyA9IHR5cGVvZiBfX3ZhbHVlcyA9PT0gXCJmdW5jdGlvblwiID8gX192YWx1ZXMobykgOiBvW1N5bWJvbC5pdGVyYXRvcl0oKSwgaSA9IHt9LCB2ZXJiKFwibmV4dFwiKSwgdmVyYihcInRocm93XCIpLCB2ZXJiKFwicmV0dXJuXCIpLCBpW1N5bWJvbC5hc3luY0l0ZXJhdG9yXSA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHRoaXM7IH0sIGkpO1xyXG4gICAgZnVuY3Rpb24gdmVyYihuKSB7IGlbbl0gPSBvW25dICYmIGZ1bmN0aW9uICh2KSB7IHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbiAocmVzb2x2ZSwgcmVqZWN0KSB7IHYgPSBvW25dKHYpLCBzZXR0bGUocmVzb2x2ZSwgcmVqZWN0LCB2LmRvbmUsIHYudmFsdWUpOyB9KTsgfTsgfVxyXG4gICAgZnVuY3Rpb24gc2V0dGxlKHJlc29sdmUsIHJlamVjdCwgZCwgdikgeyBQcm9taXNlLnJlc29sdmUodikudGhlbihmdW5jdGlvbih2KSB7IHJlc29sdmUoeyB2YWx1ZTogdiwgZG9uZTogZCB9KTsgfSwgcmVqZWN0KTsgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19tYWtlVGVtcGxhdGVPYmplY3QoY29va2VkLCByYXcpIHtcclxuICAgIGlmIChPYmplY3QuZGVmaW5lUHJvcGVydHkpIHsgT2JqZWN0LmRlZmluZVByb3BlcnR5KGNvb2tlZCwgXCJyYXdcIiwgeyB2YWx1ZTogcmF3IH0pOyB9IGVsc2UgeyBjb29rZWQucmF3ID0gcmF3OyB9XHJcbiAgICByZXR1cm4gY29va2VkO1xyXG59O1xyXG5cclxudmFyIF9fc2V0TW9kdWxlRGVmYXVsdCA9IE9iamVjdC5jcmVhdGUgPyAoZnVuY3Rpb24obywgdikge1xyXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KG8sIFwiZGVmYXVsdFwiLCB7IGVudW1lcmFibGU6IHRydWUsIHZhbHVlOiB2IH0pO1xyXG59KSA6IGZ1bmN0aW9uKG8sIHYpIHtcclxuICAgIG9bXCJkZWZhdWx0XCJdID0gdjtcclxufTtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2ltcG9ydFN0YXIobW9kKSB7XHJcbiAgICBpZiAobW9kICYmIG1vZC5fX2VzTW9kdWxlKSByZXR1cm4gbW9kO1xyXG4gICAgdmFyIHJlc3VsdCA9IHt9O1xyXG4gICAgaWYgKG1vZCAhPSBudWxsKSBmb3IgKHZhciBrIGluIG1vZCkgaWYgKGsgIT09IFwiZGVmYXVsdFwiICYmIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChtb2QsIGspKSBfX2NyZWF0ZUJpbmRpbmcocmVzdWx0LCBtb2QsIGspO1xyXG4gICAgX19zZXRNb2R1bGVEZWZhdWx0KHJlc3VsdCwgbW9kKTtcclxuICAgIHJldHVybiByZXN1bHQ7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2ltcG9ydERlZmF1bHQobW9kKSB7XHJcbiAgICByZXR1cm4gKG1vZCAmJiBtb2QuX19lc01vZHVsZSkgPyBtb2QgOiB7IGRlZmF1bHQ6IG1vZCB9O1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19jbGFzc1ByaXZhdGVGaWVsZEdldChyZWNlaXZlciwgc3RhdGUsIGtpbmQsIGYpIHtcclxuICAgIGlmIChraW5kID09PSBcImFcIiAmJiAhZikgdGhyb3cgbmV3IFR5cGVFcnJvcihcIlByaXZhdGUgYWNjZXNzb3Igd2FzIGRlZmluZWQgd2l0aG91dCBhIGdldHRlclwiKTtcclxuICAgIGlmICh0eXBlb2Ygc3RhdGUgPT09IFwiZnVuY3Rpb25cIiA/IHJlY2VpdmVyICE9PSBzdGF0ZSB8fCAhZiA6ICFzdGF0ZS5oYXMocmVjZWl2ZXIpKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiQ2Fubm90IHJlYWQgcHJpdmF0ZSBtZW1iZXIgZnJvbSBhbiBvYmplY3Qgd2hvc2UgY2xhc3MgZGlkIG5vdCBkZWNsYXJlIGl0XCIpO1xyXG4gICAgcmV0dXJuIGtpbmQgPT09IFwibVwiID8gZiA6IGtpbmQgPT09IFwiYVwiID8gZi5jYWxsKHJlY2VpdmVyKSA6IGYgPyBmLnZhbHVlIDogc3RhdGUuZ2V0KHJlY2VpdmVyKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fY2xhc3NQcml2YXRlRmllbGRTZXQocmVjZWl2ZXIsIHN0YXRlLCB2YWx1ZSwga2luZCwgZikge1xyXG4gICAgaWYgKGtpbmQgPT09IFwibVwiKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiUHJpdmF0ZSBtZXRob2QgaXMgbm90IHdyaXRhYmxlXCIpO1xyXG4gICAgaWYgKGtpbmQgPT09IFwiYVwiICYmICFmKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiUHJpdmF0ZSBhY2Nlc3NvciB3YXMgZGVmaW5lZCB3aXRob3V0IGEgc2V0dGVyXCIpO1xyXG4gICAgaWYgKHR5cGVvZiBzdGF0ZSA9PT0gXCJmdW5jdGlvblwiID8gcmVjZWl2ZXIgIT09IHN0YXRlIHx8ICFmIDogIXN0YXRlLmhhcyhyZWNlaXZlcikpIHRocm93IG5ldyBUeXBlRXJyb3IoXCJDYW5ub3Qgd3JpdGUgcHJpdmF0ZSBtZW1iZXIgdG8gYW4gb2JqZWN0IHdob3NlIGNsYXNzIGRpZCBub3QgZGVjbGFyZSBpdFwiKTtcclxuICAgIHJldHVybiAoa2luZCA9PT0gXCJhXCIgPyBmLmNhbGwocmVjZWl2ZXIsIHZhbHVlKSA6IGYgPyBmLnZhbHVlID0gdmFsdWUgOiBzdGF0ZS5zZXQocmVjZWl2ZXIsIHZhbHVlKSksIHZhbHVlO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19jbGFzc1ByaXZhdGVGaWVsZEluKHN0YXRlLCByZWNlaXZlcikge1xyXG4gICAgaWYgKHJlY2VpdmVyID09PSBudWxsIHx8ICh0eXBlb2YgcmVjZWl2ZXIgIT09IFwib2JqZWN0XCIgJiYgdHlwZW9mIHJlY2VpdmVyICE9PSBcImZ1bmN0aW9uXCIpKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiQ2Fubm90IHVzZSAnaW4nIG9wZXJhdG9yIG9uIG5vbi1vYmplY3RcIik7XHJcbiAgICByZXR1cm4gdHlwZW9mIHN0YXRlID09PSBcImZ1bmN0aW9uXCIgPyByZWNlaXZlciA9PT0gc3RhdGUgOiBzdGF0ZS5oYXMocmVjZWl2ZXIpO1xyXG59XHJcbiIsImltcG9ydCB7IGVkaXRvclZpZXdGaWVsZCB9IGZyb20gXCJvYnNpZGlhblwiO1xuXG5pbXBvcnQgeyBFZGl0b3JTdGF0ZSB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RG9jdW1lbnRUaXRsZShzdGF0ZTogRWRpdG9yU3RhdGUpIHtcbiAgcmV0dXJuIHN0YXRlLmZpZWxkKGVkaXRvclZpZXdGaWVsZCkuZ2V0RGlzcGxheVRleHQoKTtcbn1cbiIsImltcG9ydCB7IGVkaXRvckVkaXRvckZpZWxkIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmltcG9ydCB7IEVkaXRvclN0YXRlIH0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XG5pbXBvcnQgeyBFZGl0b3JWaWV3IH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldEVkaXRvclZpZXdGcm9tRWRpdG9yU3RhdGUoc3RhdGU6IEVkaXRvclN0YXRlKTogRWRpdG9yVmlldyB7XG4gIHJldHVybiBzdGF0ZS5maWVsZChlZGl0b3JFZGl0b3JGaWVsZCk7XG59XG4iLCJleHBvcnQgZnVuY3Rpb24gY2xlYW5UaXRsZSh0aXRsZTogc3RyaW5nKSB7XG4gIHJldHVybiB0aXRsZVxuICAgIC50cmltKClcbiAgICAucmVwbGFjZSgvXiMrKFxccykvLCBcIiQxXCIpXG4gICAgLnJlcGxhY2UoL14oWy0rKl18XFxkK1xcLikoXFxzKS8sIFwiJDJcIilcbiAgICAudHJpbSgpO1xufVxuIiwiaW1wb3J0IHsgZm9sZGFibGUgfSBmcm9tIFwiQGNvZGVtaXJyb3IvbGFuZ3VhZ2VcIjtcbmltcG9ydCB7IEVkaXRvclN0YXRlIH0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XG5cbmltcG9ydCB7IGNsZWFuVGl0bGUgfSBmcm9tIFwiLi91dGlscy9jbGVhblRpdGxlXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQnJlYWRjcnVtYiB7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIHBvczogbnVtYmVyIHwgbnVsbDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBHZXREb2N1bWVudFRpdGxlIHtcbiAgZ2V0RG9jdW1lbnRUaXRsZShzdGF0ZTogRWRpdG9yU3RhdGUpOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBDb2xsZWN0QnJlYWRjcnVtYnMge1xuICBjb25zdHJ1Y3Rvcihwcml2YXRlIGdldERvY3VtZW50VGl0bGU6IEdldERvY3VtZW50VGl0bGUpIHt9XG5cbiAgcHVibGljIGNvbGxlY3RCcmVhZGNydW1icyhzdGF0ZTogRWRpdG9yU3RhdGUsIHBvczogbnVtYmVyKSB7XG4gICAgY29uc3QgYnJlYWRjcnVtYnM6IEJyZWFkY3J1bWJbXSA9IFtcbiAgICAgIHsgdGl0bGU6IHRoaXMuZ2V0RG9jdW1lbnRUaXRsZS5nZXREb2N1bWVudFRpdGxlKHN0YXRlKSwgcG9zOiBudWxsIH0sXG4gICAgXTtcblxuICAgIGNvbnN0IHBvc0xpbmUgPSBzdGF0ZS5kb2MubGluZUF0KHBvcyk7XG5cbiAgICBmb3IgKGxldCBpID0gMTsgaSA8IHBvc0xpbmUubnVtYmVyOyBpKyspIHtcbiAgICAgIGNvbnN0IGxpbmUgPSBzdGF0ZS5kb2MubGluZShpKTtcbiAgICAgIGNvbnN0IGYgPSBmb2xkYWJsZShzdGF0ZSwgbGluZS5mcm9tLCBsaW5lLnRvKTtcbiAgICAgIGlmIChmICYmIGYudG8gPiBwb3NMaW5lLmZyb20pIHtcbiAgICAgICAgYnJlYWRjcnVtYnMucHVzaCh7IHRpdGxlOiBjbGVhblRpdGxlKGxpbmUudGV4dCksIHBvczogbGluZS5mcm9tIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGJyZWFkY3J1bWJzLnB1c2goe1xuICAgICAgdGl0bGU6IGNsZWFuVGl0bGUocG9zTGluZS50ZXh0KSxcbiAgICAgIHBvczogcG9zTGluZS5mcm9tLFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGJyZWFkY3J1bWJzO1xuICB9XG59XG4iLCJpbXBvcnQgeyBUcmFuc2FjdGlvbiB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xuXG5leHBvcnQgZnVuY3Rpb24gY2FsY3VsYXRlVmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0aW9uKFxuICB0cjogVHJhbnNhY3Rpb24sXG4gIGhpZGRlblJhbmdlczogQXJyYXk8eyBmcm9tOiBudW1iZXI7IHRvOiBudW1iZXIgfT5cbikge1xuICBsZXQgdG91Y2hlZEJlZm9yZSA9IGZhbHNlO1xuICBsZXQgdG91Y2hlZEFmdGVyID0gZmFsc2U7XG4gIGxldCB0b3VjaGVkSW5zaWRlID0gZmFsc2U7XG5cbiAgY29uc3QgdCA9IChmOiBudW1iZXIsIHQ6IG51bWJlcikgPT4gQm9vbGVhbih0ci5jaGFuZ2VzLnRvdWNoZXNSYW5nZShmLCB0KSk7XG5cbiAgaWYgKGhpZGRlblJhbmdlcy5sZW5ndGggPT09IDIpIHtcbiAgICBjb25zdCBbYSwgYl0gPSBoaWRkZW5SYW5nZXM7XG5cbiAgICB0b3VjaGVkQmVmb3JlID0gdChhLmZyb20sIGEudG8pO1xuICAgIHRvdWNoZWRJbnNpZGUgPSB0KGEudG8gKyAxLCBiLmZyb20gLSAxKTtcbiAgICB0b3VjaGVkQWZ0ZXIgPSB0KGIuZnJvbSwgYi50byk7XG4gIH1cblxuICBpZiAoaGlkZGVuUmFuZ2VzLmxlbmd0aCA9PT0gMSkge1xuICAgIGNvbnN0IFthXSA9IGhpZGRlblJhbmdlcztcblxuICAgIGlmIChhLmZyb20gPT09IDApIHtcbiAgICAgIHRvdWNoZWRCZWZvcmUgPSB0KGEuZnJvbSwgYS50byk7XG4gICAgICB0b3VjaGVkSW5zaWRlID0gdChhLnRvICsgMSwgdHIubmV3RG9jLmxlbmd0aCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRvdWNoZWRJbnNpZGUgPSB0KDAsIGEuZnJvbSAtIDEpO1xuICAgICAgdG91Y2hlZEFmdGVyID0gdChhLmZyb20sIGEudG8pO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IHRvdWNoZWRPdXRzaWRlID0gdG91Y2hlZEJlZm9yZSB8fCB0b3VjaGVkQWZ0ZXI7XG5cbiAgY29uc3QgcmVzID0ge1xuICAgIHRvdWNoZWRPdXRzaWRlLFxuICAgIHRvdWNoZWRCZWZvcmUsXG4gICAgdG91Y2hlZEFmdGVyLFxuICAgIHRvdWNoZWRJbnNpZGUsXG4gIH07XG5cbiAgcmV0dXJuIHJlcztcbn1cbiIsImltcG9ydCB7IEVkaXRvclN0YXRlLCBUcmFuc2FjdGlvbiB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xuXG5pbXBvcnQgeyBjYWxjdWxhdGVWaXNpYmxlQ29udGVudEJvdW5kYXJpZXNWaW9sYXRpb24gfSBmcm9tIFwiLi91dGlscy9jYWxjdWxhdGVWaXNpYmxlQ29udGVudEJvdW5kYXJpZXNWaW9sYXRpb25cIjtcblxuZXhwb3J0IGludGVyZmFjZSBSYW5nZUJlZm9yZVZpc2libGVSYW5nZUNoYW5nZWQge1xuICByYW5nZUJlZm9yZVZpc2libGVSYW5nZUNoYW5nZWQoc3RhdGU6IEVkaXRvclN0YXRlKTogdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDYWxjdWxhdGVIaWRkZW5Db250ZW50UmFuZ2VzIHtcbiAgY2FsY3VsYXRlSGlkZGVuQ29udGVudFJhbmdlcyhcbiAgICBzdGF0ZTogRWRpdG9yU3RhdGVcbiAgKTogeyBmcm9tOiBudW1iZXI7IHRvOiBudW1iZXIgfVtdIHwgbnVsbDtcbn1cblxuZXhwb3J0IGNsYXNzIERldGVjdFJhbmdlQmVmb3JlVmlzaWJsZVJhbmdlQ2hhbmdlZCB7XG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgY2FsY3VsYXRlSGlkZGVuQ29udGVudFJhbmdlczogQ2FsY3VsYXRlSGlkZGVuQ29udGVudFJhbmdlcyxcbiAgICBwcml2YXRlIHJhbmdlQmVmb3JlVmlzaWJsZVJhbmdlQ2hhbmdlZDogUmFuZ2VCZWZvcmVWaXNpYmxlUmFuZ2VDaGFuZ2VkXG4gICkge31cblxuICBnZXRFeHRlbnNpb24oKSB7XG4gICAgcmV0dXJuIEVkaXRvclN0YXRlLnRyYW5zYWN0aW9uRXh0ZW5kZXIub2YoXG4gICAgICB0aGlzLmRldGVjdFZpc2libGVDb250ZW50Qm91bmRhcmllc1Zpb2xhdGlvblxuICAgICk7XG4gIH1cblxuICBwcml2YXRlIGRldGVjdFZpc2libGVDb250ZW50Qm91bmRhcmllc1Zpb2xhdGlvbiA9ICh0cjogVHJhbnNhY3Rpb24pOiBudWxsID0+IHtcbiAgICBjb25zdCBoaWRkZW5SYW5nZXMgPVxuICAgICAgdGhpcy5jYWxjdWxhdGVIaWRkZW5Db250ZW50UmFuZ2VzLmNhbGN1bGF0ZUhpZGRlbkNvbnRlbnRSYW5nZXMoXG4gICAgICAgIHRyLnN0YXJ0U3RhdGVcbiAgICAgICk7XG5cbiAgICBjb25zdCB7IHRvdWNoZWRCZWZvcmUsIHRvdWNoZWRJbnNpZGUgfSA9XG4gICAgICBjYWxjdWxhdGVWaXNpYmxlQ29udGVudEJvdW5kYXJpZXNWaW9sYXRpb24odHIsIGhpZGRlblJhbmdlcyk7XG5cbiAgICBpZiAodG91Y2hlZEJlZm9yZSAmJiAhdG91Y2hlZEluc2lkZSkge1xuICAgICAgc2V0SW1tZWRpYXRlKCgpID0+IHtcbiAgICAgICAgdGhpcy5yYW5nZUJlZm9yZVZpc2libGVSYW5nZUNoYW5nZWQucmFuZ2VCZWZvcmVWaXNpYmxlUmFuZ2VDaGFuZ2VkKFxuICAgICAgICAgIHRyLnN0YXRlXG4gICAgICAgICk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gbnVsbDtcbiAgfTtcbn1cbiIsImV4cG9ydCBmdW5jdGlvbiByZW5kZXJIZWFkZXIoXG4gIGRvYzogRG9jdW1lbnQsXG4gIGN0eDoge1xuICAgIGJyZWFkY3J1bWJzOiBBcnJheTx7IHRpdGxlOiBzdHJpbmc7IHBvczogbnVtYmVyIHwgbnVsbCB9PjtcbiAgICBvbkNsaWNrOiAocG9zOiBudW1iZXIgfCBudWxsKSA9PiB2b2lkO1xuICB9XG4pIHtcbiAgY29uc3QgeyBicmVhZGNydW1icywgb25DbGljayB9ID0gY3R4O1xuXG4gIGNvbnN0IGggPSBkb2MuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgaC5jbGFzc0xpc3QuYWRkKFwiem9vbS1wbHVnaW4taGVhZGVyXCIpO1xuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgYnJlYWRjcnVtYnMubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoaSA+IDApIHtcbiAgICAgIGNvbnN0IGQgPSBkb2MuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gICAgICBkLmNsYXNzTGlzdC5hZGQoXCJ6b29tLXBsdWdpbi1kZWxpbWl0ZXJcIik7XG4gICAgICBkLmlubmVyVGV4dCA9IFwiPlwiO1xuICAgICAgaC5hcHBlbmQoZCk7XG4gICAgfVxuXG4gICAgY29uc3QgYnJlYWRjcnVtYiA9IGJyZWFkY3J1bWJzW2ldO1xuICAgIGNvbnN0IGIgPSBkb2MuY3JlYXRlRWxlbWVudChcImFcIik7XG4gICAgYi5jbGFzc0xpc3QuYWRkKFwiem9vbS1wbHVnaW4tdGl0bGVcIik7XG4gICAgYi5kYXRhc2V0LnBvcyA9IFN0cmluZyhicmVhZGNydW1iLnBvcyk7XG4gICAgYi5hcHBlbmRDaGlsZChkb2MuY3JlYXRlVGV4dE5vZGUoYnJlYWRjcnVtYi50aXRsZSkpO1xuICAgIGIuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChlKSA9PiB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBjb25zdCB0ID0gZS50YXJnZXQgYXMgSFRNTEFuY2hvckVsZW1lbnQ7XG4gICAgICBjb25zdCBwb3MgPSB0LmRhdGFzZXQucG9zO1xuICAgICAgb25DbGljayhwb3MgPT09IFwibnVsbFwiID8gbnVsbCA6IE51bWJlcihwb3MpKTtcbiAgICB9KTtcbiAgICBoLmFwcGVuZENoaWxkKGIpO1xuICB9XG5cbiAgcmV0dXJuIGg7XG59XG4iLCJpbXBvcnQgeyBTdGF0ZUVmZmVjdCwgU3RhdGVGaWVsZCB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xuaW1wb3J0IHsgRWRpdG9yVmlldywgc2hvd1BhbmVsIH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcblxuaW1wb3J0IHsgcmVuZGVySGVhZGVyIH0gZnJvbSBcIi4vdXRpbHMvcmVuZGVySGVhZGVyXCI7XG5cbmltcG9ydCB7IExvZ2dlclNlcnZpY2UgfSBmcm9tIFwiLi4vc2VydmljZXMvTG9nZ2VyU2VydmljZVwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIEJyZWFkY3J1bWIge1xuICB0aXRsZTogc3RyaW5nO1xuICBwb3M6IG51bWJlciB8IG51bGw7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgWm9vbUluIHtcbiAgem9vbUluKHZpZXc6IEVkaXRvclZpZXcsIHBvczogbnVtYmVyKTogdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBab29tT3V0IHtcbiAgem9vbU91dCh2aWV3OiBFZGl0b3JWaWV3KTogdm9pZDtcbn1cblxuaW50ZXJmYWNlIEhlYWRlclN0YXRlIHtcbiAgYnJlYWRjcnVtYnM6IEJyZWFkY3J1bWJbXTtcbiAgb25DbGljazogKHZpZXc6IEVkaXRvclZpZXcsIHBvczogbnVtYmVyIHwgbnVsbCkgPT4gdm9pZDtcbn1cblxuY29uc3Qgc2hvd0hlYWRlckVmZmVjdCA9IFN0YXRlRWZmZWN0LmRlZmluZTxIZWFkZXJTdGF0ZT4oKTtcbmNvbnN0IGhpZGVIZWFkZXJFZmZlY3QgPSBTdGF0ZUVmZmVjdC5kZWZpbmU8dm9pZD4oKTtcblxuY29uc3QgaGVhZGVyU3RhdGUgPSBTdGF0ZUZpZWxkLmRlZmluZTxIZWFkZXJTdGF0ZSB8IG51bGw+KHtcbiAgY3JlYXRlOiAoKSA9PiBudWxsLFxuICB1cGRhdGU6ICh2YWx1ZSwgdHIpID0+IHtcbiAgICBmb3IgKGNvbnN0IGUgb2YgdHIuZWZmZWN0cykge1xuICAgICAgaWYgKGUuaXMoc2hvd0hlYWRlckVmZmVjdCkpIHtcbiAgICAgICAgdmFsdWUgPSBlLnZhbHVlO1xuICAgICAgfVxuICAgICAgaWYgKGUuaXMoaGlkZUhlYWRlckVmZmVjdCkpIHtcbiAgICAgICAgdmFsdWUgPSBudWxsO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdmFsdWU7XG4gIH0sXG4gIHByb3ZpZGU6IChmKSA9PlxuICAgIHNob3dQYW5lbC5mcm9tKGYsIChzdGF0ZSkgPT4ge1xuICAgICAgaWYgKCFzdGF0ZSkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuICh2aWV3KSA9PiAoe1xuICAgICAgICB0b3A6IHRydWUsXG4gICAgICAgIGRvbTogcmVuZGVySGVhZGVyKHZpZXcuZG9tLm93bmVyRG9jdW1lbnQsIHtcbiAgICAgICAgICBicmVhZGNydW1iczogc3RhdGUuYnJlYWRjcnVtYnMsXG4gICAgICAgICAgb25DbGljazogKHBvcykgPT4gc3RhdGUub25DbGljayh2aWV3LCBwb3MpLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuICAgIH0pLFxufSk7XG5cbmV4cG9ydCBjbGFzcyBSZW5kZXJOYXZpZ2F0aW9uSGVhZGVyIHtcbiAgZ2V0RXh0ZW5zaW9uKCkge1xuICAgIHJldHVybiBoZWFkZXJTdGF0ZTtcbiAgfVxuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgbG9nZ2VyOiBMb2dnZXJTZXJ2aWNlLFxuICAgIHByaXZhdGUgem9vbUluOiBab29tSW4sXG4gICAgcHJpdmF0ZSB6b29tT3V0OiBab29tT3V0XG4gICkge31cblxuICBwdWJsaWMgc2hvd0hlYWRlcih2aWV3OiBFZGl0b3JWaWV3LCBicmVhZGNydW1iczogQnJlYWRjcnVtYltdKSB7XG4gICAgY29uc3QgbCA9IHRoaXMubG9nZ2VyLmJpbmQoXCJUb2dnbGVOYXZpZ2F0aW9uSGVhZGVyTG9naWM6c2hvd0hlYWRlclwiKTtcbiAgICBsKFwic2hvdyBoZWFkZXJcIik7XG5cbiAgICB2aWV3LmRpc3BhdGNoKHtcbiAgICAgIGVmZmVjdHM6IFtcbiAgICAgICAgc2hvd0hlYWRlckVmZmVjdC5vZih7XG4gICAgICAgICAgYnJlYWRjcnVtYnMsXG4gICAgICAgICAgb25DbGljazogdGhpcy5vbkNsaWNrLFxuICAgICAgICB9KSxcbiAgICAgIF0sXG4gICAgfSk7XG4gIH1cblxuICBwdWJsaWMgaGlkZUhlYWRlcih2aWV3OiBFZGl0b3JWaWV3KSB7XG4gICAgY29uc3QgbCA9IHRoaXMubG9nZ2VyLmJpbmQoXCJUb2dnbGVOYXZpZ2F0aW9uSGVhZGVyTG9naWM6aGlkZUhlYWRlclwiKTtcbiAgICBsKFwiaGlkZSBoZWFkZXJcIik7XG5cbiAgICB2aWV3LmRpc3BhdGNoKHtcbiAgICAgIGVmZmVjdHM6IFtoaWRlSGVhZGVyRWZmZWN0Lm9mKCldLFxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBvbkNsaWNrID0gKHZpZXc6IEVkaXRvclZpZXcsIHBvczogbnVtYmVyIHwgbnVsbCkgPT4ge1xuICAgIGlmIChwb3MgPT09IG51bGwpIHtcbiAgICAgIHRoaXMuem9vbU91dC56b29tT3V0KHZpZXcpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnpvb21Jbi56b29tSW4odmlldywgcG9zKTtcbiAgICB9XG4gIH07XG59XG4iLCJpbXBvcnQgeyBQbHVnaW4gfSBmcm9tIFwib2JzaWRpYW5cIjtcblxuaW1wb3J0IHsgRWRpdG9yU3RhdGUgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcbmltcG9ydCB7IEVkaXRvclZpZXcgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xuXG5pbXBvcnQgeyBGZWF0dXJlIH0gZnJvbSBcIi4vRmVhdHVyZVwiO1xuaW1wb3J0IHsgZ2V0RG9jdW1lbnRUaXRsZSB9IGZyb20gXCIuL3V0aWxzL2dldERvY3VtZW50VGl0bGVcIjtcbmltcG9ydCB7IGdldEVkaXRvclZpZXdGcm9tRWRpdG9yU3RhdGUgfSBmcm9tIFwiLi91dGlscy9nZXRFZGl0b3JWaWV3RnJvbUVkaXRvclN0YXRlXCI7XG5cbmltcG9ydCB7IENvbGxlY3RCcmVhZGNydW1icyB9IGZyb20gXCIuLi9sb2dpYy9Db2xsZWN0QnJlYWRjcnVtYnNcIjtcbmltcG9ydCB7IERldGVjdFJhbmdlQmVmb3JlVmlzaWJsZVJhbmdlQ2hhbmdlZCB9IGZyb20gXCIuLi9sb2dpYy9EZXRlY3RSYW5nZUJlZm9yZVZpc2libGVSYW5nZUNoYW5nZWRcIjtcbmltcG9ydCB7IFJlbmRlck5hdmlnYXRpb25IZWFkZXIgfSBmcm9tIFwiLi4vbG9naWMvUmVuZGVyTmF2aWdhdGlvbkhlYWRlclwiO1xuaW1wb3J0IHsgTG9nZ2VyU2VydmljZSB9IGZyb20gXCIuLi9zZXJ2aWNlcy9Mb2dnZXJTZXJ2aWNlXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgWm9vbUluIHtcbiAgem9vbUluKHZpZXc6IEVkaXRvclZpZXcsIHBvczogbnVtYmVyKTogdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBab29tT3V0IHtcbiAgem9vbU91dCh2aWV3OiBFZGl0b3JWaWV3KTogdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOb3RpZnlBZnRlclpvb21JbiB7XG4gIG5vdGlmeUFmdGVyWm9vbUluKGNiOiAodmlldzogRWRpdG9yVmlldywgcG9zOiBudW1iZXIpID0+IHZvaWQpOiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE5vdGlmeUFmdGVyWm9vbU91dCB7XG4gIG5vdGlmeUFmdGVyWm9vbU91dChjYjogKHZpZXc6IEVkaXRvclZpZXcpID0+IHZvaWQpOiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENhbGN1bGF0ZUhpZGRlbkNvbnRlbnRSYW5nZXMge1xuICBjYWxjdWxhdGVIaWRkZW5Db250ZW50UmFuZ2VzKFxuICAgIHN0YXRlOiBFZGl0b3JTdGF0ZVxuICApOiB7IGZyb206IG51bWJlcjsgdG86IG51bWJlciB9W10gfCBudWxsO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENhbGN1bGF0ZVZpc2libGVDb250ZW50UmFuZ2Uge1xuICBjYWxjdWxhdGVWaXNpYmxlQ29udGVudFJhbmdlKFxuICAgIHN0YXRlOiBFZGl0b3JTdGF0ZVxuICApOiB7IGZyb206IG51bWJlcjsgdG86IG51bWJlciB9IHwgbnVsbDtcbn1cblxuY2xhc3MgU2hvd0hlYWRlckFmdGVyWm9vbUluIGltcGxlbWVudHMgRmVhdHVyZSB7XG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgbm90aWZ5QWZ0ZXJab29tSW46IE5vdGlmeUFmdGVyWm9vbUluLFxuICAgIHByaXZhdGUgY29sbGVjdEJyZWFkY3J1bWJzOiBDb2xsZWN0QnJlYWRjcnVtYnMsXG4gICAgcHJpdmF0ZSByZW5kZXJOYXZpZ2F0aW9uSGVhZGVyOiBSZW5kZXJOYXZpZ2F0aW9uSGVhZGVyXG4gICkge31cblxuICBhc3luYyBsb2FkKCkge1xuICAgIHRoaXMubm90aWZ5QWZ0ZXJab29tSW4ubm90aWZ5QWZ0ZXJab29tSW4oKHZpZXcsIHBvcykgPT4ge1xuICAgICAgY29uc3QgYnJlYWRjcnVtYnMgPSB0aGlzLmNvbGxlY3RCcmVhZGNydW1icy5jb2xsZWN0QnJlYWRjcnVtYnMoXG4gICAgICAgIHZpZXcuc3RhdGUsXG4gICAgICAgIHBvc1xuICAgICAgKTtcbiAgICAgIHRoaXMucmVuZGVyTmF2aWdhdGlvbkhlYWRlci5zaG93SGVhZGVyKHZpZXcsIGJyZWFkY3J1bWJzKTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHVubG9hZCgpIHt9XG59XG5cbmNsYXNzIEhpZGVIZWFkZXJBZnRlclpvb21PdXQgaW1wbGVtZW50cyBGZWF0dXJlIHtcbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBub3RpZnlBZnRlclpvb21PdXQ6IE5vdGlmeUFmdGVyWm9vbU91dCxcbiAgICBwcml2YXRlIHJlbmRlck5hdmlnYXRpb25IZWFkZXI6IFJlbmRlck5hdmlnYXRpb25IZWFkZXJcbiAgKSB7fVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgdGhpcy5ub3RpZnlBZnRlclpvb21PdXQubm90aWZ5QWZ0ZXJab29tT3V0KCh2aWV3KSA9PiB7XG4gICAgICB0aGlzLnJlbmRlck5hdmlnYXRpb25IZWFkZXIuaGlkZUhlYWRlcih2aWV3KTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHVubG9hZCgpIHt9XG59XG5cbmNsYXNzIFVwZGF0ZUhlYWRlckFmdGVyUmFuZ2VCZWZvcmVWaXNpYmxlUmFuZ2VDaGFuZ2VkIGltcGxlbWVudHMgRmVhdHVyZSB7XG4gIHByaXZhdGUgZGV0ZWN0UmFuZ2VCZWZvcmVWaXNpYmxlUmFuZ2VDaGFuZ2VkID1cbiAgICBuZXcgRGV0ZWN0UmFuZ2VCZWZvcmVWaXNpYmxlUmFuZ2VDaGFuZ2VkKFxuICAgICAgdGhpcy5jYWxjdWxhdGVIaWRkZW5Db250ZW50UmFuZ2VzLFxuICAgICAge1xuICAgICAgICByYW5nZUJlZm9yZVZpc2libGVSYW5nZUNoYW5nZWQ6IChzdGF0ZSkgPT5cbiAgICAgICAgICB0aGlzLnJhbmdlQmVmb3JlVmlzaWJsZVJhbmdlQ2hhbmdlZChzdGF0ZSksXG4gICAgICB9XG4gICAgKTtcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIHBsdWdpbjogUGx1Z2luLFxuICAgIHByaXZhdGUgY2FsY3VsYXRlSGlkZGVuQ29udGVudFJhbmdlczogQ2FsY3VsYXRlSGlkZGVuQ29udGVudFJhbmdlcyxcbiAgICBwcml2YXRlIGNhbGN1bGF0ZVZpc2libGVDb250ZW50UmFuZ2U6IENhbGN1bGF0ZVZpc2libGVDb250ZW50UmFuZ2UsXG4gICAgcHJpdmF0ZSBjb2xsZWN0QnJlYWRjcnVtYnM6IENvbGxlY3RCcmVhZGNydW1icyxcbiAgICBwcml2YXRlIHJlbmRlck5hdmlnYXRpb25IZWFkZXI6IFJlbmRlck5hdmlnYXRpb25IZWFkZXJcbiAgKSB7fVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgdGhpcy5wbHVnaW4ucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oXG4gICAgICB0aGlzLmRldGVjdFJhbmdlQmVmb3JlVmlzaWJsZVJhbmdlQ2hhbmdlZC5nZXRFeHRlbnNpb24oKVxuICAgICk7XG4gIH1cblxuICBhc3luYyB1bmxvYWQoKSB7fVxuXG4gIHByaXZhdGUgcmFuZ2VCZWZvcmVWaXNpYmxlUmFuZ2VDaGFuZ2VkKHN0YXRlOiBFZGl0b3JTdGF0ZSkge1xuICAgIGNvbnN0IHZpZXcgPSBnZXRFZGl0b3JWaWV3RnJvbUVkaXRvclN0YXRlKHN0YXRlKTtcblxuICAgIGNvbnN0IHBvcyA9XG4gICAgICB0aGlzLmNhbGN1bGF0ZVZpc2libGVDb250ZW50UmFuZ2UuY2FsY3VsYXRlVmlzaWJsZUNvbnRlbnRSYW5nZShcbiAgICAgICAgc3RhdGVcbiAgICAgICkuZnJvbTtcblxuICAgIGNvbnN0IGJyZWFkY3J1bWJzID0gdGhpcy5jb2xsZWN0QnJlYWRjcnVtYnMuY29sbGVjdEJyZWFkY3J1bWJzKHN0YXRlLCBwb3MpO1xuXG4gICAgdGhpcy5yZW5kZXJOYXZpZ2F0aW9uSGVhZGVyLnNob3dIZWFkZXIodmlldywgYnJlYWRjcnVtYnMpO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBIZWFkZXJOYXZpZ2F0aW9uRmVhdHVyZSBpbXBsZW1lbnRzIEZlYXR1cmUge1xuICBwcml2YXRlIGNvbGxlY3RCcmVhZGNydW1icyA9IG5ldyBDb2xsZWN0QnJlYWRjcnVtYnMoe1xuICAgIGdldERvY3VtZW50VGl0bGU6IGdldERvY3VtZW50VGl0bGUsXG4gIH0pO1xuXG4gIHByaXZhdGUgcmVuZGVyTmF2aWdhdGlvbkhlYWRlciA9IG5ldyBSZW5kZXJOYXZpZ2F0aW9uSGVhZGVyKFxuICAgIHRoaXMubG9nZ2VyLFxuICAgIHRoaXMuem9vbUluLFxuICAgIHRoaXMuem9vbU91dFxuICApO1xuXG4gIHByaXZhdGUgc2hvd0hlYWRlckFmdGVyWm9vbUluID0gbmV3IFNob3dIZWFkZXJBZnRlclpvb21JbihcbiAgICB0aGlzLm5vdGlmeUFmdGVyWm9vbUluLFxuICAgIHRoaXMuY29sbGVjdEJyZWFkY3J1bWJzLFxuICAgIHRoaXMucmVuZGVyTmF2aWdhdGlvbkhlYWRlclxuICApO1xuXG4gIHByaXZhdGUgaGlkZUhlYWRlckFmdGVyWm9vbU91dCA9IG5ldyBIaWRlSGVhZGVyQWZ0ZXJab29tT3V0KFxuICAgIHRoaXMubm90aWZ5QWZ0ZXJab29tT3V0LFxuICAgIHRoaXMucmVuZGVyTmF2aWdhdGlvbkhlYWRlclxuICApO1xuXG4gIHByaXZhdGUgdXBkYXRlSGVhZGVyQWZ0ZXJSYW5nZUJlZm9yZVZpc2libGVSYW5nZUNoYW5nZWQgPVxuICAgIG5ldyBVcGRhdGVIZWFkZXJBZnRlclJhbmdlQmVmb3JlVmlzaWJsZVJhbmdlQ2hhbmdlZChcbiAgICAgIHRoaXMucGx1Z2luLFxuICAgICAgdGhpcy5jYWxjdWxhdGVIaWRkZW5Db250ZW50UmFuZ2VzLFxuICAgICAgdGhpcy5jYWxjdWxhdGVWaXNpYmxlQ29udGVudFJhbmdlLFxuICAgICAgdGhpcy5jb2xsZWN0QnJlYWRjcnVtYnMsXG4gICAgICB0aGlzLnJlbmRlck5hdmlnYXRpb25IZWFkZXJcbiAgICApO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgcGx1Z2luOiBQbHVnaW4sXG4gICAgcHJpdmF0ZSBsb2dnZXI6IExvZ2dlclNlcnZpY2UsXG4gICAgcHJpdmF0ZSBjYWxjdWxhdGVIaWRkZW5Db250ZW50UmFuZ2VzOiBDYWxjdWxhdGVIaWRkZW5Db250ZW50UmFuZ2VzLFxuICAgIHByaXZhdGUgY2FsY3VsYXRlVmlzaWJsZUNvbnRlbnRSYW5nZTogQ2FsY3VsYXRlVmlzaWJsZUNvbnRlbnRSYW5nZSxcbiAgICBwcml2YXRlIHpvb21JbjogWm9vbUluLFxuICAgIHByaXZhdGUgem9vbU91dDogWm9vbU91dCxcbiAgICBwcml2YXRlIG5vdGlmeUFmdGVyWm9vbUluOiBOb3RpZnlBZnRlclpvb21JbixcbiAgICBwcml2YXRlIG5vdGlmeUFmdGVyWm9vbU91dDogTm90aWZ5QWZ0ZXJab29tT3V0XG4gICkge31cblxuICBhc3luYyBsb2FkKCkge1xuICAgIHRoaXMucGx1Z2luLnJlZ2lzdGVyRWRpdG9yRXh0ZW5zaW9uKFxuICAgICAgdGhpcy5yZW5kZXJOYXZpZ2F0aW9uSGVhZGVyLmdldEV4dGVuc2lvbigpXG4gICAgKTtcblxuICAgIHRoaXMuc2hvd0hlYWRlckFmdGVyWm9vbUluLmxvYWQoKTtcbiAgICB0aGlzLmhpZGVIZWFkZXJBZnRlclpvb21PdXQubG9hZCgpO1xuICAgIHRoaXMudXBkYXRlSGVhZGVyQWZ0ZXJSYW5nZUJlZm9yZVZpc2libGVSYW5nZUNoYW5nZWQubG9hZCgpO1xuICB9XG5cbiAgYXN5bmMgdW5sb2FkKCkge1xuICAgIHRoaXMuc2hvd0hlYWRlckFmdGVyWm9vbUluLnVubG9hZCgpO1xuICAgIHRoaXMuaGlkZUhlYWRlckFmdGVyWm9vbU91dC51bmxvYWQoKTtcbiAgICB0aGlzLnVwZGF0ZUhlYWRlckFmdGVyUmFuZ2VCZWZvcmVWaXNpYmxlUmFuZ2VDaGFuZ2VkLnVubG9hZCgpO1xuICB9XG59XG4iLCJpbXBvcnQgeyBFZGl0b3JTZWxlY3Rpb24gfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcblxuZXhwb3J0IGZ1bmN0aW9uIGNhbGN1bGF0ZUxpbWl0ZWRTZWxlY3Rpb24oXG4gIHNlbGVjdGlvbjogRWRpdG9yU2VsZWN0aW9uLFxuICBmcm9tOiBudW1iZXIsXG4gIHRvOiBudW1iZXJcbikge1xuICBjb25zdCBtYWluU2VsZWN0aW9uID0gc2VsZWN0aW9uLm1haW47XG5cbiAgY29uc3QgbmV3U2VsZWN0aW9uID0gRWRpdG9yU2VsZWN0aW9uLnJhbmdlKFxuICAgIE1hdGgubWluKE1hdGgubWF4KG1haW5TZWxlY3Rpb24uYW5jaG9yLCBmcm9tKSwgdG8pLFxuICAgIE1hdGgubWluKE1hdGgubWF4KG1haW5TZWxlY3Rpb24uaGVhZCwgZnJvbSksIHRvKSxcbiAgICBtYWluU2VsZWN0aW9uLmdvYWxDb2x1bW5cbiAgKTtcblxuICBjb25zdCBzaG91bGRVcGRhdGUgPVxuICAgIHNlbGVjdGlvbi5yYW5nZXMubGVuZ3RoID4gMSB8fFxuICAgIG5ld1NlbGVjdGlvbi5hbmNob3IgIT09IG1haW5TZWxlY3Rpb24uYW5jaG9yIHx8XG4gICAgbmV3U2VsZWN0aW9uLmhlYWQgIT09IG1haW5TZWxlY3Rpb24uaGVhZDtcblxuICByZXR1cm4gc2hvdWxkVXBkYXRlID8gbmV3U2VsZWN0aW9uIDogbnVsbDtcbn1cbiIsImltcG9ydCB7IFN0YXRlRWZmZWN0IH0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgWm9vbUluUmFuZ2Uge1xuICBmcm9tOiBudW1iZXI7XG4gIHRvOiBudW1iZXI7XG59XG5cbmV4cG9ydCB0eXBlIFpvb21JblN0YXRlRWZmZWN0ID0gU3RhdGVFZmZlY3Q8Wm9vbUluUmFuZ2U+O1xuXG5leHBvcnQgY29uc3Qgem9vbUluRWZmZWN0ID0gU3RhdGVFZmZlY3QuZGVmaW5lPFpvb21JblJhbmdlPigpO1xuXG5leHBvcnQgY29uc3Qgem9vbU91dEVmZmVjdCA9IFN0YXRlRWZmZWN0LmRlZmluZTx2b2lkPigpO1xuXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuZXhwb3J0IGZ1bmN0aW9uIGlzWm9vbUluRWZmZWN0KGU6IFN0YXRlRWZmZWN0PGFueT4pOiBlIGlzIFpvb21JblN0YXRlRWZmZWN0IHtcbiAgcmV0dXJuIGUuaXMoem9vbUluRWZmZWN0KTtcbn1cbiIsImltcG9ydCB7IEVkaXRvclN0YXRlLCBUcmFuc2FjdGlvbiB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xuXG5pbXBvcnQgeyBjYWxjdWxhdGVMaW1pdGVkU2VsZWN0aW9uIH0gZnJvbSBcIi4vdXRpbHMvY2FsY3VsYXRlTGltaXRlZFNlbGVjdGlvblwiO1xuaW1wb3J0IHsgWm9vbUluU3RhdGVFZmZlY3QsIGlzWm9vbUluRWZmZWN0IH0gZnJvbSBcIi4vdXRpbHMvZWZmZWN0c1wiO1xuXG5pbXBvcnQgeyBMb2dnZXJTZXJ2aWNlIH0gZnJvbSBcIi4uL3NlcnZpY2VzL0xvZ2dlclNlcnZpY2VcIjtcblxuZXhwb3J0IGNsYXNzIExpbWl0U2VsZWN0aW9uT25ab29taW5nSW4ge1xuICBjb25zdHJ1Y3Rvcihwcml2YXRlIGxvZ2dlcjogTG9nZ2VyU2VydmljZSkge31cblxuICBnZXRFeHRlbnNpb24oKSB7XG4gICAgcmV0dXJuIEVkaXRvclN0YXRlLnRyYW5zYWN0aW9uRmlsdGVyLm9mKHRoaXMubGltaXRTZWxlY3Rpb25Pblpvb21pbmdJbik7XG4gIH1cblxuICBwcml2YXRlIGxpbWl0U2VsZWN0aW9uT25ab29taW5nSW4gPSAodHI6IFRyYW5zYWN0aW9uKSA9PiB7XG4gICAgY29uc3QgZSA9IHRyLmVmZmVjdHMuZmluZDxab29tSW5TdGF0ZUVmZmVjdD4oaXNab29tSW5FZmZlY3QpO1xuXG4gICAgaWYgKCFlKSB7XG4gICAgICByZXR1cm4gdHI7XG4gICAgfVxuXG4gICAgY29uc3QgbmV3U2VsZWN0aW9uID0gY2FsY3VsYXRlTGltaXRlZFNlbGVjdGlvbihcbiAgICAgIHRyLm5ld1NlbGVjdGlvbixcbiAgICAgIGUudmFsdWUuZnJvbSxcbiAgICAgIGUudmFsdWUudG9cbiAgICApO1xuXG4gICAgaWYgKCFuZXdTZWxlY3Rpb24pIHtcbiAgICAgIHJldHVybiB0cjtcbiAgICB9XG5cbiAgICB0aGlzLmxvZ2dlci5sb2coXG4gICAgICBcIkxpbWl0U2VsZWN0aW9uT25ab29taW5nSW46bGltaXRTZWxlY3Rpb25Pblpvb21pbmdJblwiLFxuICAgICAgXCJsaW1pdGluZyBzZWxlY3Rpb25cIixcbiAgICAgIG5ld1NlbGVjdGlvbi50b0pTT04oKVxuICAgICk7XG5cbiAgICByZXR1cm4gW3RyLCB7IHNlbGVjdGlvbjogbmV3U2VsZWN0aW9uIH1dO1xuICB9O1xufVxuIiwiaW1wb3J0IHsgRWRpdG9yU3RhdGUsIFRyYW5zYWN0aW9uIH0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XG5cbmltcG9ydCB7IGNhbGN1bGF0ZUxpbWl0ZWRTZWxlY3Rpb24gfSBmcm9tIFwiLi91dGlscy9jYWxjdWxhdGVMaW1pdGVkU2VsZWN0aW9uXCI7XG5cbmltcG9ydCB7IExvZ2dlclNlcnZpY2UgfSBmcm9tIFwiLi4vc2VydmljZXMvTG9nZ2VyU2VydmljZVwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIENhbGN1bGF0ZVZpc2libGVDb250ZW50UmFuZ2Uge1xuICBjYWxjdWxhdGVWaXNpYmxlQ29udGVudFJhbmdlKFxuICAgIHN0YXRlOiBFZGl0b3JTdGF0ZVxuICApOiB7IGZyb206IG51bWJlcjsgdG86IG51bWJlciB9IHwgbnVsbDtcbn1cblxuZXhwb3J0IGNsYXNzIExpbWl0U2VsZWN0aW9uV2hlblpvb21lZEluIHtcbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBsb2dnZXI6IExvZ2dlclNlcnZpY2UsXG4gICAgcHJpdmF0ZSBjYWxjdWxhdGVWaXNpYmxlQ29udGVudFJhbmdlOiBDYWxjdWxhdGVWaXNpYmxlQ29udGVudFJhbmdlXG4gICkge31cblxuICBwdWJsaWMgZ2V0RXh0ZW5zaW9uKCkge1xuICAgIHJldHVybiBFZGl0b3JTdGF0ZS50cmFuc2FjdGlvbkZpbHRlci5vZih0aGlzLmxpbWl0U2VsZWN0aW9uV2hlblpvb21lZEluKTtcbiAgfVxuXG4gIHByaXZhdGUgbGltaXRTZWxlY3Rpb25XaGVuWm9vbWVkSW4gPSAodHI6IFRyYW5zYWN0aW9uKSA9PiB7XG4gICAgaWYgKCF0ci5zZWxlY3Rpb24gfHwgIXRyLmlzVXNlckV2ZW50KFwic2VsZWN0XCIpKSB7XG4gICAgICByZXR1cm4gdHI7XG4gICAgfVxuXG4gICAgY29uc3QgcmFuZ2UgPVxuICAgICAgdGhpcy5jYWxjdWxhdGVWaXNpYmxlQ29udGVudFJhbmdlLmNhbGN1bGF0ZVZpc2libGVDb250ZW50UmFuZ2UodHIuc3RhdGUpO1xuXG4gICAgaWYgKCFyYW5nZSkge1xuICAgICAgcmV0dXJuIHRyO1xuICAgIH1cblxuICAgIGNvbnN0IG5ld1NlbGVjdGlvbiA9IGNhbGN1bGF0ZUxpbWl0ZWRTZWxlY3Rpb24oXG4gICAgICB0ci5uZXdTZWxlY3Rpb24sXG4gICAgICByYW5nZS5mcm9tLFxuICAgICAgcmFuZ2UudG9cbiAgICApO1xuXG4gICAgaWYgKCFuZXdTZWxlY3Rpb24pIHtcbiAgICAgIHJldHVybiB0cjtcbiAgICB9XG5cbiAgICB0aGlzLmxvZ2dlci5sb2coXG4gICAgICBcIkxpbWl0U2VsZWN0aW9uV2hlblpvb21lZEluOmxpbWl0U2VsZWN0aW9uV2hlblpvb21lZEluXCIsXG4gICAgICBcImxpbWl0aW5nIHNlbGVjdGlvblwiLFxuICAgICAgbmV3U2VsZWN0aW9uLnRvSlNPTigpXG4gICAgKTtcblxuICAgIHJldHVybiBbdHIsIHsgc2VsZWN0aW9uOiBuZXdTZWxlY3Rpb24gfV07XG4gIH07XG59XG4iLCJpbXBvcnQgeyBQbHVnaW4gfSBmcm9tIFwib2JzaWRpYW5cIjtcblxuaW1wb3J0IHsgRWRpdG9yU3RhdGUgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcblxuaW1wb3J0IHsgRmVhdHVyZSB9IGZyb20gXCIuL0ZlYXR1cmVcIjtcblxuaW1wb3J0IHsgTGltaXRTZWxlY3Rpb25Pblpvb21pbmdJbiB9IGZyb20gXCIuLi9sb2dpYy9MaW1pdFNlbGVjdGlvbk9uWm9vbWluZ0luXCI7XG5pbXBvcnQgeyBMaW1pdFNlbGVjdGlvbldoZW5ab29tZWRJbiB9IGZyb20gXCIuLi9sb2dpYy9MaW1pdFNlbGVjdGlvbldoZW5ab29tZWRJblwiO1xuaW1wb3J0IHsgTG9nZ2VyU2VydmljZSB9IGZyb20gXCIuLi9zZXJ2aWNlcy9Mb2dnZXJTZXJ2aWNlXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2FsY3VsYXRlVmlzaWJsZUNvbnRlbnRSYW5nZSB7XG4gIGNhbGN1bGF0ZVZpc2libGVDb250ZW50UmFuZ2UoXG4gICAgc3RhdGU6IEVkaXRvclN0YXRlXG4gICk6IHsgZnJvbTogbnVtYmVyOyB0bzogbnVtYmVyIH0gfCBudWxsO1xufVxuXG5leHBvcnQgY2xhc3MgTGltaXRTZWxlY3Rpb25GZWF0dXJlIGltcGxlbWVudHMgRmVhdHVyZSB7XG4gIHByaXZhdGUgbGltaXRTZWxlY3Rpb25Pblpvb21pbmdJbiA9IG5ldyBMaW1pdFNlbGVjdGlvbk9uWm9vbWluZ0luKFxuICAgIHRoaXMubG9nZ2VyXG4gICk7XG4gIHByaXZhdGUgbGltaXRTZWxlY3Rpb25XaGVuWm9vbWVkSW4gPSBuZXcgTGltaXRTZWxlY3Rpb25XaGVuWm9vbWVkSW4oXG4gICAgdGhpcy5sb2dnZXIsXG4gICAgdGhpcy5jYWxjdWxhdGVWaXNpYmxlQ29udGVudFJhbmdlXG4gICk7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBwbHVnaW46IFBsdWdpbixcbiAgICBwcml2YXRlIGxvZ2dlcjogTG9nZ2VyU2VydmljZSxcbiAgICBwcml2YXRlIGNhbGN1bGF0ZVZpc2libGVDb250ZW50UmFuZ2U6IENhbGN1bGF0ZVZpc2libGVDb250ZW50UmFuZ2VcbiAgKSB7fVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgdGhpcy5wbHVnaW4ucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oXG4gICAgICB0aGlzLmxpbWl0U2VsZWN0aW9uT25ab29taW5nSW4uZ2V0RXh0ZW5zaW9uKClcbiAgICApO1xuXG4gICAgdGhpcy5wbHVnaW4ucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oXG4gICAgICB0aGlzLmxpbWl0U2VsZWN0aW9uV2hlblpvb21lZEluLmdldEV4dGVuc2lvbigpXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIHVubG9hZCgpIHt9XG59XG4iLCJpbXBvcnQgeyBGZWF0dXJlIH0gZnJvbSBcIi4vRmVhdHVyZVwiO1xuXG5pbXBvcnQgeyBTZXR0aW5nc1NlcnZpY2UgfSBmcm9tIFwiLi4vc2VydmljZXMvU2V0dGluZ3NTZXJ2aWNlXCI7XG5cbmV4cG9ydCBjbGFzcyBMaXN0c1N0eWxlc0ZlYXR1cmUgaW1wbGVtZW50cyBGZWF0dXJlIHtcbiAgY29uc3RydWN0b3IocHJpdmF0ZSBzZXR0aW5nczogU2V0dGluZ3NTZXJ2aWNlKSB7fVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgaWYgKHRoaXMuc2V0dGluZ3Muem9vbU9uQ2xpY2spIHtcbiAgICAgIHRoaXMuYWRkWm9vbVN0eWxlcygpO1xuICAgIH1cblxuICAgIHRoaXMuc2V0dGluZ3Mub25DaGFuZ2UoXCJ6b29tT25DbGlja1wiLCB0aGlzLm9uWm9vbU9uQ2xpY2tTZXR0aW5nQ2hhbmdlKTtcbiAgfVxuXG4gIGFzeW5jIHVubG9hZCgpIHtcbiAgICB0aGlzLnNldHRpbmdzLnJlbW92ZUNhbGxiYWNrKFxuICAgICAgXCJ6b29tT25DbGlja1wiLFxuICAgICAgdGhpcy5vblpvb21PbkNsaWNrU2V0dGluZ0NoYW5nZVxuICAgICk7XG5cbiAgICB0aGlzLnJlbW92ZVpvb21TdHlsZXMoKTtcbiAgfVxuXG4gIHByaXZhdGUgb25ab29tT25DbGlja1NldHRpbmdDaGFuZ2UgPSAoem9vbU9uQ2xpY2s6IGJvb2xlYW4pID0+IHtcbiAgICBpZiAoem9vbU9uQ2xpY2spIHtcbiAgICAgIHRoaXMuYWRkWm9vbVN0eWxlcygpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnJlbW92ZVpvb21TdHlsZXMoKTtcbiAgICB9XG4gIH07XG5cbiAgcHJpdmF0ZSBhZGRab29tU3R5bGVzKCkge1xuICAgIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LmFkZChcInpvb20tcGx1Z2luLWJscy16b29tXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSByZW1vdmVab29tU3R5bGVzKCkge1xuICAgIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LnJlbW92ZShcInpvb20tcGx1Z2luLWJscy16b29tXCIpO1xuICB9XG59XG4iLCJpbXBvcnQgeyBFZGl0b3JTdGF0ZSwgVHJhbnNhY3Rpb24gfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcblxuaW1wb3J0IHsgY2FsY3VsYXRlVmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0aW9uIH0gZnJvbSBcIi4vdXRpbHMvY2FsY3VsYXRlVmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0aW9uXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0ZWQge1xuICB2aXNpYmxlQ29udGVudEJvdW5kYXJpZXNWaW9sYXRlZChzdGF0ZTogRWRpdG9yU3RhdGUpOiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENhbGN1bGF0ZUhpZGRlbkNvbnRlbnRSYW5nZXMge1xuICBjYWxjdWxhdGVIaWRkZW5Db250ZW50UmFuZ2VzKFxuICAgIHN0YXRlOiBFZGl0b3JTdGF0ZVxuICApOiB7IGZyb206IG51bWJlcjsgdG86IG51bWJlciB9W10gfCBudWxsO1xufVxuXG5leHBvcnQgY2xhc3MgRGV0ZWN0VmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0aW9uIHtcbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBjYWxjdWxhdGVIaWRkZW5Db250ZW50UmFuZ2VzOiBDYWxjdWxhdGVIaWRkZW5Db250ZW50UmFuZ2VzLFxuICAgIHByaXZhdGUgdmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0ZWQ6IFZpc2libGVDb250ZW50Qm91bmRhcmllc1Zpb2xhdGVkXG4gICkge31cblxuICBnZXRFeHRlbnNpb24oKSB7XG4gICAgcmV0dXJuIEVkaXRvclN0YXRlLnRyYW5zYWN0aW9uRXh0ZW5kZXIub2YoXG4gICAgICB0aGlzLmRldGVjdFZpc2libGVDb250ZW50Qm91bmRhcmllc1Zpb2xhdGlvblxuICAgICk7XG4gIH1cblxuICBwcml2YXRlIGRldGVjdFZpc2libGVDb250ZW50Qm91bmRhcmllc1Zpb2xhdGlvbiA9ICh0cjogVHJhbnNhY3Rpb24pOiBudWxsID0+IHtcbiAgICBjb25zdCBoaWRkZW5SYW5nZXMgPVxuICAgICAgdGhpcy5jYWxjdWxhdGVIaWRkZW5Db250ZW50UmFuZ2VzLmNhbGN1bGF0ZUhpZGRlbkNvbnRlbnRSYW5nZXMoXG4gICAgICAgIHRyLnN0YXJ0U3RhdGVcbiAgICAgICk7XG5cbiAgICBjb25zdCB7IHRvdWNoZWRPdXRzaWRlLCB0b3VjaGVkSW5zaWRlIH0gPVxuICAgICAgY2FsY3VsYXRlVmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0aW9uKHRyLCBoaWRkZW5SYW5nZXMpO1xuXG4gICAgaWYgKHRvdWNoZWRPdXRzaWRlICYmIHRvdWNoZWRJbnNpZGUpIHtcbiAgICAgIHNldEltbWVkaWF0ZSgoKSA9PiB7XG4gICAgICAgIHRoaXMudmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0ZWQudmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0ZWQoXG4gICAgICAgICAgdHIuc3RhdGVcbiAgICAgICAgKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBudWxsO1xuICB9O1xufVxuIiwiaW1wb3J0IHsgUGx1Z2luIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmltcG9ydCB7IEVkaXRvclN0YXRlIH0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XG5pbXBvcnQgeyBFZGl0b3JWaWV3IH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcblxuaW1wb3J0IHsgRmVhdHVyZSB9IGZyb20gXCIuL0ZlYXR1cmVcIjtcbmltcG9ydCB7IGdldEVkaXRvclZpZXdGcm9tRWRpdG9yU3RhdGUgfSBmcm9tIFwiLi91dGlscy9nZXRFZGl0b3JWaWV3RnJvbUVkaXRvclN0YXRlXCI7XG5cbmltcG9ydCB7IERldGVjdFZpc2libGVDb250ZW50Qm91bmRhcmllc1Zpb2xhdGlvbiB9IGZyb20gXCIuLi9sb2dpYy9EZXRlY3RWaXNpYmxlQ29udGVudEJvdW5kYXJpZXNWaW9sYXRpb25cIjtcbmltcG9ydCB7IExvZ2dlclNlcnZpY2UgfSBmcm9tIFwiLi4vc2VydmljZXMvTG9nZ2VyU2VydmljZVwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIENhbGN1bGF0ZUhpZGRlbkNvbnRlbnRSYW5nZXMge1xuICBjYWxjdWxhdGVIaWRkZW5Db250ZW50UmFuZ2VzKFxuICAgIHN0YXRlOiBFZGl0b3JTdGF0ZVxuICApOiB7IGZyb206IG51bWJlcjsgdG86IG51bWJlciB9W10gfCBudWxsO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFpvb21PdXQge1xuICB6b29tT3V0KHZpZXc6IEVkaXRvclZpZXcpOiB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgUmVzZXRab29tV2hlblZpc2libGVDb250ZW50Qm91bmRhcmllc1Zpb2xhdGVkRmVhdHVyZVxuICBpbXBsZW1lbnRzIEZlYXR1cmVcbntcbiAgcHJpdmF0ZSBkZXRlY3RWaXNpYmxlQ29udGVudEJvdW5kYXJpZXNWaW9sYXRpb24gPVxuICAgIG5ldyBEZXRlY3RWaXNpYmxlQ29udGVudEJvdW5kYXJpZXNWaW9sYXRpb24oXG4gICAgICB0aGlzLmNhbGN1bGF0ZUhpZGRlbkNvbnRlbnRSYW5nZXMsXG4gICAgICB7XG4gICAgICAgIHZpc2libGVDb250ZW50Qm91bmRhcmllc1Zpb2xhdGVkOiAoc3RhdGUpID0+XG4gICAgICAgICAgdGhpcy52aXNpYmxlQ29udGVudEJvdW5kYXJpZXNWaW9sYXRlZChzdGF0ZSksXG4gICAgICB9XG4gICAgKTtcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIHBsdWdpbjogUGx1Z2luLFxuICAgIHByaXZhdGUgbG9nZ2VyOiBMb2dnZXJTZXJ2aWNlLFxuICAgIHByaXZhdGUgY2FsY3VsYXRlSGlkZGVuQ29udGVudFJhbmdlczogQ2FsY3VsYXRlSGlkZGVuQ29udGVudFJhbmdlcyxcbiAgICBwcml2YXRlIHpvb21PdXQ6IFpvb21PdXRcbiAgKSB7fVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgdGhpcy5wbHVnaW4ucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oXG4gICAgICB0aGlzLmRldGVjdFZpc2libGVDb250ZW50Qm91bmRhcmllc1Zpb2xhdGlvbi5nZXRFeHRlbnNpb24oKVxuICAgICk7XG4gIH1cblxuICBhc3luYyB1bmxvYWQoKSB7fVxuXG4gIHByaXZhdGUgdmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0ZWQoc3RhdGU6IEVkaXRvclN0YXRlKSB7XG4gICAgY29uc3QgbCA9IHRoaXMubG9nZ2VyLmJpbmQoXG4gICAgICBcIlJlc2V0Wm9vbVdoZW5WaXNpYmxlQ29udGVudEJvdW5kYXJpZXNWaW9sYXRlZEZlYXR1cmU6dmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0ZWRcIlxuICAgICk7XG4gICAgbChcInZpc2libGUgY29udGVudCBib3VuZGFyaWVzIHZpb2xhdGVkLCB6b29taW5nIG91dFwiKTtcbiAgICB0aGlzLnpvb21PdXQuem9vbU91dChnZXRFZGl0b3JWaWV3RnJvbUVkaXRvclN0YXRlKHN0YXRlKSk7XG4gIH1cbn1cbiIsImltcG9ydCB7IEFwcCwgUGx1Z2luLCBQbHVnaW5TZXR0aW5nVGFiLCBTZXR0aW5nIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmltcG9ydCB7IEZlYXR1cmUgfSBmcm9tIFwiLi9GZWF0dXJlXCI7XG5cbmltcG9ydCB7IFNldHRpbmdzU2VydmljZSB9IGZyb20gXCIuLi9zZXJ2aWNlcy9TZXR0aW5nc1NlcnZpY2VcIjtcblxuY2xhc3MgT2JzaWRpYW5ab29tUGx1Z2luU2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBQbHVnaW4sIHByaXZhdGUgc2V0dGluZ3M6IFNldHRpbmdzU2VydmljZSkge1xuICAgIHN1cGVyKGFwcCwgcGx1Z2luKTtcbiAgfVxuXG4gIGRpc3BsYXkoKTogdm9pZCB7XG4gICAgY29uc3QgeyBjb250YWluZXJFbCB9ID0gdGhpcztcblxuICAgIGNvbnRhaW5lckVsLmVtcHR5KCk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKFwiWm9vbWluZyBpbiB3aGVuIGNsaWNraW5nIG9uIHRoZSBidWxsZXRcIilcbiAgICAgIC5hZGRUb2dnbGUoKHRvZ2dsZSkgPT4ge1xuICAgICAgICB0b2dnbGUuc2V0VmFsdWUodGhpcy5zZXR0aW5ncy56b29tT25DbGljaykub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5zZXR0aW5ncy56b29tT25DbGljayA9IHZhbHVlO1xuICAgICAgICAgIGF3YWl0IHRoaXMuc2V0dGluZ3Muc2F2ZSgpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZShcIkRlYnVnIG1vZGVcIilcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICBcIk9wZW4gRGV2VG9vbHMgKENvbW1hbmQrT3B0aW9uK0kgb3IgQ29udHJvbCtTaGlmdCtJKSB0byBjb3B5IHRoZSBkZWJ1ZyBsb2dzLlwiXG4gICAgICApXG4gICAgICAuYWRkVG9nZ2xlKCh0b2dnbGUpID0+IHtcbiAgICAgICAgdG9nZ2xlLnNldFZhbHVlKHRoaXMuc2V0dGluZ3MuZGVidWcpLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgIHRoaXMuc2V0dGluZ3MuZGVidWcgPSB2YWx1ZTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnNldHRpbmdzLnNhdmUoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgU2V0dGluZ3NUYWJGZWF0dXJlIGltcGxlbWVudHMgRmVhdHVyZSB7XG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgcGx1Z2luOiBQbHVnaW4sIHByaXZhdGUgc2V0dGluZ3M6IFNldHRpbmdzU2VydmljZSkge31cblxuICBhc3luYyBsb2FkKCkge1xuICAgIHRoaXMucGx1Z2luLmFkZFNldHRpbmdUYWIoXG4gICAgICBuZXcgT2JzaWRpYW5ab29tUGx1Z2luU2V0dGluZ1RhYihcbiAgICAgICAgdGhpcy5wbHVnaW4uYXBwLFxuICAgICAgICB0aGlzLnBsdWdpbixcbiAgICAgICAgdGhpcy5zZXR0aW5nc1xuICAgICAgKVxuICAgICk7XG4gIH1cblxuICBhc3luYyB1bmxvYWQoKSB7fVxufVxuIiwiaW1wb3J0IHsgQXBwIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0ZvbGRpbmdFbmFibGVkKGFwcDogQXBwKSB7XG4gIGNvbnN0IGNvbmZpZzoge1xuICAgIGZvbGRIZWFkaW5nOiBib29sZWFuO1xuICAgIGZvbGRJbmRlbnQ6IGJvb2xlYW47XG4gIH0gPSB7XG4gICAgZm9sZEhlYWRpbmc6IHRydWUsXG4gICAgZm9sZEluZGVudDogdHJ1ZSxcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgIC4uLihhcHAudmF1bHQgYXMgYW55KS5jb25maWcsXG4gIH07XG5cbiAgcmV0dXJuIGNvbmZpZy5mb2xkSGVhZGluZyAmJiBjb25maWcuZm9sZEluZGVudDtcbn1cbiIsImltcG9ydCB7IGZvbGRhYmxlIH0gZnJvbSBcIkBjb2RlbWlycm9yL2xhbmd1YWdlXCI7XG5pbXBvcnQgeyBFZGl0b3JTdGF0ZSB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xuXG5leHBvcnQgY2xhc3MgQ2FsY3VsYXRlUmFuZ2VGb3Jab29taW5nIHtcbiAgcHVibGljIGNhbGN1bGF0ZVJhbmdlRm9yWm9vbWluZyhzdGF0ZTogRWRpdG9yU3RhdGUsIHBvczogbnVtYmVyKSB7XG4gICAgY29uc3QgbGluZSA9IHN0YXRlLmRvYy5saW5lQXQocG9zKTtcbiAgICBjb25zdCBmb2xkUmFuZ2UgPSBmb2xkYWJsZShzdGF0ZSwgbGluZS5mcm9tLCBsaW5lLnRvKTtcblxuICAgIGlmICghZm9sZFJhbmdlICYmIC9eXFxzKihbLSorXXxcXGQrXFwuKVxccysvLnRlc3QobGluZS50ZXh0KSkge1xuICAgICAgcmV0dXJuIHsgZnJvbTogbGluZS5mcm9tLCB0bzogbGluZS50byB9O1xuICAgIH1cblxuICAgIGlmICghZm9sZFJhbmdlKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICByZXR1cm4geyBmcm9tOiBsaW5lLmZyb20sIHRvOiBmb2xkUmFuZ2UudG8gfTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUmFuZ2VTZXQsIFJhbmdlVmFsdWUgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcblxuZXhwb3J0IGZ1bmN0aW9uIHJhbmdlU2V0VG9BcnJheTxUIGV4dGVuZHMgUmFuZ2VWYWx1ZT4oXG4gIHJzOiBSYW5nZVNldDxUPlxuKTogQXJyYXk8eyBmcm9tOiBudW1iZXI7IHRvOiBudW1iZXIgfT4ge1xuICBjb25zdCByZXMgPSBbXTtcbiAgY29uc3QgaSA9IHJzLml0ZXIoKTtcbiAgd2hpbGUgKGkudmFsdWUgIT09IG51bGwpIHtcbiAgICByZXMucHVzaCh7IGZyb206IGkuZnJvbSwgdG86IGkudG8gfSk7XG4gICAgaS5uZXh0KCk7XG4gIH1cbiAgcmV0dXJuIHJlcztcbn1cbiIsImltcG9ydCB7IEVkaXRvclN0YXRlLCBFeHRlbnNpb24sIFN0YXRlRmllbGQgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcbmltcG9ydCB7IERlY29yYXRpb24sIERlY29yYXRpb25TZXQsIEVkaXRvclZpZXcgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xuXG5pbXBvcnQgeyB6b29tSW5FZmZlY3QsIHpvb21PdXRFZmZlY3QgfSBmcm9tIFwiLi91dGlscy9lZmZlY3RzXCI7XG5pbXBvcnQgeyByYW5nZVNldFRvQXJyYXkgfSBmcm9tIFwiLi91dGlscy9yYW5nZVNldFRvQXJyYXlcIjtcblxuaW1wb3J0IHsgTG9nZ2VyU2VydmljZSB9IGZyb20gXCIuLi9zZXJ2aWNlcy9Mb2dnZXJTZXJ2aWNlXCI7XG5cbmNvbnN0IHpvb21NYXJrSGlkZGVuID0gRGVjb3JhdGlvbi5yZXBsYWNlKHsgYmxvY2s6IHRydWUgfSk7XG5cbmNvbnN0IHpvb21TdGF0ZUZpZWxkID0gU3RhdGVGaWVsZC5kZWZpbmU8RGVjb3JhdGlvblNldD4oe1xuICBjcmVhdGU6ICgpID0+IHtcbiAgICByZXR1cm4gRGVjb3JhdGlvbi5ub25lO1xuICB9LFxuXG4gIHVwZGF0ZTogKHZhbHVlLCB0cikgPT4ge1xuICAgIHZhbHVlID0gdmFsdWUubWFwKHRyLmNoYW5nZXMpO1xuXG4gICAgZm9yIChjb25zdCBlIG9mIHRyLmVmZmVjdHMpIHtcbiAgICAgIGlmIChlLmlzKHpvb21JbkVmZmVjdCkpIHtcbiAgICAgICAgdmFsdWUgPSB2YWx1ZS51cGRhdGUoeyBmaWx0ZXI6ICgpID0+IGZhbHNlIH0pO1xuXG4gICAgICAgIGlmIChlLnZhbHVlLmZyb20gPiAwKSB7XG4gICAgICAgICAgdmFsdWUgPSB2YWx1ZS51cGRhdGUoe1xuICAgICAgICAgICAgYWRkOiBbem9vbU1hcmtIaWRkZW4ucmFuZ2UoMCwgZS52YWx1ZS5mcm9tIC0gMSldLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGUudmFsdWUudG8gPCB0ci5uZXdEb2MubGVuZ3RoKSB7XG4gICAgICAgICAgdmFsdWUgPSB2YWx1ZS51cGRhdGUoe1xuICAgICAgICAgICAgYWRkOiBbem9vbU1hcmtIaWRkZW4ucmFuZ2UoZS52YWx1ZS50byArIDEsIHRyLm5ld0RvYy5sZW5ndGgpXSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoZS5pcyh6b29tT3V0RWZmZWN0KSkge1xuICAgICAgICB2YWx1ZSA9IHZhbHVlLnVwZGF0ZSh7IGZpbHRlcjogKCkgPT4gZmFsc2UgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHZhbHVlO1xuICB9LFxuXG4gIHByb3ZpZGU6ICh6b29tU3RhdGVGaWVsZCkgPT4gRWRpdG9yVmlldy5kZWNvcmF0aW9ucy5mcm9tKHpvb21TdGF0ZUZpZWxkKSxcbn0pO1xuXG5leHBvcnQgY2xhc3MgS2VlcE9ubHlab29tZWRDb250ZW50VmlzaWJsZSB7XG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgbG9nZ2VyOiBMb2dnZXJTZXJ2aWNlKSB7fVxuXG4gIHB1YmxpYyBnZXRFeHRlbnNpb24oKTogRXh0ZW5zaW9uIHtcbiAgICByZXR1cm4gem9vbVN0YXRlRmllbGQ7XG4gIH1cblxuICBwdWJsaWMgY2FsY3VsYXRlSGlkZGVuQ29udGVudFJhbmdlcyhzdGF0ZTogRWRpdG9yU3RhdGUpIHtcbiAgICByZXR1cm4gcmFuZ2VTZXRUb0FycmF5KHN0YXRlLmZpZWxkKHpvb21TdGF0ZUZpZWxkKSk7XG4gIH1cblxuICBwdWJsaWMgY2FsY3VsYXRlVmlzaWJsZUNvbnRlbnRSYW5nZShzdGF0ZTogRWRpdG9yU3RhdGUpIHtcbiAgICBjb25zdCBoaWRkZW4gPSB0aGlzLmNhbGN1bGF0ZUhpZGRlbkNvbnRlbnRSYW5nZXMoc3RhdGUpO1xuXG4gICAgaWYgKGhpZGRlbi5sZW5ndGggPT09IDEpIHtcbiAgICAgIGNvbnN0IFthXSA9IGhpZGRlbjtcblxuICAgICAgaWYgKGEuZnJvbSA9PT0gMCkge1xuICAgICAgICByZXR1cm4geyBmcm9tOiBhLnRvICsgMSwgdG86IHN0YXRlLmRvYy5sZW5ndGggfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB7IGZyb206IDAsIHRvOiBhLmZyb20gLSAxIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGhpZGRlbi5sZW5ndGggPT09IDIpIHtcbiAgICAgIGNvbnN0IFthLCBiXSA9IGhpZGRlbjtcblxuICAgICAgcmV0dXJuIHsgZnJvbTogYS50byArIDEsIHRvOiBiLmZyb20gLSAxIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBwdWJsaWMga2VlcE9ubHlab29tZWRDb250ZW50VmlzaWJsZShcbiAgICB2aWV3OiBFZGl0b3JWaWV3LFxuICAgIGZyb206IG51bWJlcixcbiAgICB0bzogbnVtYmVyLFxuICAgIG9wdGlvbnM6IHsgc2Nyb2xsSW50b1ZpZXc/OiBib29sZWFuIH0gPSB7fVxuICApIHtcbiAgICBjb25zdCB7IHNjcm9sbEludG9WaWV3IH0gPSB7IC4uLnsgc2Nyb2xsSW50b1ZpZXc6IHRydWUgfSwgLi4ub3B0aW9ucyB9O1xuXG4gICAgY29uc3QgZWZmZWN0ID0gem9vbUluRWZmZWN0Lm9mKHsgZnJvbSwgdG8gfSk7XG5cbiAgICB0aGlzLmxvZ2dlci5sb2coXG4gICAgICBcIktlZXBPbmx5Wm9vbWVkQ29udGVudDprZWVwT25seVpvb21lZENvbnRlbnRWaXNpYmxlXCIsXG4gICAgICBcImtlZXAgb25seSB6b29tZWQgY29udGVudCB2aXNpYmxlXCIsXG4gICAgICBlZmZlY3QudmFsdWUuZnJvbSxcbiAgICAgIGVmZmVjdC52YWx1ZS50b1xuICAgICk7XG5cbiAgICB2aWV3LmRpc3BhdGNoKHtcbiAgICAgIGVmZmVjdHM6IFtlZmZlY3RdLFxuICAgIH0pO1xuXG4gICAgaWYgKHNjcm9sbEludG9WaWV3KSB7XG4gICAgICB2aWV3LmRpc3BhdGNoKHtcbiAgICAgICAgZWZmZWN0czogW1xuICAgICAgICAgIEVkaXRvclZpZXcuc2Nyb2xsSW50b1ZpZXcodmlldy5zdGF0ZS5zZWxlY3Rpb24ubWFpbiwge1xuICAgICAgICAgICAgeTogXCJzdGFydFwiLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIHNob3dBbGxDb250ZW50KHZpZXc6IEVkaXRvclZpZXcpIHtcbiAgICB0aGlzLmxvZ2dlci5sb2coXCJLZWVwT25seVpvb21lZENvbnRlbnQ6c2hvd0FsbENvbnRlbnRcIiwgXCJzaG93IGFsbCBjb250ZW50XCIpO1xuXG4gICAgdmlldy5kaXNwYXRjaCh7IGVmZmVjdHM6IFt6b29tT3V0RWZmZWN0Lm9mKCldIH0pO1xuICAgIHZpZXcuZGlzcGF0Y2goe1xuICAgICAgZWZmZWN0czogW1xuICAgICAgICBFZGl0b3JWaWV3LnNjcm9sbEludG9WaWV3KHZpZXcuc3RhdGUuc2VsZWN0aW9uLm1haW4sIHtcbiAgICAgICAgICB5OiBcImNlbnRlclwiLFxuICAgICAgICB9KSxcbiAgICAgIF0sXG4gICAgfSk7XG4gIH1cbn1cbiIsImltcG9ydCB7IEVkaXRvciB9IGZyb20gXCJvYnNpZGlhblwiO1xuXG5pbXBvcnQgeyBFZGl0b3JWaWV3IH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldEVkaXRvclZpZXdGcm9tRWRpdG9yKGVkaXRvcjogRWRpdG9yKTogRWRpdG9yVmlldyB7XG4gIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gIHJldHVybiAoZWRpdG9yIGFzIGFueSkuY207XG59XG4iLCJpbXBvcnQgeyBOb3RpY2UsIFBsdWdpbiB9IGZyb20gXCJvYnNpZGlhblwiO1xuXG5pbXBvcnQgeyBFZGl0b3JTdGF0ZSB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xuaW1wb3J0IHsgRWRpdG9yVmlldyB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XG5cbmltcG9ydCB7IEZlYXR1cmUgfSBmcm9tIFwiLi9GZWF0dXJlXCI7XG5pbXBvcnQgeyBpc0ZvbGRpbmdFbmFibGVkIH0gZnJvbSBcIi4vdXRpbHMvaXNGb2xkaW5nRW5hYmxlZFwiO1xuXG5pbXBvcnQgeyBDYWxjdWxhdGVSYW5nZUZvclpvb21pbmcgfSBmcm9tIFwiLi4vbG9naWMvQ2FsY3VsYXRlUmFuZ2VGb3Jab29taW5nXCI7XG5pbXBvcnQgeyBLZWVwT25seVpvb21lZENvbnRlbnRWaXNpYmxlIH0gZnJvbSBcIi4uL2xvZ2ljL0tlZXBPbmx5Wm9vbWVkQ29udGVudFZpc2libGVcIjtcbmltcG9ydCB7IExvZ2dlclNlcnZpY2UgfSBmcm9tIFwiLi4vc2VydmljZXMvTG9nZ2VyU2VydmljZVwiO1xuaW1wb3J0IHsgZ2V0RWRpdG9yVmlld0Zyb21FZGl0b3IgfSBmcm9tIFwiLi4vdXRpbHMvZ2V0RWRpdG9yVmlld0Zyb21FZGl0b3JcIjtcblxuZXhwb3J0IHR5cGUgWm9vbUluQ2FsbGJhY2sgPSAodmlldzogRWRpdG9yVmlldywgcG9zOiBudW1iZXIpID0+IHZvaWQ7XG5leHBvcnQgdHlwZSBab29tT3V0Q2FsbGJhY2sgPSAodmlldzogRWRpdG9yVmlldykgPT4gdm9pZDtcblxuZXhwb3J0IGNsYXNzIFpvb21GZWF0dXJlIGltcGxlbWVudHMgRmVhdHVyZSB7XG4gIHByaXZhdGUgem9vbUluQ2FsbGJhY2tzOiBab29tSW5DYWxsYmFja1tdID0gW107XG4gIHByaXZhdGUgem9vbU91dENhbGxiYWNrczogWm9vbU91dENhbGxiYWNrW10gPSBbXTtcblxuICBwcml2YXRlIGtlZXBPbmx5Wm9vbWVkQ29udGVudFZpc2libGUgPSBuZXcgS2VlcE9ubHlab29tZWRDb250ZW50VmlzaWJsZShcbiAgICB0aGlzLmxvZ2dlclxuICApO1xuXG4gIHByaXZhdGUgY2FsY3VsYXRlUmFuZ2VGb3Jab29taW5nID0gbmV3IENhbGN1bGF0ZVJhbmdlRm9yWm9vbWluZygpO1xuXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgcGx1Z2luOiBQbHVnaW4sIHByaXZhdGUgbG9nZ2VyOiBMb2dnZXJTZXJ2aWNlKSB7fVxuXG4gIHB1YmxpYyBjYWxjdWxhdGVWaXNpYmxlQ29udGVudFJhbmdlKHN0YXRlOiBFZGl0b3JTdGF0ZSkge1xuICAgIHJldHVybiB0aGlzLmtlZXBPbmx5Wm9vbWVkQ29udGVudFZpc2libGUuY2FsY3VsYXRlVmlzaWJsZUNvbnRlbnRSYW5nZShcbiAgICAgIHN0YXRlXG4gICAgKTtcbiAgfVxuXG4gIHB1YmxpYyBjYWxjdWxhdGVIaWRkZW5Db250ZW50UmFuZ2VzKHN0YXRlOiBFZGl0b3JTdGF0ZSkge1xuICAgIHJldHVybiB0aGlzLmtlZXBPbmx5Wm9vbWVkQ29udGVudFZpc2libGUuY2FsY3VsYXRlSGlkZGVuQ29udGVudFJhbmdlcyhcbiAgICAgIHN0YXRlXG4gICAgKTtcbiAgfVxuXG4gIHB1YmxpYyBub3RpZnlBZnRlclpvb21JbihjYjogWm9vbUluQ2FsbGJhY2spIHtcbiAgICB0aGlzLnpvb21JbkNhbGxiYWNrcy5wdXNoKGNiKTtcbiAgfVxuXG4gIHB1YmxpYyBub3RpZnlBZnRlclpvb21PdXQoY2I6IFpvb21PdXRDYWxsYmFjaykge1xuICAgIHRoaXMuem9vbU91dENhbGxiYWNrcy5wdXNoKGNiKTtcbiAgfVxuXG4gIHB1YmxpYyByZWZyZXNoWm9vbSh2aWV3OiBFZGl0b3JWaWV3KSB7XG4gICAgY29uc3QgcHJldlJhbmdlID1cbiAgICAgIHRoaXMua2VlcE9ubHlab29tZWRDb250ZW50VmlzaWJsZS5jYWxjdWxhdGVWaXNpYmxlQ29udGVudFJhbmdlKFxuICAgICAgICB2aWV3LnN0YXRlXG4gICAgICApO1xuXG4gICAgaWYgKCFwcmV2UmFuZ2UpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBuZXdSYW5nZSA9IHRoaXMuY2FsY3VsYXRlUmFuZ2VGb3Jab29taW5nLmNhbGN1bGF0ZVJhbmdlRm9yWm9vbWluZyhcbiAgICAgIHZpZXcuc3RhdGUsXG4gICAgICBwcmV2UmFuZ2UuZnJvbVxuICAgICk7XG5cbiAgICBpZiAoIW5ld1JhbmdlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5rZWVwT25seVpvb21lZENvbnRlbnRWaXNpYmxlLmtlZXBPbmx5Wm9vbWVkQ29udGVudFZpc2libGUoXG4gICAgICB2aWV3LFxuICAgICAgbmV3UmFuZ2UuZnJvbSxcbiAgICAgIG5ld1JhbmdlLnRvLFxuICAgICAgeyBzY3JvbGxJbnRvVmlldzogZmFsc2UgfVxuICAgICk7XG4gIH1cblxuICBwdWJsaWMgem9vbUluKHZpZXc6IEVkaXRvclZpZXcsIHBvczogbnVtYmVyKSB7XG4gICAgY29uc3QgbCA9IHRoaXMubG9nZ2VyLmJpbmQoXCJab29tRmVhdHVyZTp6b29tSW5cIik7XG4gICAgbChcInpvb21pbmcgaW5cIik7XG5cbiAgICBpZiAoIWlzRm9sZGluZ0VuYWJsZWQodGhpcy5wbHVnaW4uYXBwKSkge1xuICAgICAgbmV3IE5vdGljZShcbiAgICAgICAgYEluIG9yZGVyIHRvIHpvb20sIHlvdSBtdXN0IGZpcnN0IGVuYWJsZSBcIkZvbGQgaGVhZGluZ1wiIGFuZCBcIkZvbGQgaW5kZW50XCIgdW5kZXIgU2V0dGluZ3MgLT4gRWRpdG9yYFxuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCByYW5nZSA9IHRoaXMuY2FsY3VsYXRlUmFuZ2VGb3Jab29taW5nLmNhbGN1bGF0ZVJhbmdlRm9yWm9vbWluZyhcbiAgICAgIHZpZXcuc3RhdGUsXG4gICAgICBwb3NcbiAgICApO1xuXG4gICAgaWYgKCFyYW5nZSkge1xuICAgICAgbChcInVuYWJsZSB0byBjYWxjdWxhdGUgcmFuZ2UgZm9yIHpvb21pbmdcIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5rZWVwT25seVpvb21lZENvbnRlbnRWaXNpYmxlLmtlZXBPbmx5Wm9vbWVkQ29udGVudFZpc2libGUoXG4gICAgICB2aWV3LFxuICAgICAgcmFuZ2UuZnJvbSxcbiAgICAgIHJhbmdlLnRvXG4gICAgKTtcblxuICAgIGZvciAoY29uc3QgY2Igb2YgdGhpcy56b29tSW5DYWxsYmFja3MpIHtcbiAgICAgIGNiKHZpZXcsIHBvcyk7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIHpvb21PdXQodmlldzogRWRpdG9yVmlldykge1xuICAgIGNvbnN0IGwgPSB0aGlzLmxvZ2dlci5iaW5kKFwiWm9vbUZlYXR1cmU6em9vbUluXCIpO1xuICAgIGwoXCJ6b29taW5nIG91dFwiKTtcblxuICAgIHRoaXMua2VlcE9ubHlab29tZWRDb250ZW50VmlzaWJsZS5zaG93QWxsQ29udGVudCh2aWV3KTtcblxuICAgIGZvciAoY29uc3QgY2Igb2YgdGhpcy56b29tT3V0Q2FsbGJhY2tzKSB7XG4gICAgICBjYih2aWV3KTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBsb2FkKCkge1xuICAgIHRoaXMucGx1Z2luLnJlZ2lzdGVyRWRpdG9yRXh0ZW5zaW9uKFxuICAgICAgdGhpcy5rZWVwT25seVpvb21lZENvbnRlbnRWaXNpYmxlLmdldEV4dGVuc2lvbigpXG4gICAgKTtcblxuICAgIHRoaXMucGx1Z2luLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwiem9vbS1pblwiLFxuICAgICAgbmFtZTogXCJab29tIGluXCIsXG4gICAgICBpY29uOiBcInpvb20taW5cIixcbiAgICAgIGVkaXRvckNhbGxiYWNrOiAoZWRpdG9yKSA9PiB7XG4gICAgICAgIGNvbnN0IHZpZXcgPSBnZXRFZGl0b3JWaWV3RnJvbUVkaXRvcihlZGl0b3IpO1xuICAgICAgICB0aGlzLnpvb21Jbih2aWV3LCB2aWV3LnN0YXRlLnNlbGVjdGlvbi5tYWluLmhlYWQpO1xuICAgICAgfSxcbiAgICAgIGhvdGtleXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIG1vZGlmaWVyczogW1wiTW9kXCJdLFxuICAgICAgICAgIGtleTogXCIuXCIsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgdGhpcy5wbHVnaW4uYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJ6b29tLW91dFwiLFxuICAgICAgbmFtZTogXCJab29tIG91dCB0aGUgZW50aXJlIGRvY3VtZW50XCIsXG4gICAgICBpY29uOiBcInpvb20tb3V0XCIsXG4gICAgICBlZGl0b3JDYWxsYmFjazogKGVkaXRvcikgPT4gdGhpcy56b29tT3V0KGdldEVkaXRvclZpZXdGcm9tRWRpdG9yKGVkaXRvcikpLFxuICAgICAgaG90a2V5czogW1xuICAgICAgICB7XG4gICAgICAgICAgbW9kaWZpZXJzOiBbXCJNb2RcIiwgXCJTaGlmdFwiXSxcbiAgICAgICAgICBrZXk6IFwiLlwiLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHVubG9hZCgpIHt9XG59XG4iLCJleHBvcnQgZnVuY3Rpb24gaXNCdWxsZXRQb2ludChlOiBIVE1MRWxlbWVudCkge1xuICByZXR1cm4gKFxuICAgIGUgaW5zdGFuY2VvZiBIVE1MU3BhbkVsZW1lbnQgJiZcbiAgICAoZS5jbGFzc0xpc3QuY29udGFpbnMoXCJsaXN0LWJ1bGxldFwiKSB8fFxuICAgICAgZS5jbGFzc0xpc3QuY29udGFpbnMoXCJjbS1mb3JtYXR0aW5nLWxpc3RcIikpXG4gICk7XG59XG4iLCJpbXBvcnQgeyBFZGl0b3JTZWxlY3Rpb24gfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcbmltcG9ydCB7IEVkaXRvclZpZXcgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xuXG5pbXBvcnQgeyBpc0J1bGxldFBvaW50IH0gZnJvbSBcIi4vdXRpbHMvaXNCdWxsZXRQb2ludFwiO1xuXG5pbXBvcnQgeyBTZXR0aW5nc1NlcnZpY2UgfSBmcm9tIFwiLi4vc2VydmljZXMvU2V0dGluZ3NTZXJ2aWNlXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2xpY2tPbkJ1bGxldCB7XG4gIGNsaWNrT25CdWxsZXQodmlldzogRWRpdG9yVmlldywgcG9zOiBudW1iZXIpOiB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgRGV0ZWN0Q2xpY2tPbkJ1bGxldCB7XG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgc2V0dGluZ3M6IFNldHRpbmdzU2VydmljZSxcbiAgICBwcml2YXRlIGNsaWNrT25CdWxsZXQ6IENsaWNrT25CdWxsZXRcbiAgKSB7fVxuXG4gIGdldEV4dGVuc2lvbigpIHtcbiAgICByZXR1cm4gRWRpdG9yVmlldy5kb21FdmVudEhhbmRsZXJzKHtcbiAgICAgIGNsaWNrOiB0aGlzLmRldGVjdENsaWNrT25CdWxsZXQsXG4gICAgfSk7XG4gIH1cblxuICBwdWJsaWMgbW92ZUN1cnNvclRvTGluZUVuZCh2aWV3OiBFZGl0b3JWaWV3LCBwb3M6IG51bWJlcikge1xuICAgIGNvbnN0IGxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lQXQocG9zKTtcblxuICAgIHZpZXcuZGlzcGF0Y2goe1xuICAgICAgc2VsZWN0aW9uOiBFZGl0b3JTZWxlY3Rpb24uY3Vyc29yKGxpbmUudG8pLFxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBkZXRlY3RDbGlja09uQnVsbGV0ID0gKGU6IE1vdXNlRXZlbnQsIHZpZXc6IEVkaXRvclZpZXcpID0+IHtcbiAgICBpZiAoXG4gICAgICAhdGhpcy5zZXR0aW5ncy56b29tT25DbGljayB8fFxuICAgICAgIShlLnRhcmdldCBpbnN0YW5jZW9mIEhUTUxFbGVtZW50KSB8fFxuICAgICAgIWlzQnVsbGV0UG9pbnQoZS50YXJnZXQpXG4gICAgKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgcG9zID0gdmlldy5wb3NBdERPTShlLnRhcmdldCk7XG4gICAgdGhpcy5jbGlja09uQnVsbGV0LmNsaWNrT25CdWxsZXQodmlldywgcG9zKTtcbiAgfTtcbn1cbiIsImltcG9ydCB7IFBsdWdpbiB9IGZyb20gXCJvYnNpZGlhblwiO1xuXG5pbXBvcnQgeyBFZGl0b3JWaWV3IH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcblxuaW1wb3J0IHsgRmVhdHVyZSB9IGZyb20gXCIuL0ZlYXR1cmVcIjtcblxuaW1wb3J0IHsgRGV0ZWN0Q2xpY2tPbkJ1bGxldCB9IGZyb20gXCIuLi9sb2dpYy9EZXRlY3RDbGlja09uQnVsbGV0XCI7XG5pbXBvcnQgeyBTZXR0aW5nc1NlcnZpY2UgfSBmcm9tIFwiLi4vc2VydmljZXMvU2V0dGluZ3NTZXJ2aWNlXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgWm9vbUluIHtcbiAgem9vbUluKHZpZXc6IEVkaXRvclZpZXcsIHBvczogbnVtYmVyKTogdm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIFpvb21PbkNsaWNrRmVhdHVyZSBpbXBsZW1lbnRzIEZlYXR1cmUge1xuICBwcml2YXRlIGRldGVjdENsaWNrT25CdWxsZXQgPSBuZXcgRGV0ZWN0Q2xpY2tPbkJ1bGxldCh0aGlzLnNldHRpbmdzLCB7XG4gICAgY2xpY2tPbkJ1bGxldDogKHZpZXcsIHBvcykgPT4gdGhpcy5jbGlja09uQnVsbGV0KHZpZXcsIHBvcyksXG4gIH0pO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgcGx1Z2luOiBQbHVnaW4sXG4gICAgcHJpdmF0ZSBzZXR0aW5nczogU2V0dGluZ3NTZXJ2aWNlLFxuICAgIHByaXZhdGUgem9vbUluOiBab29tSW5cbiAgKSB7fVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgdGhpcy5wbHVnaW4ucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oXG4gICAgICB0aGlzLmRldGVjdENsaWNrT25CdWxsZXQuZ2V0RXh0ZW5zaW9uKClcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgdW5sb2FkKCkge31cblxuICBwcml2YXRlIGNsaWNrT25CdWxsZXQodmlldzogRWRpdG9yVmlldywgcG9zOiBudW1iZXIpIHtcbiAgICB0aGlzLmRldGVjdENsaWNrT25CdWxsZXQubW92ZUN1cnNvclRvTGluZUVuZCh2aWV3LCBwb3MpO1xuICAgIHRoaXMuem9vbUluLnpvb21Jbih2aWV3LCBwb3MpO1xuICB9XG59XG4iLCJpbXBvcnQgeyBTZXR0aW5nc1NlcnZpY2UgfSBmcm9tIFwiLi9TZXR0aW5nc1NlcnZpY2VcIjtcblxuZXhwb3J0IGNsYXNzIExvZ2dlclNlcnZpY2Uge1xuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHNldHRpbmdzOiBTZXR0aW5nc1NlcnZpY2UpIHt9XG5cbiAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgbG9nKG1ldGhvZDogc3RyaW5nLCAuLi5hcmdzOiBhbnlbXSkge1xuICAgIGlmICghdGhpcy5zZXR0aW5ncy5kZWJ1Zykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnNvbGUuaW5mbyhtZXRob2QsIC4uLmFyZ3MpO1xuICB9XG5cbiAgYmluZChtZXRob2Q6IHN0cmluZykge1xuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgcmV0dXJuICguLi5hcmdzOiBhbnlbXSkgPT4gdGhpcy5sb2cobWV0aG9kLCAuLi5hcmdzKTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUGxhdGZvcm0gfSBmcm9tIFwib2JzaWRpYW5cIjtcblxuZXhwb3J0IGludGVyZmFjZSBPYnNpZGlhblpvb21QbHVnaW5TZXR0aW5ncyB7XG4gIGRlYnVnOiBib29sZWFuO1xuICB6b29tT25DbGljazogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIE9ic2lkaWFuWm9vbVBsdWdpblNldHRpbmdzSnNvbiB7XG4gIGRlYnVnOiBib29sZWFuO1xuICB6b29tT25DbGljazogYm9vbGVhbjtcbiAgem9vbU9uQ2xpY2tNb2JpbGU6IGJvb2xlYW47XG59XG5cbmNvbnN0IERFRkFVTFRfU0VUVElOR1M6IE9ic2lkaWFuWm9vbVBsdWdpblNldHRpbmdzSnNvbiA9IHtcbiAgZGVidWc6IGZhbHNlLFxuICB6b29tT25DbGljazogdHJ1ZSxcbiAgem9vbU9uQ2xpY2tNb2JpbGU6IGZhbHNlLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBTdG9yYWdlIHtcbiAgbG9hZERhdGEoKTogUHJvbWlzZTxhbnk+OyAvLyBlc2xpbnQtZGlzYWJsZS1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgc2F2ZURhdGEoc2V0dGlnbnM6IGFueSk6IFByb21pc2U8dm9pZD47IC8vIGVzbGludC1kaXNhYmxlLWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxufVxuXG50eXBlIEsgPSBrZXlvZiBPYnNpZGlhblpvb21QbHVnaW5TZXR0aW5ncztcbnR5cGUgVjxUIGV4dGVuZHMgSz4gPSBPYnNpZGlhblpvb21QbHVnaW5TZXR0aW5nc1tUXTtcbnR5cGUgQ2FsbGJhY2s8VCBleHRlbmRzIEs+ID0gKGNiOiBWPFQ+KSA9PiB2b2lkO1xuXG5jb25zdCB6b29tT25DbGlja1Byb3AgPSBQbGF0Zm9ybS5pc0Rlc2t0b3BcbiAgPyBcInpvb21PbkNsaWNrXCJcbiAgOiBcInpvb21PbkNsaWNrTW9iaWxlXCI7XG5cbmNvbnN0IG1hcHBpbmdUb0pzb24gPSB7XG4gIHpvb21PbkNsaWNrOiB6b29tT25DbGlja1Byb3AsXG4gIGRlYnVnOiBcImRlYnVnXCIsXG59IGFzIHtcbiAgW2tleSBpbiBrZXlvZiBPYnNpZGlhblpvb21QbHVnaW5TZXR0aW5nc106IGtleW9mIE9ic2lkaWFuWm9vbVBsdWdpblNldHRpbmdzSnNvbjtcbn07XG5cbmV4cG9ydCBjbGFzcyBTZXR0aW5nc1NlcnZpY2UgaW1wbGVtZW50cyBPYnNpZGlhblpvb21QbHVnaW5TZXR0aW5ncyB7XG4gIHByaXZhdGUgc3RvcmFnZTogU3RvcmFnZTtcbiAgcHJpdmF0ZSB2YWx1ZXM6IE9ic2lkaWFuWm9vbVBsdWdpblNldHRpbmdzSnNvbjtcbiAgcHJpdmF0ZSBoYW5kbGVyczogTWFwPEssIFNldDxDYWxsYmFjazxLPj4+O1xuXG4gIGNvbnN0cnVjdG9yKHN0b3JhZ2U6IFN0b3JhZ2UpIHtcbiAgICB0aGlzLnN0b3JhZ2UgPSBzdG9yYWdlO1xuICAgIHRoaXMuaGFuZGxlcnMgPSBuZXcgTWFwKCk7XG4gIH1cblxuICBnZXQgZGVidWcoKSB7XG4gICAgcmV0dXJuIHRoaXMudmFsdWVzLmRlYnVnO1xuICB9XG4gIHNldCBkZWJ1Zyh2YWx1ZTogYm9vbGVhbikge1xuICAgIHRoaXMuc2V0KFwiZGVidWdcIiwgdmFsdWUpO1xuICB9XG5cbiAgZ2V0IHpvb21PbkNsaWNrKCkge1xuICAgIHJldHVybiB0aGlzLnZhbHVlc1ttYXBwaW5nVG9Kc29uLnpvb21PbkNsaWNrXTtcbiAgfVxuICBzZXQgem9vbU9uQ2xpY2sodmFsdWU6IGJvb2xlYW4pIHtcbiAgICB0aGlzLnNldChcInpvb21PbkNsaWNrXCIsIHZhbHVlKTtcbiAgfVxuXG4gIG9uQ2hhbmdlPFQgZXh0ZW5kcyBLPihrZXk6IFQsIGNiOiBDYWxsYmFjazxUPikge1xuICAgIGlmICghdGhpcy5oYW5kbGVycy5oYXMoa2V5KSkge1xuICAgICAgdGhpcy5oYW5kbGVycy5zZXQoa2V5LCBuZXcgU2V0KCkpO1xuICAgIH1cblxuICAgIHRoaXMuaGFuZGxlcnMuZ2V0KGtleSkuYWRkKGNiKTtcbiAgfVxuXG4gIHJlbW92ZUNhbGxiYWNrPFQgZXh0ZW5kcyBLPihrZXk6IFQsIGNiOiBDYWxsYmFjazxUPik6IHZvaWQge1xuICAgIGNvbnN0IGhhbmRsZXJzID0gdGhpcy5oYW5kbGVycy5nZXQoa2V5KTtcblxuICAgIGlmIChoYW5kbGVycykge1xuICAgICAgaGFuZGxlcnMuZGVsZXRlKGNiKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBsb2FkKCkge1xuICAgIHRoaXMudmFsdWVzID0gT2JqZWN0LmFzc2lnbihcbiAgICAgIHt9LFxuICAgICAgREVGQVVMVF9TRVRUSU5HUyxcbiAgICAgIGF3YWl0IHRoaXMuc3RvcmFnZS5sb2FkRGF0YSgpXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIHNhdmUoKSB7XG4gICAgYXdhaXQgdGhpcy5zdG9yYWdlLnNhdmVEYXRhKHRoaXMudmFsdWVzKTtcbiAgfVxuXG4gIHByaXZhdGUgc2V0PFQgZXh0ZW5kcyBLPihrZXk6IFQsIHZhbHVlOiBWPEs+KTogdm9pZCB7XG4gICAgdGhpcy52YWx1ZXNbbWFwcGluZ1RvSnNvbltrZXldXSA9IHZhbHVlO1xuICAgIGNvbnN0IGNhbGxiYWNrcyA9IHRoaXMuaGFuZGxlcnMuZ2V0KGtleSk7XG5cbiAgICBpZiAoIWNhbGxiYWNrcykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGZvciAoY29uc3QgY2Igb2YgY2FsbGJhY2tzLnZhbHVlcygpKSB7XG4gICAgICBjYih2YWx1ZSk7XG4gICAgfVxuICB9XG59XG4iLCJpbXBvcnQgeyBFZGl0b3IsIFBsdWdpbiB9IGZyb20gXCJvYnNpZGlhblwiO1xuXG5pbXBvcnQgeyBGZWF0dXJlIH0gZnJvbSBcIi4vZmVhdHVyZXMvRmVhdHVyZVwiO1xuaW1wb3J0IHsgSGVhZGVyTmF2aWdhdGlvbkZlYXR1cmUgfSBmcm9tIFwiLi9mZWF0dXJlcy9IZWFkZXJOYXZpZ2F0aW9uRmVhdHVyZVwiO1xuaW1wb3J0IHsgTGltaXRTZWxlY3Rpb25GZWF0dXJlIH0gZnJvbSBcIi4vZmVhdHVyZXMvTGltaXRTZWxlY3Rpb25GZWF0dXJlXCI7XG5pbXBvcnQgeyBMaXN0c1N0eWxlc0ZlYXR1cmUgfSBmcm9tIFwiLi9mZWF0dXJlcy9MaXN0c1N0eWxlc0ZlYXR1cmVcIjtcbmltcG9ydCB7IFJlc2V0Wm9vbVdoZW5WaXNpYmxlQ29udGVudEJvdW5kYXJpZXNWaW9sYXRlZEZlYXR1cmUgfSBmcm9tIFwiLi9mZWF0dXJlcy9SZXNldFpvb21XaGVuVmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0ZWRGZWF0dXJlXCI7XG5pbXBvcnQgeyBTZXR0aW5nc1RhYkZlYXR1cmUgfSBmcm9tIFwiLi9mZWF0dXJlcy9TZXR0aW5nc1RhYkZlYXR1cmVcIjtcbmltcG9ydCB7IFpvb21GZWF0dXJlIH0gZnJvbSBcIi4vZmVhdHVyZXMvWm9vbUZlYXR1cmVcIjtcbmltcG9ydCB7IFpvb21PbkNsaWNrRmVhdHVyZSB9IGZyb20gXCIuL2ZlYXR1cmVzL1pvb21PbkNsaWNrRmVhdHVyZVwiO1xuaW1wb3J0IHsgTG9nZ2VyU2VydmljZSB9IGZyb20gXCIuL3NlcnZpY2VzL0xvZ2dlclNlcnZpY2VcIjtcbmltcG9ydCB7IFNldHRpbmdzU2VydmljZSB9IGZyb20gXCIuL3NlcnZpY2VzL1NldHRpbmdzU2VydmljZVwiO1xuaW1wb3J0IHsgZ2V0RWRpdG9yVmlld0Zyb21FZGl0b3IgfSBmcm9tIFwiLi91dGlscy9nZXRFZGl0b3JWaWV3RnJvbUVkaXRvclwiO1xuXG5kZWNsYXJlIGdsb2JhbCB7XG4gIGludGVyZmFjZSBXaW5kb3cge1xuICAgIE9ic2lkaWFuWm9vbVBsdWdpbj86IE9ic2lkaWFuWm9vbVBsdWdpbjtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBPYnNpZGlhblpvb21QbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICBwcm90ZWN0ZWQgem9vbUZlYXR1cmU6IFpvb21GZWF0dXJlO1xuICBwcm90ZWN0ZWQgZmVhdHVyZXM6IEZlYXR1cmVbXTtcblxuICBhc3luYyBvbmxvYWQoKSB7XG4gICAgY29uc29sZS5sb2coYExvYWRpbmcgb2JzaWRpYW4tem9vbWApO1xuXG4gICAgd2luZG93Lk9ic2lkaWFuWm9vbVBsdWdpbiA9IHRoaXM7XG5cbiAgICBjb25zdCBzZXR0aW5ncyA9IG5ldyBTZXR0aW5nc1NlcnZpY2UodGhpcyk7XG4gICAgYXdhaXQgc2V0dGluZ3MubG9hZCgpO1xuXG4gICAgY29uc3QgbG9nZ2VyID0gbmV3IExvZ2dlclNlcnZpY2Uoc2V0dGluZ3MpO1xuXG4gICAgY29uc3Qgc2V0dGluZ3NUYWJGZWF0dXJlID0gbmV3IFNldHRpbmdzVGFiRmVhdHVyZSh0aGlzLCBzZXR0aW5ncyk7XG4gICAgdGhpcy56b29tRmVhdHVyZSA9IG5ldyBab29tRmVhdHVyZSh0aGlzLCBsb2dnZXIpO1xuICAgIGNvbnN0IGxpbWl0U2VsZWN0aW9uRmVhdHVyZSA9IG5ldyBMaW1pdFNlbGVjdGlvbkZlYXR1cmUoXG4gICAgICB0aGlzLFxuICAgICAgbG9nZ2VyLFxuICAgICAgdGhpcy56b29tRmVhdHVyZVxuICAgICk7XG4gICAgY29uc3QgcmVzZXRab29tV2hlblZpc2libGVDb250ZW50Qm91bmRhcmllc1Zpb2xhdGVkRmVhdHVyZSA9XG4gICAgICBuZXcgUmVzZXRab29tV2hlblZpc2libGVDb250ZW50Qm91bmRhcmllc1Zpb2xhdGVkRmVhdHVyZShcbiAgICAgICAgdGhpcyxcbiAgICAgICAgbG9nZ2VyLFxuICAgICAgICB0aGlzLnpvb21GZWF0dXJlLFxuICAgICAgICB0aGlzLnpvb21GZWF0dXJlXG4gICAgICApO1xuICAgIGNvbnN0IGhlYWRlck5hdmlnYXRpb25GZWF0dXJlID0gbmV3IEhlYWRlck5hdmlnYXRpb25GZWF0dXJlKFxuICAgICAgdGhpcyxcbiAgICAgIGxvZ2dlcixcbiAgICAgIHRoaXMuem9vbUZlYXR1cmUsXG4gICAgICB0aGlzLnpvb21GZWF0dXJlLFxuICAgICAgdGhpcy56b29tRmVhdHVyZSxcbiAgICAgIHRoaXMuem9vbUZlYXR1cmUsXG4gICAgICB0aGlzLnpvb21GZWF0dXJlLFxuICAgICAgdGhpcy56b29tRmVhdHVyZVxuICAgICk7XG4gICAgY29uc3Qgem9vbU9uQ2xpY2tGZWF0dXJlID0gbmV3IFpvb21PbkNsaWNrRmVhdHVyZShcbiAgICAgIHRoaXMsXG4gICAgICBzZXR0aW5ncyxcbiAgICAgIHRoaXMuem9vbUZlYXR1cmVcbiAgICApO1xuICAgIGNvbnN0IGxpc3RzU3R5bGVzRmVhdHVyZSA9IG5ldyBMaXN0c1N0eWxlc0ZlYXR1cmUoc2V0dGluZ3MpO1xuXG4gICAgdGhpcy5mZWF0dXJlcyA9IFtcbiAgICAgIHNldHRpbmdzVGFiRmVhdHVyZSxcbiAgICAgIHRoaXMuem9vbUZlYXR1cmUsXG4gICAgICBsaW1pdFNlbGVjdGlvbkZlYXR1cmUsXG4gICAgICByZXNldFpvb21XaGVuVmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0ZWRGZWF0dXJlLFxuICAgICAgaGVhZGVyTmF2aWdhdGlvbkZlYXR1cmUsXG4gICAgICB6b29tT25DbGlja0ZlYXR1cmUsXG4gICAgICBsaXN0c1N0eWxlc0ZlYXR1cmUsXG4gICAgXTtcblxuICAgIGZvciAoY29uc3QgZmVhdHVyZSBvZiB0aGlzLmZlYXR1cmVzKSB7XG4gICAgICBhd2FpdCBmZWF0dXJlLmxvYWQoKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBvbnVubG9hZCgpIHtcbiAgICBjb25zb2xlLmxvZyhgVW5sb2FkaW5nIG9ic2lkaWFuLXpvb21gKTtcblxuICAgIGRlbGV0ZSB3aW5kb3cuT2JzaWRpYW5ab29tUGx1Z2luO1xuXG4gICAgZm9yIChjb25zdCBmZWF0dXJlIG9mIHRoaXMuZmVhdHVyZXMpIHtcbiAgICAgIGF3YWl0IGZlYXR1cmUudW5sb2FkKCk7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIGdldFpvb21SYW5nZShlZGl0b3I6IEVkaXRvcikge1xuICAgIGNvbnN0IGNtID0gZ2V0RWRpdG9yVmlld0Zyb21FZGl0b3IoZWRpdG9yKTtcbiAgICBjb25zdCByYW5nZSA9IHRoaXMuem9vbUZlYXR1cmUuY2FsY3VsYXRlVmlzaWJsZUNvbnRlbnRSYW5nZShjbS5zdGF0ZSk7XG5cbiAgICBpZiAoIXJhbmdlKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBmcm9tID0gY20uc3RhdGUuZG9jLmxpbmVBdChyYW5nZS5mcm9tKTtcbiAgICBjb25zdCB0byA9IGNtLnN0YXRlLmRvYy5saW5lQXQocmFuZ2UudG8pO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGZyb206IHtcbiAgICAgICAgbGluZTogZnJvbS5udW1iZXIgLSAxLFxuICAgICAgICBjaDogcmFuZ2UuZnJvbSAtIGZyb20uZnJvbSxcbiAgICAgIH0sXG4gICAgICB0bzoge1xuICAgICAgICBsaW5lOiB0by5udW1iZXIgLSAxLFxuICAgICAgICBjaDogcmFuZ2UudG8gLSB0by5mcm9tLFxuICAgICAgfSxcbiAgICB9O1xuICB9XG5cbiAgcHVibGljIHpvb21PdXQoZWRpdG9yOiBFZGl0b3IpIHtcbiAgICB0aGlzLnpvb21GZWF0dXJlLnpvb21PdXQoZ2V0RWRpdG9yVmlld0Zyb21FZGl0b3IoZWRpdG9yKSk7XG4gIH1cblxuICBwdWJsaWMgem9vbUluKGVkaXRvcjogRWRpdG9yLCBsaW5lOiBudW1iZXIpIHtcbiAgICBjb25zdCBjbSA9IGdldEVkaXRvclZpZXdGcm9tRWRpdG9yKGVkaXRvcik7XG4gICAgY29uc3QgcG9zID0gY20uc3RhdGUuZG9jLmxpbmUobGluZSArIDEpLmZyb207XG4gICAgdGhpcy56b29tRmVhdHVyZS56b29tSW4oY20sIHBvcyk7XG4gIH1cblxuICBwdWJsaWMgcmVmcmVzaFpvb20oZWRpdG9yOiBFZGl0b3IpIHtcbiAgICB0aGlzLnpvb21GZWF0dXJlLnJlZnJlc2hab29tKGdldEVkaXRvclZpZXdGcm9tRWRpdG9yKGVkaXRvcikpO1xuICB9XG59XG4iXSwibmFtZXMiOlsiZWRpdG9yVmlld0ZpZWxkIiwiZWRpdG9yRWRpdG9yRmllbGQiLCJmb2xkYWJsZSIsIkVkaXRvclN0YXRlIiwiU3RhdGVFZmZlY3QiLCJTdGF0ZUZpZWxkIiwic2hvd1BhbmVsIiwiRWRpdG9yU2VsZWN0aW9uIiwiUGx1Z2luU2V0dGluZ1RhYiIsIlNldHRpbmciLCJEZWNvcmF0aW9uIiwiRWRpdG9yVmlldyIsInZpZXciLCJOb3RpY2UiLCJQbGF0Zm9ybSIsIlBsdWdpbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFvR0E7QUFDTyxTQUFTLFNBQVMsQ0FBQyxPQUFPLEVBQUUsVUFBVSxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUU7QUFDN0QsSUFBSSxTQUFTLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxPQUFPLEtBQUssWUFBWSxDQUFDLEdBQUcsS0FBSyxHQUFHLElBQUksQ0FBQyxDQUFDLFVBQVUsT0FBTyxFQUFFLEVBQUUsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUU7QUFDaEgsSUFBSSxPQUFPLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxPQUFPLENBQUMsRUFBRSxVQUFVLE9BQU8sRUFBRSxNQUFNLEVBQUU7QUFDL0QsUUFBUSxTQUFTLFNBQVMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLEVBQUUsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFO0FBQ25HLFFBQVEsU0FBUyxRQUFRLENBQUMsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLEVBQUUsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFO0FBQ3RHLFFBQVEsU0FBUyxJQUFJLENBQUMsTUFBTSxFQUFFLEVBQUUsTUFBTSxDQUFDLElBQUksR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxRQUFRLENBQUMsQ0FBQyxFQUFFO0FBQ3RILFFBQVEsSUFBSSxDQUFDLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLFVBQVUsSUFBSSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBQzlFLEtBQUssQ0FBQyxDQUFDO0FBQ1A7O0FDdEhNLFNBQVUsZ0JBQWdCLENBQUMsS0FBa0IsRUFBQTtJQUNqRCxPQUFPLEtBQUssQ0FBQyxLQUFLLENBQUNBLHdCQUFlLENBQUMsQ0FBQyxjQUFjLEVBQUUsQ0FBQztBQUN2RDs7QUNETSxTQUFVLDRCQUE0QixDQUFDLEtBQWtCLEVBQUE7QUFDN0QsSUFBQSxPQUFPLEtBQUssQ0FBQyxLQUFLLENBQUNDLDBCQUFpQixDQUFDLENBQUM7QUFDeEM7O0FDUE0sU0FBVSxVQUFVLENBQUMsS0FBYSxFQUFBO0FBQ3RDLElBQUEsT0FBTyxLQUFLO0FBQ1QsU0FBQSxJQUFJLEVBQUU7QUFDTixTQUFBLE9BQU8sQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDO0FBQ3hCLFNBQUEsT0FBTyxDQUFDLG9CQUFvQixFQUFFLElBQUksQ0FBQztBQUNuQyxTQUFBLElBQUksRUFBRSxDQUFDO0FBQ1o7O01DUWEsa0JBQWtCLENBQUE7QUFDN0IsSUFBQSxXQUFBLENBQW9CLGdCQUFrQyxFQUFBO1FBQWxDLElBQWdCLENBQUEsZ0JBQUEsR0FBaEIsZ0JBQWdCLENBQWtCO0tBQUk7SUFFbkQsa0JBQWtCLENBQUMsS0FBa0IsRUFBRSxHQUFXLEVBQUE7QUFDdkQsUUFBQSxNQUFNLFdBQVcsR0FBaUI7QUFDaEMsWUFBQSxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRTtTQUNwRSxDQUFDO1FBRUYsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7QUFFdEMsUUFBQSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUN2QyxNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUMvQixZQUFBLE1BQU0sQ0FBQyxHQUFHQyxpQkFBUSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUM5QyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxHQUFHLE9BQU8sQ0FBQyxJQUFJLEVBQUU7Z0JBQzVCLFdBQVcsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxHQUFHLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7QUFDcEUsYUFBQTtBQUNGLFNBQUE7UUFFRCxXQUFXLENBQUMsSUFBSSxDQUFDO0FBQ2YsWUFBQSxLQUFLLEVBQUUsVUFBVSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUM7WUFDL0IsR0FBRyxFQUFFLE9BQU8sQ0FBQyxJQUFJO0FBQ2xCLFNBQUEsQ0FBQyxDQUFDO0FBRUgsUUFBQSxPQUFPLFdBQVcsQ0FBQztLQUNwQjtBQUNGOztBQ3JDZSxTQUFBLDBDQUEwQyxDQUN4RCxFQUFlLEVBQ2YsWUFBaUQsRUFBQTtJQUVqRCxJQUFJLGFBQWEsR0FBRyxLQUFLLENBQUM7SUFDMUIsSUFBSSxZQUFZLEdBQUcsS0FBSyxDQUFDO0lBQ3pCLElBQUksYUFBYSxHQUFHLEtBQUssQ0FBQztJQUUxQixNQUFNLENBQUMsR0FBRyxDQUFDLENBQVMsRUFBRSxDQUFTLEtBQUssT0FBTyxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBRTNFLElBQUEsSUFBSSxZQUFZLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRTtBQUM3QixRQUFBLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsWUFBWSxDQUFDO1FBRTVCLGFBQWEsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDaEMsUUFBQSxhQUFhLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDeEMsWUFBWSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUNoQyxLQUFBO0FBRUQsSUFBQSxJQUFJLFlBQVksQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO0FBQzdCLFFBQUEsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLFlBQVksQ0FBQztBQUV6QixRQUFBLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxDQUFDLEVBQUU7WUFDaEIsYUFBYSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUNoQyxZQUFBLGFBQWEsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUMvQyxTQUFBO0FBQU0sYUFBQTtZQUNMLGFBQWEsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDakMsWUFBWSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUNoQyxTQUFBO0FBQ0YsS0FBQTtBQUVELElBQUEsTUFBTSxjQUFjLEdBQUcsYUFBYSxJQUFJLFlBQVksQ0FBQztBQUVyRCxJQUFBLE1BQU0sR0FBRyxHQUFHO1FBQ1YsY0FBYztRQUNkLGFBQWE7UUFDYixZQUFZO1FBQ1osYUFBYTtLQUNkLENBQUM7QUFFRixJQUFBLE9BQU8sR0FBRyxDQUFDO0FBQ2I7O01DNUJhLG9DQUFvQyxDQUFBO0lBQy9DLFdBQ1UsQ0FBQSw0QkFBMEQsRUFDMUQsOEJBQThELEVBQUE7UUFEOUQsSUFBNEIsQ0FBQSw0QkFBQSxHQUE1Qiw0QkFBNEIsQ0FBOEI7UUFDMUQsSUFBOEIsQ0FBQSw4QkFBQSxHQUE5Qiw4QkFBOEIsQ0FBZ0M7QUFTaEUsUUFBQSxJQUFBLENBQUEsdUNBQXVDLEdBQUcsQ0FBQyxFQUFlLEtBQVU7QUFDMUUsWUFBQSxNQUFNLFlBQVksR0FDaEIsSUFBSSxDQUFDLDRCQUE0QixDQUFDLDRCQUE0QixDQUM1RCxFQUFFLENBQUMsVUFBVSxDQUNkLENBQUM7QUFFSixZQUFBLE1BQU0sRUFBRSxhQUFhLEVBQUUsYUFBYSxFQUFFLEdBQ3BDLDBDQUEwQyxDQUFDLEVBQUUsRUFBRSxZQUFZLENBQUMsQ0FBQztBQUUvRCxZQUFBLElBQUksYUFBYSxJQUFJLENBQUMsYUFBYSxFQUFFO2dCQUNuQyxZQUFZLENBQUMsTUFBSztvQkFDaEIsSUFBSSxDQUFDLDhCQUE4QixDQUFDLDhCQUE4QixDQUNoRSxFQUFFLENBQUMsS0FBSyxDQUNULENBQUM7QUFDSixpQkFBQyxDQUFDLENBQUM7QUFDSixhQUFBO0FBRUQsWUFBQSxPQUFPLElBQUksQ0FBQztBQUNkLFNBQUMsQ0FBQztLQTFCRTtJQUVKLFlBQVksR0FBQTtRQUNWLE9BQU9DLGlCQUFXLENBQUMsbUJBQW1CLENBQUMsRUFBRSxDQUN2QyxJQUFJLENBQUMsdUNBQXVDLENBQzdDLENBQUM7S0FDSDtBQXFCRjs7QUM3Q2UsU0FBQSxZQUFZLENBQzFCLEdBQWEsRUFDYixHQUdDLEVBQUE7QUFFRCxJQUFBLE1BQU0sRUFBRSxXQUFXLEVBQUUsT0FBTyxFQUFFLEdBQUcsR0FBRyxDQUFDO0lBRXJDLE1BQU0sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDbkMsSUFBQSxDQUFDLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO0FBRXRDLElBQUEsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7UUFDM0MsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFO1lBQ1QsTUFBTSxDQUFDLEdBQUcsR0FBRyxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUNwQyxZQUFBLENBQUMsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLHVCQUF1QixDQUFDLENBQUM7QUFDekMsWUFBQSxDQUFDLENBQUMsU0FBUyxHQUFHLEdBQUcsQ0FBQztBQUNsQixZQUFBLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDYixTQUFBO0FBRUQsUUFBQSxNQUFNLFVBQVUsR0FBRyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbEMsTUFBTSxDQUFDLEdBQUcsR0FBRyxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUNqQyxRQUFBLENBQUMsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLENBQUM7UUFDckMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUN2QyxRQUFBLENBQUMsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUNwRCxDQUFDLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxLQUFJO1lBQ2hDLENBQUMsQ0FBQyxjQUFjLEVBQUUsQ0FBQztBQUNuQixZQUFBLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUEyQixDQUFDO0FBQ3hDLFlBQUEsTUFBTSxHQUFHLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUM7QUFDMUIsWUFBQSxPQUFPLENBQUMsR0FBRyxLQUFLLE1BQU0sR0FBRyxJQUFJLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDL0MsU0FBQyxDQUFDLENBQUM7QUFDSCxRQUFBLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDbEIsS0FBQTtBQUVELElBQUEsT0FBTyxDQUFDLENBQUM7QUFDWDs7QUNWQSxNQUFNLGdCQUFnQixHQUFHQyxpQkFBVyxDQUFDLE1BQU0sRUFBZSxDQUFDO0FBQzNELE1BQU0sZ0JBQWdCLEdBQUdBLGlCQUFXLENBQUMsTUFBTSxFQUFRLENBQUM7QUFFcEQsTUFBTSxXQUFXLEdBQUdDLGdCQUFVLENBQUMsTUFBTSxDQUFxQjtBQUN4RCxJQUFBLE1BQU0sRUFBRSxNQUFNLElBQUk7QUFDbEIsSUFBQSxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsRUFBRSxLQUFJO0FBQ3BCLFFBQUEsS0FBSyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUMsT0FBTyxFQUFFO0FBQzFCLFlBQUEsSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLGdCQUFnQixDQUFDLEVBQUU7QUFDMUIsZ0JBQUEsS0FBSyxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUM7QUFDakIsYUFBQTtBQUNELFlBQUEsSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLGdCQUFnQixDQUFDLEVBQUU7Z0JBQzFCLEtBQUssR0FBRyxJQUFJLENBQUM7QUFDZCxhQUFBO0FBQ0YsU0FBQTtBQUNELFFBQUEsT0FBTyxLQUFLLENBQUM7S0FDZDtBQUNELElBQUEsT0FBTyxFQUFFLENBQUMsQ0FBQyxLQUNUQyxjQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUssS0FBSTtRQUMxQixJQUFJLENBQUMsS0FBSyxFQUFFO0FBQ1YsWUFBQSxPQUFPLElBQUksQ0FBQztBQUNiLFNBQUE7QUFFRCxRQUFBLE9BQU8sQ0FBQyxJQUFJLE1BQU07QUFDaEIsWUFBQSxHQUFHLEVBQUUsSUFBSTtZQUNULEdBQUcsRUFBRSxZQUFZLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxhQUFhLEVBQUU7Z0JBQ3hDLFdBQVcsRUFBRSxLQUFLLENBQUMsV0FBVztBQUM5QixnQkFBQSxPQUFPLEVBQUUsQ0FBQyxHQUFHLEtBQUssS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDO2FBQzNDLENBQUM7QUFDSCxTQUFBLENBQUMsQ0FBQztBQUNMLEtBQUMsQ0FBQztBQUNMLENBQUEsQ0FBQyxDQUFDO01BRVUsc0JBQXNCLENBQUE7SUFDakMsWUFBWSxHQUFBO0FBQ1YsUUFBQSxPQUFPLFdBQVcsQ0FBQztLQUNwQjtBQUVELElBQUEsV0FBQSxDQUNVLE1BQXFCLEVBQ3JCLE1BQWMsRUFDZCxPQUFnQixFQUFBO1FBRmhCLElBQU0sQ0FBQSxNQUFBLEdBQU4sTUFBTSxDQUFlO1FBQ3JCLElBQU0sQ0FBQSxNQUFBLEdBQU4sTUFBTSxDQUFRO1FBQ2QsSUFBTyxDQUFBLE9BQUEsR0FBUCxPQUFPLENBQVM7QUEwQmxCLFFBQUEsSUFBQSxDQUFBLE9BQU8sR0FBRyxDQUFDLElBQWdCLEVBQUUsR0FBa0IsS0FBSTtZQUN6RCxJQUFJLEdBQUcsS0FBSyxJQUFJLEVBQUU7QUFDaEIsZ0JBQUEsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDNUIsYUFBQTtBQUFNLGlCQUFBO2dCQUNMLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQztBQUMvQixhQUFBO0FBQ0gsU0FBQyxDQUFDO0tBL0JFO0lBRUcsVUFBVSxDQUFDLElBQWdCLEVBQUUsV0FBeUIsRUFBQTtRQUMzRCxNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDO1FBQ3JFLENBQUMsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUVqQixJQUFJLENBQUMsUUFBUSxDQUFDO0FBQ1osWUFBQSxPQUFPLEVBQUU7Z0JBQ1AsZ0JBQWdCLENBQUMsRUFBRSxDQUFDO29CQUNsQixXQUFXO29CQUNYLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTztpQkFDdEIsQ0FBQztBQUNILGFBQUE7QUFDRixTQUFBLENBQUMsQ0FBQztLQUNKO0FBRU0sSUFBQSxVQUFVLENBQUMsSUFBZ0IsRUFBQTtRQUNoQyxNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDO1FBQ3JFLENBQUMsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUVqQixJQUFJLENBQUMsUUFBUSxDQUFDO0FBQ1osWUFBQSxPQUFPLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLEVBQUUsQ0FBQztBQUNqQyxTQUFBLENBQUMsQ0FBQztLQUNKO0FBU0Y7O0FDeERELE1BQU0scUJBQXFCLENBQUE7QUFDekIsSUFBQSxXQUFBLENBQ1UsaUJBQW9DLEVBQ3BDLGtCQUFzQyxFQUN0QyxzQkFBOEMsRUFBQTtRQUY5QyxJQUFpQixDQUFBLGlCQUFBLEdBQWpCLGlCQUFpQixDQUFtQjtRQUNwQyxJQUFrQixDQUFBLGtCQUFBLEdBQWxCLGtCQUFrQixDQUFvQjtRQUN0QyxJQUFzQixDQUFBLHNCQUFBLEdBQXRCLHNCQUFzQixDQUF3QjtLQUNwRDtJQUVFLElBQUksR0FBQTs7WUFDUixJQUFJLENBQUMsaUJBQWlCLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxJQUFJLEVBQUUsR0FBRyxLQUFJO0FBQ3JELGdCQUFBLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxrQkFBa0IsQ0FDNUQsSUFBSSxDQUFDLEtBQUssRUFDVixHQUFHLENBQ0osQ0FBQztnQkFDRixJQUFJLENBQUMsc0JBQXNCLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxXQUFXLENBQUMsQ0FBQztBQUM1RCxhQUFDLENBQUMsQ0FBQztTQUNKLENBQUEsQ0FBQTtBQUFBLEtBQUE7SUFFSyxNQUFNLEdBQUE7K0RBQUssQ0FBQSxDQUFBO0FBQUEsS0FBQTtBQUNsQixDQUFBO0FBRUQsTUFBTSxzQkFBc0IsQ0FBQTtJQUMxQixXQUNVLENBQUEsa0JBQXNDLEVBQ3RDLHNCQUE4QyxFQUFBO1FBRDlDLElBQWtCLENBQUEsa0JBQUEsR0FBbEIsa0JBQWtCLENBQW9CO1FBQ3RDLElBQXNCLENBQUEsc0JBQUEsR0FBdEIsc0JBQXNCLENBQXdCO0tBQ3BEO0lBRUUsSUFBSSxHQUFBOztZQUNSLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLElBQUksS0FBSTtBQUNsRCxnQkFBQSxJQUFJLENBQUMsc0JBQXNCLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQy9DLGFBQUMsQ0FBQyxDQUFDO1NBQ0osQ0FBQSxDQUFBO0FBQUEsS0FBQTtJQUVLLE1BQU0sR0FBQTsrREFBSyxDQUFBLENBQUE7QUFBQSxLQUFBO0FBQ2xCLENBQUE7QUFFRCxNQUFNLCtDQUErQyxDQUFBO0lBVW5ELFdBQ1UsQ0FBQSxNQUFjLEVBQ2QsNEJBQTBELEVBQzFELDRCQUEwRCxFQUMxRCxrQkFBc0MsRUFDdEMsc0JBQThDLEVBQUE7UUFKOUMsSUFBTSxDQUFBLE1BQUEsR0FBTixNQUFNLENBQVE7UUFDZCxJQUE0QixDQUFBLDRCQUFBLEdBQTVCLDRCQUE0QixDQUE4QjtRQUMxRCxJQUE0QixDQUFBLDRCQUFBLEdBQTVCLDRCQUE0QixDQUE4QjtRQUMxRCxJQUFrQixDQUFBLGtCQUFBLEdBQWxCLGtCQUFrQixDQUFvQjtRQUN0QyxJQUFzQixDQUFBLHNCQUFBLEdBQXRCLHNCQUFzQixDQUF3QjtBQWRoRCxRQUFBLElBQUEsQ0FBQSxvQ0FBb0MsR0FDMUMsSUFBSSxvQ0FBb0MsQ0FDdEMsSUFBSSxDQUFDLDRCQUE0QixFQUNqQztZQUNFLDhCQUE4QixFQUFFLENBQUMsS0FBSyxLQUNwQyxJQUFJLENBQUMsOEJBQThCLENBQUMsS0FBSyxDQUFDO0FBQzdDLFNBQUEsQ0FDRixDQUFDO0tBUUE7SUFFRSxJQUFJLEdBQUE7O0FBQ1IsWUFBQSxJQUFJLENBQUMsTUFBTSxDQUFDLHVCQUF1QixDQUNqQyxJQUFJLENBQUMsb0NBQW9DLENBQUMsWUFBWSxFQUFFLENBQ3pELENBQUM7U0FDSCxDQUFBLENBQUE7QUFBQSxLQUFBO0lBRUssTUFBTSxHQUFBOytEQUFLLENBQUEsQ0FBQTtBQUFBLEtBQUE7QUFFVCxJQUFBLDhCQUE4QixDQUFDLEtBQWtCLEVBQUE7QUFDdkQsUUFBQSxNQUFNLElBQUksR0FBRyw0QkFBNEIsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUVqRCxRQUFBLE1BQU0sR0FBRyxHQUNQLElBQUksQ0FBQyw0QkFBNEIsQ0FBQyw0QkFBNEIsQ0FDNUQsS0FBSyxDQUNOLENBQUMsSUFBSSxDQUFDO0FBRVQsUUFBQSxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsa0JBQWtCLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBRTNFLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLFdBQVcsQ0FBQyxDQUFDO0tBQzNEO0FBQ0YsQ0FBQTtNQUVZLHVCQUF1QixDQUFBO0FBK0JsQyxJQUFBLFdBQUEsQ0FDVSxNQUFjLEVBQ2QsTUFBcUIsRUFDckIsNEJBQTBELEVBQzFELDRCQUEwRCxFQUMxRCxNQUFjLEVBQ2QsT0FBZ0IsRUFDaEIsaUJBQW9DLEVBQ3BDLGtCQUFzQyxFQUFBO1FBUHRDLElBQU0sQ0FBQSxNQUFBLEdBQU4sTUFBTSxDQUFRO1FBQ2QsSUFBTSxDQUFBLE1BQUEsR0FBTixNQUFNLENBQWU7UUFDckIsSUFBNEIsQ0FBQSw0QkFBQSxHQUE1Qiw0QkFBNEIsQ0FBOEI7UUFDMUQsSUFBNEIsQ0FBQSw0QkFBQSxHQUE1Qiw0QkFBNEIsQ0FBOEI7UUFDMUQsSUFBTSxDQUFBLE1BQUEsR0FBTixNQUFNLENBQVE7UUFDZCxJQUFPLENBQUEsT0FBQSxHQUFQLE9BQU8sQ0FBUztRQUNoQixJQUFpQixDQUFBLGlCQUFBLEdBQWpCLGlCQUFpQixDQUFtQjtRQUNwQyxJQUFrQixDQUFBLGtCQUFBLEdBQWxCLGtCQUFrQixDQUFvQjtRQXRDeEMsSUFBa0IsQ0FBQSxrQkFBQSxHQUFHLElBQUksa0JBQWtCLENBQUM7QUFDbEQsWUFBQSxnQkFBZ0IsRUFBRSxnQkFBZ0I7QUFDbkMsU0FBQSxDQUFDLENBQUM7QUFFSyxRQUFBLElBQUEsQ0FBQSxzQkFBc0IsR0FBRyxJQUFJLHNCQUFzQixDQUN6RCxJQUFJLENBQUMsTUFBTSxFQUNYLElBQUksQ0FBQyxNQUFNLEVBQ1gsSUFBSSxDQUFDLE9BQU8sQ0FDYixDQUFDO0FBRU0sUUFBQSxJQUFBLENBQUEscUJBQXFCLEdBQUcsSUFBSSxxQkFBcUIsQ0FDdkQsSUFBSSxDQUFDLGlCQUFpQixFQUN0QixJQUFJLENBQUMsa0JBQWtCLEVBQ3ZCLElBQUksQ0FBQyxzQkFBc0IsQ0FDNUIsQ0FBQztBQUVNLFFBQUEsSUFBQSxDQUFBLHNCQUFzQixHQUFHLElBQUksc0JBQXNCLENBQ3pELElBQUksQ0FBQyxrQkFBa0IsRUFDdkIsSUFBSSxDQUFDLHNCQUFzQixDQUM1QixDQUFDO1FBRU0sSUFBK0MsQ0FBQSwrQ0FBQSxHQUNyRCxJQUFJLCtDQUErQyxDQUNqRCxJQUFJLENBQUMsTUFBTSxFQUNYLElBQUksQ0FBQyw0QkFBNEIsRUFDakMsSUFBSSxDQUFDLDRCQUE0QixFQUNqQyxJQUFJLENBQUMsa0JBQWtCLEVBQ3ZCLElBQUksQ0FBQyxzQkFBc0IsQ0FDNUIsQ0FBQztLQVdBO0lBRUUsSUFBSSxHQUFBOztBQUNSLFlBQUEsSUFBSSxDQUFDLE1BQU0sQ0FBQyx1QkFBdUIsQ0FDakMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLFlBQVksRUFBRSxDQUMzQyxDQUFDO0FBRUYsWUFBQSxJQUFJLENBQUMscUJBQXFCLENBQUMsSUFBSSxFQUFFLENBQUM7QUFDbEMsWUFBQSxJQUFJLENBQUMsc0JBQXNCLENBQUMsSUFBSSxFQUFFLENBQUM7QUFDbkMsWUFBQSxJQUFJLENBQUMsK0NBQStDLENBQUMsSUFBSSxFQUFFLENBQUM7U0FDN0QsQ0FBQSxDQUFBO0FBQUEsS0FBQTtJQUVLLE1BQU0sR0FBQTs7QUFDVixZQUFBLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxNQUFNLEVBQUUsQ0FBQztBQUNwQyxZQUFBLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQztBQUNyQyxZQUFBLElBQUksQ0FBQywrQ0FBK0MsQ0FBQyxNQUFNLEVBQUUsQ0FBQztTQUMvRCxDQUFBLENBQUE7QUFBQSxLQUFBO0FBQ0Y7O1NDNUtlLHlCQUF5QixDQUN2QyxTQUEwQixFQUMxQixJQUFZLEVBQ1osRUFBVSxFQUFBO0FBRVYsSUFBQSxNQUFNLGFBQWEsR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDO0lBRXJDLE1BQU0sWUFBWSxHQUFHQyxxQkFBZSxDQUFDLEtBQUssQ0FDeEMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQ2xELElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUNoRCxhQUFhLENBQUMsVUFBVSxDQUN6QixDQUFDO0lBRUYsTUFBTSxZQUFZLEdBQ2hCLFNBQVMsQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUM7QUFDM0IsUUFBQSxZQUFZLENBQUMsTUFBTSxLQUFLLGFBQWEsQ0FBQyxNQUFNO0FBQzVDLFFBQUEsWUFBWSxDQUFDLElBQUksS0FBSyxhQUFhLENBQUMsSUFBSSxDQUFDO0lBRTNDLE9BQU8sWUFBWSxHQUFHLFlBQVksR0FBRyxJQUFJLENBQUM7QUFDNUM7O0FDWk8sTUFBTSxZQUFZLEdBQUdILGlCQUFXLENBQUMsTUFBTSxFQUFlLENBQUM7QUFFdkQsTUFBTSxhQUFhLEdBQUdBLGlCQUFXLENBQUMsTUFBTSxFQUFRLENBQUM7QUFFeEQ7QUFDTSxTQUFVLGNBQWMsQ0FBQyxDQUFtQixFQUFBO0FBQ2hELElBQUEsT0FBTyxDQUFDLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBQzVCOztNQ1RhLHlCQUF5QixDQUFBO0FBQ3BDLElBQUEsV0FBQSxDQUFvQixNQUFxQixFQUFBO1FBQXJCLElBQU0sQ0FBQSxNQUFBLEdBQU4sTUFBTSxDQUFlO0FBTWpDLFFBQUEsSUFBQSxDQUFBLHlCQUF5QixHQUFHLENBQUMsRUFBZSxLQUFJO1lBQ3RELE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFvQixjQUFjLENBQUMsQ0FBQztZQUU3RCxJQUFJLENBQUMsQ0FBQyxFQUFFO0FBQ04sZ0JBQUEsT0FBTyxFQUFFLENBQUM7QUFDWCxhQUFBO1lBRUQsTUFBTSxZQUFZLEdBQUcseUJBQXlCLENBQzVDLEVBQUUsQ0FBQyxZQUFZLEVBQ2YsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQ1osQ0FBQyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQ1gsQ0FBQztZQUVGLElBQUksQ0FBQyxZQUFZLEVBQUU7QUFDakIsZ0JBQUEsT0FBTyxFQUFFLENBQUM7QUFDWCxhQUFBO0FBRUQsWUFBQSxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FDYixxREFBcUQsRUFDckQsb0JBQW9CLEVBQ3BCLFlBQVksQ0FBQyxNQUFNLEVBQUUsQ0FDdEIsQ0FBQztZQUVGLE9BQU8sQ0FBQyxFQUFFLEVBQUUsRUFBRSxTQUFTLEVBQUUsWUFBWSxFQUFFLENBQUMsQ0FBQztBQUMzQyxTQUFDLENBQUM7S0E5QjJDO0lBRTdDLFlBQVksR0FBQTtRQUNWLE9BQU9ELGlCQUFXLENBQUMsaUJBQWlCLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO0tBQ3pFO0FBMkJGOztNQzNCWSwwQkFBMEIsQ0FBQTtJQUNyQyxXQUNVLENBQUEsTUFBcUIsRUFDckIsNEJBQTBELEVBQUE7UUFEMUQsSUFBTSxDQUFBLE1BQUEsR0FBTixNQUFNLENBQWU7UUFDckIsSUFBNEIsQ0FBQSw0QkFBQSxHQUE1Qiw0QkFBNEIsQ0FBOEI7QUFPNUQsUUFBQSxJQUFBLENBQUEsMEJBQTBCLEdBQUcsQ0FBQyxFQUFlLEtBQUk7QUFDdkQsWUFBQSxJQUFJLENBQUMsRUFBRSxDQUFDLFNBQVMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLEVBQUU7QUFDOUMsZ0JBQUEsT0FBTyxFQUFFLENBQUM7QUFDWCxhQUFBO0FBRUQsWUFBQSxNQUFNLEtBQUssR0FDVCxJQUFJLENBQUMsNEJBQTRCLENBQUMsNEJBQTRCLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBRTNFLElBQUksQ0FBQyxLQUFLLEVBQUU7QUFDVixnQkFBQSxPQUFPLEVBQUUsQ0FBQztBQUNYLGFBQUE7QUFFRCxZQUFBLE1BQU0sWUFBWSxHQUFHLHlCQUF5QixDQUM1QyxFQUFFLENBQUMsWUFBWSxFQUNmLEtBQUssQ0FBQyxJQUFJLEVBQ1YsS0FBSyxDQUFDLEVBQUUsQ0FDVCxDQUFDO1lBRUYsSUFBSSxDQUFDLFlBQVksRUFBRTtBQUNqQixnQkFBQSxPQUFPLEVBQUUsQ0FBQztBQUNYLGFBQUE7QUFFRCxZQUFBLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUNiLHVEQUF1RCxFQUN2RCxvQkFBb0IsRUFDcEIsWUFBWSxDQUFDLE1BQU0sRUFBRSxDQUN0QixDQUFDO1lBRUYsT0FBTyxDQUFDLEVBQUUsRUFBRSxFQUFFLFNBQVMsRUFBRSxZQUFZLEVBQUUsQ0FBQyxDQUFDO0FBQzNDLFNBQUMsQ0FBQztLQW5DRTtJQUVHLFlBQVksR0FBQTtRQUNqQixPQUFPQSxpQkFBVyxDQUFDLGlCQUFpQixDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsMEJBQTBCLENBQUMsQ0FBQztLQUMxRTtBQWdDRjs7TUNwQ1kscUJBQXFCLENBQUE7QUFTaEMsSUFBQSxXQUFBLENBQ1UsTUFBYyxFQUNkLE1BQXFCLEVBQ3JCLDRCQUEwRCxFQUFBO1FBRjFELElBQU0sQ0FBQSxNQUFBLEdBQU4sTUFBTSxDQUFRO1FBQ2QsSUFBTSxDQUFBLE1BQUEsR0FBTixNQUFNLENBQWU7UUFDckIsSUFBNEIsQ0FBQSw0QkFBQSxHQUE1Qiw0QkFBNEIsQ0FBOEI7UUFYNUQsSUFBeUIsQ0FBQSx5QkFBQSxHQUFHLElBQUkseUJBQXlCLENBQy9ELElBQUksQ0FBQyxNQUFNLENBQ1osQ0FBQztBQUNNLFFBQUEsSUFBQSxDQUFBLDBCQUEwQixHQUFHLElBQUksMEJBQTBCLENBQ2pFLElBQUksQ0FBQyxNQUFNLEVBQ1gsSUFBSSxDQUFDLDRCQUE0QixDQUNsQyxDQUFDO0tBTUU7SUFFRSxJQUFJLEdBQUE7O0FBQ1IsWUFBQSxJQUFJLENBQUMsTUFBTSxDQUFDLHVCQUF1QixDQUNqQyxJQUFJLENBQUMseUJBQXlCLENBQUMsWUFBWSxFQUFFLENBQzlDLENBQUM7QUFFRixZQUFBLElBQUksQ0FBQyxNQUFNLENBQUMsdUJBQXVCLENBQ2pDLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxZQUFZLEVBQUUsQ0FDL0MsQ0FBQztTQUNILENBQUEsQ0FBQTtBQUFBLEtBQUE7SUFFSyxNQUFNLEdBQUE7K0RBQUssQ0FBQSxDQUFBO0FBQUEsS0FBQTtBQUNsQjs7TUN0Q1ksa0JBQWtCLENBQUE7QUFDN0IsSUFBQSxXQUFBLENBQW9CLFFBQXlCLEVBQUE7UUFBekIsSUFBUSxDQUFBLFFBQUEsR0FBUixRQUFRLENBQWlCO0FBbUJyQyxRQUFBLElBQUEsQ0FBQSwwQkFBMEIsR0FBRyxDQUFDLFdBQW9CLEtBQUk7QUFDNUQsWUFBQSxJQUFJLFdBQVcsRUFBRTtnQkFDZixJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7QUFDdEIsYUFBQTtBQUFNLGlCQUFBO2dCQUNMLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO0FBQ3pCLGFBQUE7QUFDSCxTQUFDLENBQUM7S0F6QitDO0lBRTNDLElBQUksR0FBQTs7QUFDUixZQUFBLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLEVBQUU7Z0JBQzdCLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztBQUN0QixhQUFBO1lBRUQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1NBQ3hFLENBQUEsQ0FBQTtBQUFBLEtBQUE7SUFFSyxNQUFNLEdBQUE7O1lBQ1YsSUFBSSxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQzFCLGFBQWEsRUFDYixJQUFJLENBQUMsMEJBQTBCLENBQ2hDLENBQUM7WUFFRixJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztTQUN6QixDQUFBLENBQUE7QUFBQSxLQUFBO0lBVU8sYUFBYSxHQUFBO1FBQ25CLFFBQVEsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO0tBQ3JEO0lBRU8sZ0JBQWdCLEdBQUE7UUFDdEIsUUFBUSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLHNCQUFzQixDQUFDLENBQUM7S0FDeEQ7QUFDRjs7TUN6QlksdUNBQXVDLENBQUE7SUFDbEQsV0FDVSxDQUFBLDRCQUEwRCxFQUMxRCxnQ0FBa0UsRUFBQTtRQURsRSxJQUE0QixDQUFBLDRCQUFBLEdBQTVCLDRCQUE0QixDQUE4QjtRQUMxRCxJQUFnQyxDQUFBLGdDQUFBLEdBQWhDLGdDQUFnQyxDQUFrQztBQVNwRSxRQUFBLElBQUEsQ0FBQSx1Q0FBdUMsR0FBRyxDQUFDLEVBQWUsS0FBVTtBQUMxRSxZQUFBLE1BQU0sWUFBWSxHQUNoQixJQUFJLENBQUMsNEJBQTRCLENBQUMsNEJBQTRCLENBQzVELEVBQUUsQ0FBQyxVQUFVLENBQ2QsQ0FBQztBQUVKLFlBQUEsTUFBTSxFQUFFLGNBQWMsRUFBRSxhQUFhLEVBQUUsR0FDckMsMENBQTBDLENBQUMsRUFBRSxFQUFFLFlBQVksQ0FBQyxDQUFDO1lBRS9ELElBQUksY0FBYyxJQUFJLGFBQWEsRUFBRTtnQkFDbkMsWUFBWSxDQUFDLE1BQUs7b0JBQ2hCLElBQUksQ0FBQyxnQ0FBZ0MsQ0FBQyxnQ0FBZ0MsQ0FDcEUsRUFBRSxDQUFDLEtBQUssQ0FDVCxDQUFDO0FBQ0osaUJBQUMsQ0FBQyxDQUFDO0FBQ0osYUFBQTtBQUVELFlBQUEsT0FBTyxJQUFJLENBQUM7QUFDZCxTQUFDLENBQUM7S0ExQkU7SUFFSixZQUFZLEdBQUE7UUFDVixPQUFPQSxpQkFBVyxDQUFDLG1CQUFtQixDQUFDLEVBQUUsQ0FDdkMsSUFBSSxDQUFDLHVDQUF1QyxDQUM3QyxDQUFDO0tBQ0g7QUFxQkY7O01DeEJZLG9EQUFvRCxDQUFBO0FBWS9ELElBQUEsV0FBQSxDQUNVLE1BQWMsRUFDZCxNQUFxQixFQUNyQiw0QkFBMEQsRUFDMUQsT0FBZ0IsRUFBQTtRQUhoQixJQUFNLENBQUEsTUFBQSxHQUFOLE1BQU0sQ0FBUTtRQUNkLElBQU0sQ0FBQSxNQUFBLEdBQU4sTUFBTSxDQUFlO1FBQ3JCLElBQTRCLENBQUEsNEJBQUEsR0FBNUIsNEJBQTRCLENBQThCO1FBQzFELElBQU8sQ0FBQSxPQUFBLEdBQVAsT0FBTyxDQUFTO0FBYmxCLFFBQUEsSUFBQSxDQUFBLHVDQUF1QyxHQUM3QyxJQUFJLHVDQUF1QyxDQUN6QyxJQUFJLENBQUMsNEJBQTRCLEVBQ2pDO1lBQ0UsZ0NBQWdDLEVBQUUsQ0FBQyxLQUFLLEtBQ3RDLElBQUksQ0FBQyxnQ0FBZ0MsQ0FBQyxLQUFLLENBQUM7QUFDL0MsU0FBQSxDQUNGLENBQUM7S0FPQTtJQUVFLElBQUksR0FBQTs7QUFDUixZQUFBLElBQUksQ0FBQyxNQUFNLENBQUMsdUJBQXVCLENBQ2pDLElBQUksQ0FBQyx1Q0FBdUMsQ0FBQyxZQUFZLEVBQUUsQ0FDNUQsQ0FBQztTQUNILENBQUEsQ0FBQTtBQUFBLEtBQUE7SUFFSyxNQUFNLEdBQUE7K0RBQUssQ0FBQSxDQUFBO0FBQUEsS0FBQTtBQUVULElBQUEsZ0NBQWdDLENBQUMsS0FBa0IsRUFBQTtRQUN6RCxNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FDeEIsdUZBQXVGLENBQ3hGLENBQUM7UUFDRixDQUFDLENBQUMsa0RBQWtELENBQUMsQ0FBQztRQUN0RCxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyw0QkFBNEIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0tBQzNEO0FBQ0Y7O0FDakRELE1BQU0sNEJBQTZCLFNBQVFLLHlCQUFnQixDQUFBO0FBQ3pELElBQUEsV0FBQSxDQUFZLEdBQVEsRUFBRSxNQUFjLEVBQVUsUUFBeUIsRUFBQTtBQUNyRSxRQUFBLEtBQUssQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFEeUIsSUFBUSxDQUFBLFFBQUEsR0FBUixRQUFRLENBQWlCO0tBRXRFO0lBRUQsT0FBTyxHQUFBO0FBQ0wsUUFBQSxNQUFNLEVBQUUsV0FBVyxFQUFFLEdBQUcsSUFBSSxDQUFDO1FBRTdCLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUVwQixJQUFJQyxnQkFBTyxDQUFDLFdBQVcsQ0FBQzthQUNyQixPQUFPLENBQUMsd0NBQXdDLENBQUM7QUFDakQsYUFBQSxTQUFTLENBQUMsQ0FBQyxNQUFNLEtBQUk7QUFDcEIsWUFBQSxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQU8sS0FBSyxLQUFJLFNBQUEsQ0FBQSxJQUFBLEVBQUEsS0FBQSxDQUFBLEVBQUEsS0FBQSxDQUFBLEVBQUEsYUFBQTtBQUNsRSxnQkFBQSxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsR0FBRyxLQUFLLENBQUM7QUFDbEMsZ0JBQUEsTUFBTSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDO2FBQzVCLENBQUEsQ0FBQyxDQUFDO0FBQ0wsU0FBQyxDQUFDLENBQUM7UUFFTCxJQUFJQSxnQkFBTyxDQUFDLFdBQVcsQ0FBQzthQUNyQixPQUFPLENBQUMsWUFBWSxDQUFDO2FBQ3JCLE9BQU8sQ0FDTiw2RUFBNkUsQ0FDOUU7QUFDQSxhQUFBLFNBQVMsQ0FBQyxDQUFDLE1BQU0sS0FBSTtBQUNwQixZQUFBLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBTyxLQUFLLEtBQUksU0FBQSxDQUFBLElBQUEsRUFBQSxLQUFBLENBQUEsRUFBQSxLQUFBLENBQUEsRUFBQSxhQUFBO0FBQzVELGdCQUFBLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztBQUM1QixnQkFBQSxNQUFNLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7YUFDNUIsQ0FBQSxDQUFDLENBQUM7QUFDTCxTQUFDLENBQUMsQ0FBQztLQUNOO0FBQ0YsQ0FBQTtNQUVZLGtCQUFrQixDQUFBO0lBQzdCLFdBQW9CLENBQUEsTUFBYyxFQUFVLFFBQXlCLEVBQUE7UUFBakQsSUFBTSxDQUFBLE1BQUEsR0FBTixNQUFNLENBQVE7UUFBVSxJQUFRLENBQUEsUUFBQSxHQUFSLFFBQVEsQ0FBaUI7S0FBSTtJQUVuRSxJQUFJLEdBQUE7O1lBQ1IsSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQ3ZCLElBQUksNEJBQTRCLENBQzlCLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUNmLElBQUksQ0FBQyxNQUFNLEVBQ1gsSUFBSSxDQUFDLFFBQVEsQ0FDZCxDQUNGLENBQUM7U0FDSCxDQUFBLENBQUE7QUFBQSxLQUFBO0lBRUssTUFBTSxHQUFBOytEQUFLLENBQUEsQ0FBQTtBQUFBLEtBQUE7QUFDbEI7O0FDbkRLLFNBQVUsZ0JBQWdCLENBQUMsR0FBUSxFQUFBO0FBQ3ZDLElBQUEsTUFBTSxNQUFNLEdBSVYsTUFBQSxDQUFBLE1BQUEsQ0FBQSxFQUFBLFdBQVcsRUFBRSxJQUFJLEVBQ2pCLFVBQVUsRUFBRSxJQUFJLEVBQUEsRUFFWixHQUFHLENBQUMsS0FBYSxDQUFDLE1BQU0sQ0FDN0IsQ0FBQztBQUVGLElBQUEsT0FBTyxNQUFNLENBQUMsV0FBVyxJQUFJLE1BQU0sQ0FBQyxVQUFVLENBQUM7QUFDakQ7O01DWGEsd0JBQXdCLENBQUE7SUFDNUIsd0JBQXdCLENBQUMsS0FBa0IsRUFBRSxHQUFXLEVBQUE7UUFDN0QsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDbkMsUUFBQSxNQUFNLFNBQVMsR0FBR1AsaUJBQVEsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFdEQsSUFBSSxDQUFDLFNBQVMsSUFBSSxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFO0FBQ3hELFlBQUEsT0FBTyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUM7QUFDekMsU0FBQTtRQUVELElBQUksQ0FBQyxTQUFTLEVBQUU7QUFDZCxZQUFBLE9BQU8sSUFBSSxDQUFDO0FBQ2IsU0FBQTtBQUVELFFBQUEsT0FBTyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxTQUFTLENBQUMsRUFBRSxFQUFFLENBQUM7S0FDOUM7QUFDRjs7QUNoQkssU0FBVSxlQUFlLENBQzdCLEVBQWUsRUFBQTtJQUVmLE1BQU0sR0FBRyxHQUFHLEVBQUUsQ0FBQztBQUNmLElBQUEsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDO0FBQ3BCLElBQUEsT0FBTyxDQUFDLENBQUMsS0FBSyxLQUFLLElBQUksRUFBRTtBQUN2QixRQUFBLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDckMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO0FBQ1YsS0FBQTtBQUNELElBQUEsT0FBTyxHQUFHLENBQUM7QUFDYjs7QUNKQSxNQUFNLGNBQWMsR0FBR1EsZUFBVSxDQUFDLE9BQU8sQ0FBQyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBRTNELE1BQU0sY0FBYyxHQUFHTCxnQkFBVSxDQUFDLE1BQU0sQ0FBZ0I7SUFDdEQsTUFBTSxFQUFFLE1BQUs7UUFDWCxPQUFPSyxlQUFVLENBQUMsSUFBSSxDQUFDO0tBQ3hCO0FBRUQsSUFBQSxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsRUFBRSxLQUFJO1FBQ3BCLEtBQUssR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsQ0FBQztBQUU5QixRQUFBLEtBQUssTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDLE9BQU8sRUFBRTtBQUMxQixZQUFBLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsRUFBRTtBQUN0QixnQkFBQSxLQUFLLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxFQUFFLE1BQU0sRUFBRSxNQUFNLEtBQUssRUFBRSxDQUFDLENBQUM7QUFFOUMsZ0JBQUEsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksR0FBRyxDQUFDLEVBQUU7QUFDcEIsb0JBQUEsS0FBSyxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUM7QUFDbkIsd0JBQUEsR0FBRyxFQUFFLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDakQscUJBQUEsQ0FBQyxDQUFDO0FBQ0osaUJBQUE7Z0JBRUQsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRTtBQUNqQyxvQkFBQSxLQUFLLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQzt3QkFDbkIsR0FBRyxFQUFFLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEVBQUUsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUM5RCxxQkFBQSxDQUFDLENBQUM7QUFDSixpQkFBQTtBQUNGLGFBQUE7QUFFRCxZQUFBLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxhQUFhLENBQUMsRUFBRTtBQUN2QixnQkFBQSxLQUFLLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxFQUFFLE1BQU0sRUFBRSxNQUFNLEtBQUssRUFBRSxDQUFDLENBQUM7QUFDL0MsYUFBQTtBQUNGLFNBQUE7QUFFRCxRQUFBLE9BQU8sS0FBSyxDQUFDO0tBQ2Q7QUFFRCxJQUFBLE9BQU8sRUFBRSxDQUFDLGNBQWMsS0FBS0MsZUFBVSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDO0FBQ3pFLENBQUEsQ0FBQyxDQUFDO01BRVUsNEJBQTRCLENBQUE7QUFDdkMsSUFBQSxXQUFBLENBQW9CLE1BQXFCLEVBQUE7UUFBckIsSUFBTSxDQUFBLE1BQUEsR0FBTixNQUFNLENBQWU7S0FBSTtJQUV0QyxZQUFZLEdBQUE7QUFDakIsUUFBQSxPQUFPLGNBQWMsQ0FBQztLQUN2QjtBQUVNLElBQUEsNEJBQTRCLENBQUMsS0FBa0IsRUFBQTtRQUNwRCxPQUFPLGVBQWUsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUM7S0FDckQ7QUFFTSxJQUFBLDRCQUE0QixDQUFDLEtBQWtCLEVBQUE7UUFDcEQsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLDRCQUE0QixDQUFDLEtBQUssQ0FBQyxDQUFDO0FBRXhELFFBQUEsSUFBSSxNQUFNLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRTtBQUN2QixZQUFBLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUM7QUFFbkIsWUFBQSxJQUFJLENBQUMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxFQUFFO0FBQ2hCLGdCQUFBLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLENBQUM7QUFDakQsYUFBQTtBQUFNLGlCQUFBO0FBQ0wsZ0JBQUEsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxFQUFFLENBQUM7QUFDcEMsYUFBQTtBQUNGLFNBQUE7QUFFRCxRQUFBLElBQUksTUFBTSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7QUFDdkIsWUFBQSxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQztBQUV0QixZQUFBLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxFQUFFLENBQUM7QUFDM0MsU0FBQTtBQUVELFFBQUEsT0FBTyxJQUFJLENBQUM7S0FDYjtJQUVNLDRCQUE0QixDQUNqQ0MsTUFBZ0IsRUFDaEIsSUFBWSxFQUNaLEVBQVUsRUFDVixVQUF3QyxFQUFFLEVBQUE7QUFFMUMsUUFBQSxNQUFNLEVBQUUsY0FBYyxFQUFFLEdBQUEsTUFBQSxDQUFBLE1BQUEsQ0FBUSxFQUFFLGNBQWMsRUFBRSxJQUFJLEVBQUUsRUFBSyxPQUFPLENBQUUsQ0FBQztBQUV2RSxRQUFBLE1BQU0sTUFBTSxHQUFHLFlBQVksQ0FBQyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUU3QyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FDYixvREFBb0QsRUFDcEQsa0NBQWtDLEVBQ2xDLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUNqQixNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FDaEIsQ0FBQztRQUVGQSxNQUFJLENBQUMsUUFBUSxDQUFDO1lBQ1osT0FBTyxFQUFFLENBQUMsTUFBTSxDQUFDO0FBQ2xCLFNBQUEsQ0FBQyxDQUFDO0FBRUgsUUFBQSxJQUFJLGNBQWMsRUFBRTtZQUNsQkEsTUFBSSxDQUFDLFFBQVEsQ0FBQztBQUNaLGdCQUFBLE9BQU8sRUFBRTtvQkFDUEQsZUFBVSxDQUFDLGNBQWMsQ0FBQ0MsTUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFO0FBQ25ELHdCQUFBLENBQUMsRUFBRSxPQUFPO3FCQUNYLENBQUM7QUFDSCxpQkFBQTtBQUNGLGFBQUEsQ0FBQyxDQUFDO0FBQ0osU0FBQTtLQUNGO0FBRU0sSUFBQSxjQUFjLENBQUNBLE1BQWdCLEVBQUE7UUFDcEMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsc0NBQXNDLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztBQUU1RSxRQUFBQSxNQUFJLENBQUMsUUFBUSxDQUFDLEVBQUUsT0FBTyxFQUFFLENBQUMsYUFBYSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ2pEQSxNQUFJLENBQUMsUUFBUSxDQUFDO0FBQ1osWUFBQSxPQUFPLEVBQUU7Z0JBQ1BELGVBQVUsQ0FBQyxjQUFjLENBQUNDLE1BQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRTtBQUNuRCxvQkFBQSxDQUFDLEVBQUUsUUFBUTtpQkFDWixDQUFDO0FBQ0gsYUFBQTtBQUNGLFNBQUEsQ0FBQyxDQUFDO0tBQ0o7QUFDRjs7QUN2SEssU0FBVSx1QkFBdUIsQ0FBQyxNQUFjLEVBQUE7O0lBRXBELE9BQVEsTUFBYyxDQUFDLEVBQUUsQ0FBQztBQUM1Qjs7TUNTYSxXQUFXLENBQUE7SUFVdEIsV0FBb0IsQ0FBQSxNQUFjLEVBQVUsTUFBcUIsRUFBQTtRQUE3QyxJQUFNLENBQUEsTUFBQSxHQUFOLE1BQU0sQ0FBUTtRQUFVLElBQU0sQ0FBQSxNQUFBLEdBQU4sTUFBTSxDQUFlO1FBVHpELElBQWUsQ0FBQSxlQUFBLEdBQXFCLEVBQUUsQ0FBQztRQUN2QyxJQUFnQixDQUFBLGdCQUFBLEdBQXNCLEVBQUUsQ0FBQztRQUV6QyxJQUE0QixDQUFBLDRCQUFBLEdBQUcsSUFBSSw0QkFBNEIsQ0FDckUsSUFBSSxDQUFDLE1BQU0sQ0FDWixDQUFDO0FBRU0sUUFBQSxJQUFBLENBQUEsd0JBQXdCLEdBQUcsSUFBSSx3QkFBd0IsRUFBRSxDQUFDO0tBRUc7QUFFOUQsSUFBQSw0QkFBNEIsQ0FBQyxLQUFrQixFQUFBO1FBQ3BELE9BQU8sSUFBSSxDQUFDLDRCQUE0QixDQUFDLDRCQUE0QixDQUNuRSxLQUFLLENBQ04sQ0FBQztLQUNIO0FBRU0sSUFBQSw0QkFBNEIsQ0FBQyxLQUFrQixFQUFBO1FBQ3BELE9BQU8sSUFBSSxDQUFDLDRCQUE0QixDQUFDLDRCQUE0QixDQUNuRSxLQUFLLENBQ04sQ0FBQztLQUNIO0FBRU0sSUFBQSxpQkFBaUIsQ0FBQyxFQUFrQixFQUFBO0FBQ3pDLFFBQUEsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7S0FDL0I7QUFFTSxJQUFBLGtCQUFrQixDQUFDLEVBQW1CLEVBQUE7QUFDM0MsUUFBQSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0tBQ2hDO0FBRU0sSUFBQSxXQUFXLENBQUMsSUFBZ0IsRUFBQTtBQUNqQyxRQUFBLE1BQU0sU0FBUyxHQUNiLElBQUksQ0FBQyw0QkFBNEIsQ0FBQyw0QkFBNEIsQ0FDNUQsSUFBSSxDQUFDLEtBQUssQ0FDWCxDQUFDO1FBRUosSUFBSSxDQUFDLFNBQVMsRUFBRTtZQUNkLE9BQU87QUFDUixTQUFBO0FBRUQsUUFBQSxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsd0JBQXdCLENBQUMsd0JBQXdCLENBQ3JFLElBQUksQ0FBQyxLQUFLLEVBQ1YsU0FBUyxDQUFDLElBQUksQ0FDZixDQUFDO1FBRUYsSUFBSSxDQUFDLFFBQVEsRUFBRTtZQUNiLE9BQU87QUFDUixTQUFBO1FBRUQsSUFBSSxDQUFDLDRCQUE0QixDQUFDLDRCQUE0QixDQUM1RCxJQUFJLEVBQ0osUUFBUSxDQUFDLElBQUksRUFDYixRQUFRLENBQUMsRUFBRSxFQUNYLEVBQUUsY0FBYyxFQUFFLEtBQUssRUFBRSxDQUMxQixDQUFDO0tBQ0g7SUFFTSxNQUFNLENBQUMsSUFBZ0IsRUFBRSxHQUFXLEVBQUE7UUFDekMsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUNqRCxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUM7UUFFaEIsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUU7QUFDdEMsWUFBQSxJQUFJQyxlQUFNLENBQ1IsQ0FBbUcsaUdBQUEsQ0FBQSxDQUNwRyxDQUFDO1lBQ0YsT0FBTztBQUNSLFNBQUE7QUFFRCxRQUFBLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyx3QkFBd0IsQ0FDbEUsSUFBSSxDQUFDLEtBQUssRUFDVixHQUFHLENBQ0osQ0FBQztRQUVGLElBQUksQ0FBQyxLQUFLLEVBQUU7WUFDVixDQUFDLENBQUMsdUNBQXVDLENBQUMsQ0FBQztZQUMzQyxPQUFPO0FBQ1IsU0FBQTtBQUVELFFBQUEsSUFBSSxDQUFDLDRCQUE0QixDQUFDLDRCQUE0QixDQUM1RCxJQUFJLEVBQ0osS0FBSyxDQUFDLElBQUksRUFDVixLQUFLLENBQUMsRUFBRSxDQUNULENBQUM7QUFFRixRQUFBLEtBQUssTUFBTSxFQUFFLElBQUksSUFBSSxDQUFDLGVBQWUsRUFBRTtBQUNyQyxZQUFBLEVBQUUsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUM7QUFDZixTQUFBO0tBQ0Y7QUFFTSxJQUFBLE9BQU8sQ0FBQyxJQUFnQixFQUFBO1FBQzdCLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLENBQUM7UUFDakQsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBRWpCLFFBQUEsSUFBSSxDQUFDLDRCQUE0QixDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUV2RCxRQUFBLEtBQUssTUFBTSxFQUFFLElBQUksSUFBSSxDQUFDLGdCQUFnQixFQUFFO1lBQ3RDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNWLFNBQUE7S0FDRjtJQUVLLElBQUksR0FBQTs7QUFDUixZQUFBLElBQUksQ0FBQyxNQUFNLENBQUMsdUJBQXVCLENBQ2pDLElBQUksQ0FBQyw0QkFBNEIsQ0FBQyxZQUFZLEVBQUUsQ0FDakQsQ0FBQztBQUVGLFlBQUEsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUM7QUFDckIsZ0JBQUEsRUFBRSxFQUFFLFNBQVM7QUFDYixnQkFBQSxJQUFJLEVBQUUsU0FBUztBQUNmLGdCQUFBLElBQUksRUFBRSxTQUFTO0FBQ2YsZ0JBQUEsY0FBYyxFQUFFLENBQUMsTUFBTSxLQUFJO0FBQ3pCLG9CQUFBLE1BQU0sSUFBSSxHQUFHLHVCQUF1QixDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQzdDLG9CQUFBLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztpQkFDbkQ7QUFDRCxnQkFBQSxPQUFPLEVBQUU7QUFDUCxvQkFBQTt3QkFDRSxTQUFTLEVBQUUsQ0FBQyxLQUFLLENBQUM7QUFDbEIsd0JBQUEsR0FBRyxFQUFFLEdBQUc7QUFDVCxxQkFBQTtBQUNGLGlCQUFBO0FBQ0YsYUFBQSxDQUFDLENBQUM7QUFFSCxZQUFBLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDO0FBQ3JCLGdCQUFBLEVBQUUsRUFBRSxVQUFVO0FBQ2QsZ0JBQUEsSUFBSSxFQUFFLDhCQUE4QjtBQUNwQyxnQkFBQSxJQUFJLEVBQUUsVUFBVTtBQUNoQixnQkFBQSxjQUFjLEVBQUUsQ0FBQyxNQUFNLEtBQUssSUFBSSxDQUFDLE9BQU8sQ0FBQyx1QkFBdUIsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUN6RSxnQkFBQSxPQUFPLEVBQUU7QUFDUCxvQkFBQTtBQUNFLHdCQUFBLFNBQVMsRUFBRSxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUM7QUFDM0Isd0JBQUEsR0FBRyxFQUFFLEdBQUc7QUFDVCxxQkFBQTtBQUNGLGlCQUFBO0FBQ0YsYUFBQSxDQUFDLENBQUM7U0FDSixDQUFBLENBQUE7QUFBQSxLQUFBO0lBRUssTUFBTSxHQUFBOytEQUFLLENBQUEsQ0FBQTtBQUFBLEtBQUE7QUFDbEI7O0FDMUpLLFNBQVUsYUFBYSxDQUFDLENBQWMsRUFBQTtJQUMxQyxRQUNFLENBQUMsWUFBWSxlQUFlO0FBQzVCLFNBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDO1lBQ2xDLENBQUMsQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFDN0M7QUFDSjs7TUNLYSxtQkFBbUIsQ0FBQTtJQUM5QixXQUNVLENBQUEsUUFBeUIsRUFDekIsYUFBNEIsRUFBQTtRQUQ1QixJQUFRLENBQUEsUUFBQSxHQUFSLFFBQVEsQ0FBaUI7UUFDekIsSUFBYSxDQUFBLGFBQUEsR0FBYixhQUFhLENBQWU7QUFpQjlCLFFBQUEsSUFBQSxDQUFBLG1CQUFtQixHQUFHLENBQUMsQ0FBYSxFQUFFLElBQWdCLEtBQUk7QUFDaEUsWUFBQSxJQUNFLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXO0FBQzFCLGdCQUFBLEVBQUUsQ0FBQyxDQUFDLE1BQU0sWUFBWSxXQUFXLENBQUM7QUFDbEMsZ0JBQUEsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUN4QjtnQkFDQSxPQUFPO0FBQ1IsYUFBQTtZQUVELE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3BDLElBQUksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQztBQUM5QyxTQUFDLENBQUM7S0EzQkU7SUFFSixZQUFZLEdBQUE7UUFDVixPQUFPRixlQUFVLENBQUMsZ0JBQWdCLENBQUM7WUFDakMsS0FBSyxFQUFFLElBQUksQ0FBQyxtQkFBbUI7QUFDaEMsU0FBQSxDQUFDLENBQUM7S0FDSjtJQUVNLG1CQUFtQixDQUFDLElBQWdCLEVBQUUsR0FBVyxFQUFBO0FBQ3RELFFBQUEsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRXhDLElBQUksQ0FBQyxRQUFRLENBQUM7WUFDWixTQUFTLEVBQUVKLHFCQUFlLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7QUFDM0MsU0FBQSxDQUFDLENBQUM7S0FDSjtBQWNGOztNQzlCWSxrQkFBa0IsQ0FBQTtBQUs3QixJQUFBLFdBQUEsQ0FDVSxNQUFjLEVBQ2QsUUFBeUIsRUFDekIsTUFBYyxFQUFBO1FBRmQsSUFBTSxDQUFBLE1BQUEsR0FBTixNQUFNLENBQVE7UUFDZCxJQUFRLENBQUEsUUFBQSxHQUFSLFFBQVEsQ0FBaUI7UUFDekIsSUFBTSxDQUFBLE1BQUEsR0FBTixNQUFNLENBQVE7QUFQaEIsUUFBQSxJQUFBLENBQUEsbUJBQW1CLEdBQUcsSUFBSSxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFO0FBQ25FLFlBQUEsYUFBYSxFQUFFLENBQUMsSUFBSSxFQUFFLEdBQUcsS0FBSyxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSxHQUFHLENBQUM7QUFDNUQsU0FBQSxDQUFDLENBQUM7S0FNQztJQUVFLElBQUksR0FBQTs7QUFDUixZQUFBLElBQUksQ0FBQyxNQUFNLENBQUMsdUJBQXVCLENBQ2pDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxZQUFZLEVBQUUsQ0FDeEMsQ0FBQztTQUNILENBQUEsQ0FBQTtBQUFBLEtBQUE7SUFFSyxNQUFNLEdBQUE7K0RBQUssQ0FBQSxDQUFBO0FBQUEsS0FBQTtJQUVULGFBQWEsQ0FBQyxJQUFnQixFQUFFLEdBQVcsRUFBQTtRQUNqRCxJQUFJLENBQUMsbUJBQW1CLENBQUMsbUJBQW1CLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ3hELElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQztLQUMvQjtBQUNGOztNQ2xDWSxhQUFhLENBQUE7QUFDeEIsSUFBQSxXQUFBLENBQW9CLFFBQXlCLEVBQUE7UUFBekIsSUFBUSxDQUFBLFFBQUEsR0FBUixRQUFRLENBQWlCO0tBQUk7O0FBR2pELElBQUEsR0FBRyxDQUFDLE1BQWMsRUFBRSxHQUFHLElBQVcsRUFBQTtBQUNoQyxRQUFBLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRTtZQUN4QixPQUFPO0FBQ1IsU0FBQTtRQUVELE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUM7S0FDL0I7QUFFRCxJQUFBLElBQUksQ0FBQyxNQUFjLEVBQUE7O0FBRWpCLFFBQUEsT0FBTyxDQUFDLEdBQUcsSUFBVyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUM7S0FDdEQ7QUFDRjs7QUNMRCxNQUFNLGdCQUFnQixHQUFtQztBQUN2RCxJQUFBLEtBQUssRUFBRSxLQUFLO0FBQ1osSUFBQSxXQUFXLEVBQUUsSUFBSTtBQUNqQixJQUFBLGlCQUFpQixFQUFFLEtBQUs7Q0FDekIsQ0FBQztBQVdGLE1BQU0sZUFBZSxHQUFHTyxpQkFBUSxDQUFDLFNBQVM7QUFDeEMsTUFBRSxhQUFhO01BQ2IsbUJBQW1CLENBQUM7QUFFeEIsTUFBTSxhQUFhLEdBQUc7QUFDcEIsSUFBQSxXQUFXLEVBQUUsZUFBZTtBQUM1QixJQUFBLEtBQUssRUFBRSxPQUFPO0NBR2YsQ0FBQztNQUVXLGVBQWUsQ0FBQTtBQUsxQixJQUFBLFdBQUEsQ0FBWSxPQUFnQixFQUFBO0FBQzFCLFFBQUEsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7QUFDdkIsUUFBQSxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7S0FDM0I7QUFFRCxJQUFBLElBQUksS0FBSyxHQUFBO0FBQ1AsUUFBQSxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDO0tBQzFCO0lBQ0QsSUFBSSxLQUFLLENBQUMsS0FBYyxFQUFBO0FBQ3RCLFFBQUEsSUFBSSxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUM7S0FDMUI7QUFFRCxJQUFBLElBQUksV0FBVyxHQUFBO1FBQ2IsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsQ0FBQztLQUMvQztJQUNELElBQUksV0FBVyxDQUFDLEtBQWMsRUFBQTtBQUM1QixRQUFBLElBQUksQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLEtBQUssQ0FBQyxDQUFDO0tBQ2hDO0lBRUQsUUFBUSxDQUFjLEdBQU0sRUFBRSxFQUFlLEVBQUE7UUFDM0MsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFO1lBQzNCLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxJQUFJLEdBQUcsRUFBRSxDQUFDLENBQUM7QUFDbkMsU0FBQTtBQUVELFFBQUEsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0tBQ2hDO0lBRUQsY0FBYyxDQUFjLEdBQU0sRUFBRSxFQUFlLEVBQUE7UUFDakQsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7QUFFeEMsUUFBQSxJQUFJLFFBQVEsRUFBRTtBQUNaLFlBQUEsUUFBUSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUNyQixTQUFBO0tBQ0Y7SUFFSyxJQUFJLEdBQUE7O0FBQ1IsWUFBQSxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQ3pCLEVBQUUsRUFDRixnQkFBZ0IsRUFDaEIsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUM5QixDQUFDO1NBQ0gsQ0FBQSxDQUFBO0FBQUEsS0FBQTtJQUVLLElBQUksR0FBQTs7WUFDUixNQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztTQUMxQyxDQUFBLENBQUE7QUFBQSxLQUFBO0lBRU8sR0FBRyxDQUFjLEdBQU0sRUFBRSxLQUFXLEVBQUE7UUFDMUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxLQUFLLENBQUM7UUFDeEMsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFekMsSUFBSSxDQUFDLFNBQVMsRUFBRTtZQUNkLE9BQU87QUFDUixTQUFBO0FBRUQsUUFBQSxLQUFLLE1BQU0sRUFBRSxJQUFJLFNBQVMsQ0FBQyxNQUFNLEVBQUUsRUFBRTtZQUNuQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDWCxTQUFBO0tBQ0Y7QUFDRjs7QUNuRm9CLE1BQUEsa0JBQW1CLFNBQVFDLGVBQU0sQ0FBQTtJQUk5QyxNQUFNLEdBQUE7O0FBQ1YsWUFBQSxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUEscUJBQUEsQ0FBdUIsQ0FBQyxDQUFDO0FBRXJDLFlBQUEsTUFBTSxDQUFDLGtCQUFrQixHQUFHLElBQUksQ0FBQztBQUVqQyxZQUFBLE1BQU0sUUFBUSxHQUFHLElBQUksZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQzNDLFlBQUEsTUFBTSxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7QUFFdEIsWUFBQSxNQUFNLE1BQU0sR0FBRyxJQUFJLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUUzQyxNQUFNLGtCQUFrQixHQUFHLElBQUksa0JBQWtCLENBQUMsSUFBSSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQ2xFLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxXQUFXLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0FBQ2pELFlBQUEsTUFBTSxxQkFBcUIsR0FBRyxJQUFJLHFCQUFxQixDQUNyRCxJQUFJLEVBQ0osTUFBTSxFQUNOLElBQUksQ0FBQyxXQUFXLENBQ2pCLENBQUM7QUFDRixZQUFBLE1BQU0sb0RBQW9ELEdBQ3hELElBQUksb0RBQW9ELENBQ3RELElBQUksRUFDSixNQUFNLEVBQ04sSUFBSSxDQUFDLFdBQVcsRUFDaEIsSUFBSSxDQUFDLFdBQVcsQ0FDakIsQ0FBQztBQUNKLFlBQUEsTUFBTSx1QkFBdUIsR0FBRyxJQUFJLHVCQUF1QixDQUN6RCxJQUFJLEVBQ0osTUFBTSxFQUNOLElBQUksQ0FBQyxXQUFXLEVBQ2hCLElBQUksQ0FBQyxXQUFXLEVBQ2hCLElBQUksQ0FBQyxXQUFXLEVBQ2hCLElBQUksQ0FBQyxXQUFXLEVBQ2hCLElBQUksQ0FBQyxXQUFXLEVBQ2hCLElBQUksQ0FBQyxXQUFXLENBQ2pCLENBQUM7QUFDRixZQUFBLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxrQkFBa0IsQ0FDL0MsSUFBSSxFQUNKLFFBQVEsRUFDUixJQUFJLENBQUMsV0FBVyxDQUNqQixDQUFDO0FBQ0YsWUFBQSxNQUFNLGtCQUFrQixHQUFHLElBQUksa0JBQWtCLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFNUQsSUFBSSxDQUFDLFFBQVEsR0FBRztnQkFDZCxrQkFBa0I7QUFDbEIsZ0JBQUEsSUFBSSxDQUFDLFdBQVc7Z0JBQ2hCLHFCQUFxQjtnQkFDckIsb0RBQW9EO2dCQUNwRCx1QkFBdUI7Z0JBQ3ZCLGtCQUFrQjtnQkFDbEIsa0JBQWtCO2FBQ25CLENBQUM7QUFFRixZQUFBLEtBQUssTUFBTSxPQUFPLElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRTtBQUNuQyxnQkFBQSxNQUFNLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQztBQUN0QixhQUFBO1NBQ0YsQ0FBQSxDQUFBO0FBQUEsS0FBQTtJQUVLLFFBQVEsR0FBQTs7QUFDWixZQUFBLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQSx1QkFBQSxDQUF5QixDQUFDLENBQUM7WUFFdkMsT0FBTyxNQUFNLENBQUMsa0JBQWtCLENBQUM7QUFFakMsWUFBQSxLQUFLLE1BQU0sT0FBTyxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUU7QUFDbkMsZ0JBQUEsTUFBTSxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUM7QUFDeEIsYUFBQTtTQUNGLENBQUEsQ0FBQTtBQUFBLEtBQUE7QUFFTSxJQUFBLFlBQVksQ0FBQyxNQUFjLEVBQUE7QUFDaEMsUUFBQSxNQUFNLEVBQUUsR0FBRyx1QkFBdUIsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUMzQyxRQUFBLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsNEJBQTRCLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRXRFLElBQUksQ0FBQyxLQUFLLEVBQUU7QUFDVixZQUFBLE9BQU8sSUFBSSxDQUFDO0FBQ2IsU0FBQTtBQUVELFFBQUEsTUFBTSxJQUFJLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUM3QyxRQUFBLE1BQU0sRUFBRSxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFekMsT0FBTztBQUNMLFlBQUEsSUFBSSxFQUFFO0FBQ0osZ0JBQUEsSUFBSSxFQUFFLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQztBQUNyQixnQkFBQSxFQUFFLEVBQUUsS0FBSyxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSTtBQUMzQixhQUFBO0FBQ0QsWUFBQSxFQUFFLEVBQUU7QUFDRixnQkFBQSxJQUFJLEVBQUUsRUFBRSxDQUFDLE1BQU0sR0FBRyxDQUFDO0FBQ25CLGdCQUFBLEVBQUUsRUFBRSxLQUFLLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJO0FBQ3ZCLGFBQUE7U0FDRixDQUFDO0tBQ0g7QUFFTSxJQUFBLE9BQU8sQ0FBQyxNQUFjLEVBQUE7UUFDM0IsSUFBSSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsdUJBQXVCLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztLQUMzRDtJQUVNLE1BQU0sQ0FBQyxNQUFjLEVBQUUsSUFBWSxFQUFBO0FBQ3hDLFFBQUEsTUFBTSxFQUFFLEdBQUcsdUJBQXVCLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDM0MsUUFBQSxNQUFNLEdBQUcsR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztRQUM3QyxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxFQUFFLEVBQUUsR0FBRyxDQUFDLENBQUM7S0FDbEM7QUFFTSxJQUFBLFdBQVcsQ0FBQyxNQUFjLEVBQUE7UUFDL0IsSUFBSSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsdUJBQXVCLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztLQUMvRDtBQUNGOzs7OyIsInhfZ29vZ2xlX2lnbm9yZUxpc3QiOlswXX0=
