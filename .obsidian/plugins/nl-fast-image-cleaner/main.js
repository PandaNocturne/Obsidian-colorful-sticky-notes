/*
THIS IS A GENERATED/BUNDLED FILE BY ESBUILD
if you want to view the source, please visit the github repository of this plugin
*/

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __accessCheck = (obj, member, msg) => {
  if (!member.has(obj))
    throw TypeError("Cannot " + msg);
};
var __privateGet = (obj, member, getter) => {
  __accessCheck(obj, member, "read from private field");
  return getter ? getter.call(obj) : member.get(obj);
};
var __privateAdd = (obj, member, value) => {
  if (member.has(obj))
    throw TypeError("Cannot add the same private member more than once");
  member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
};
var __privateSet = (obj, member, value, setter) => {
  __accessCheck(obj, member, "write to private field");
  setter ? setter.call(obj, value) : member.set(obj, value);
  return value;
};
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => NathanImageCleaner
});
module.exports = __toCommonJS(main_exports);
var import_obsidian6 = require("obsidian");

// src/config/addCommand-config.ts
var addCommand = (myPlugin) => {
};

// src/settings.ts
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  deleteOption: ".trash",
  logsModal: true
};
var NathanImageCleanerSettingsTab = class extends import_obsidian.PluginSettingTab {
  constructor(app2, plugin) {
    super(app2, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Fast Attachment Cleaner Settings" });
    new import_obsidian.Setting(containerEl).setName("Deleted Attachment Destination").setDesc("Select where you want Attachments to be moved once they are deleted").addDropdown((dropdown) => {
      dropdown.addOption("permanent", "Delete Permanently");
      dropdown.addOption(".trash", "Move to Obsidian Trash");
      dropdown.addOption("system-trash", "Move to System Trash");
      dropdown.setValue(this.plugin.settings.deleteOption);
      dropdown.onChange((option) => {
        this.plugin.settings.deleteOption = option;
        this.plugin.saveSettings();
      });
    });
  }
};

// src/utils/util.ts
var import_obsidian3 = require("obsidian");

// src/modals.ts
var import_obsidian2 = require("obsidian");

// src/utils/fileContentsProcess.ts
var _processFunc, _delay;
var fileContentsProcess = class {
  constructor(callback, delay = 1e3) {
    __privateAdd(this, _processFunc, void 0);
    __privateAdd(this, _delay, 1e3);
    __privateSet(this, _processFunc, callback);
    __privateSet(this, _delay, delay);
  }
  process(params, plugin) {
    return __async(this, null, function* () {
      const activeFile = app.workspace.getActiveFile();
      const fileContents = (yield app.vault.read(activeFile)).split("\n");
      let newFileContents = [];
      newFileContents = __privateGet(this, _processFunc).call(this, fileContents, plugin, params);
      app.vault.adapter.write(activeFile.path, newFileContents.join("\n"));
      setTimeout(() => {
        return "OK";
      }, __privateGet(this, _delay));
    });
  }
};
_processFunc = new WeakMap();
_delay = new WeakMap();

// src/utils/removeReferenceLink.ts
var removeReferenceLink = new fileContentsProcess((lines, plugin, params) => {
  var _a, _b;
  let imgPath = params == null ? void 0 : params.imgPath;
  const MDLinkRegex = new RegExp("!\\[.*?\\]\\((?<imgLinkPath>.*?)\\)", "g");
  const WIKILinkRegex = new RegExp("!\\[\\[(?<imgLinkPath>[^\\|\\n\\[\\]]+)?.*?\\]\\]", "g");
  for (const i in lines) {
    if (lines[i].match(MDLinkRegex)) {
      const allMatches = [...lines[i].matchAll(MDLinkRegex)];
      for (const match of allMatches) {
        let imgLinkPath = (_a = match.groups) == null ? void 0 : _a.imgLinkPath;
        imgLinkPath = imgLinkPath.replace(/%20/g, " ");
        if (imgLinkPath === imgPath) {
          const targetRegex = new RegExp(`!\\[[^!\\[\\]
]*?\\]\\(${escapeRegex(imgPath.replace(/ /g, "%20"))}\\)`, "g");
          const replaced = lines[i].replace(targetRegex, "");
          lines[i] = replaced;
        }
      }
    } else if (lines[i].match(WIKILinkRegex)) {
      const allMatches = [...lines[i].matchAll(WIKILinkRegex)];
      for (const match of allMatches) {
        let imgLinkPath = (_b = match.groups) == null ? void 0 : _b.imgLinkPath;
        imgLinkPath = imgLinkPath.trim();
        if (imgLinkPath === imgPath) {
          const replaced = lines[i].replace(new RegExp(`!\\[\\[(?<imgLinkPath>${escapeRegex(imgPath)}).*?\\]\\]`, "g"), "");
          lines[i] = replaced;
        }
      }
    }
  }
  return lines;
});

// src/modals.ts
var LogsModal = class extends import_obsidian2.Modal {
  constructor(currentMd, state, imgPath, textToView, app2) {
    super(app2);
    this.textToView = textToView;
    this.currentMd = currentMd;
    this.state = state;
    this.imgPath = imgPath;
  }
  getLog() {
    const CurFirstMd = this.textToView.shift();
    const curMdLog = "The md document that currently references the attachment: \n" + CurFirstMd + "\n\n";
    let otherMds = this.textToView.join("\n");
    const otherMdsLog = "List of all documents that reference this attachment: \n" + otherMds;
    const log = curMdLog + otherMdsLog;
    return log;
  }
  onOpen() {
    const { contentEl } = this;
    const myModal = this;
    const headerWrapper = contentEl.createEl("div");
    headerWrapper.addClass("fast-image-cleaner-center-wrapper");
    const headerEl = headerWrapper.createEl("h1", {
      text: " Detection of multiple attachment reference links - logs "
    });
    headerEl.addClass("modal-title");
    if (this.state === 1)
      this.showLogs();
    const buttonWrapper = this.contentEl.createEl("div");
    buttonWrapper.addClass("fast-image-cleaner-center-wrapper");
    if (this.state === 1) {
      this.showCloseBtn(buttonWrapper, this);
      this.showRemoveLinkBtn(buttonWrapper, this);
    }
    if (this.state === 2) {
      this.showPrompt(this);
    }
  }
  showLogs() {
    const logs = this.contentEl.createEl("div");
    logs.addClass("fast-image-cleaner-log");
    logs.setText(this.getLog());
  }
  showCloseBtn(buttonWrapper, myModal) {
    const closeButton = buttonWrapper.createEl("button", {
      text: "close"
    });
    closeButton.setAttribute("aria-label", "close the window");
    closeButton.addEventListener("click", () => {
      myModal.close();
    });
  }
  showRemoveLinkBtn(buttonWrapper, myModal) {
    const removeLinkButton = buttonWrapper.createEl("button", {
      text: "remove link"
    });
    removeLinkButton.setAttribute("aria-label", "Continue to remove the reference link to the current attachment in the current document");
    removeLinkButton.addClass("mod-warning");
    removeLinkButton.addEventListener("click", () => __async(this, null, function* () {
      yield removeReferenceLink.process({ imgPath: this.imgPath });
      myModal.close();
    }));
  }
  showPrompt(myModal) {
    const prompt = this.contentEl.createEl("span", {
      text: "Detected that the image you are attempting to delete is being referenced multiple times within the current document. \n As a result. We kindly ask that you manually remove the link."
    });
    prompt.addClass("fast-image-cleaner-prompt");
    const buttonWrapper = this.contentEl.createEl("div");
    const closeButton = buttonWrapper.createEl("button", {
      text: "close"
    });
    closeButton.setAttribute("aria-label", "close the window");
    closeButton.addEventListener("click", () => {
      myModal.close();
    });
  }
};

// src/utils/util.ts
var SUCCESS_NOTICE_TIMEOUT = 1800;
var determineRemove = (imgPath) => {
  const currentMd = app.workspace.getActiveFile();
  const resolvedLinks = app.metadataCache.resolvedLinks;
  const deletedTargetFile = getFileByBaseName(currentMd, imgPath);
  let CurMDPath;
  let result = {
    state: 0,
    mdPath: []
  };
  let refNum = 0;
  for (const [mdFile, links] of Object.entries(resolvedLinks)) {
    if (currentMd.path === mdFile) {
      CurMDPath = currentMd.path;
      result.mdPath.unshift(CurMDPath);
    }
    for (const [filePath, nr] of Object.entries(links)) {
      if ((deletedTargetFile == null ? void 0 : deletedTargetFile.path) === filePath) {
        refNum++;
        if (nr > 1) {
          result.state = 2 /* MORE */;
          result.mdPath.push(mdFile);
          return result;
        }
        result.mdPath.push(mdFile);
      }
    }
  }
  if (refNum > 1) {
    result.state = 1 /* MUTIPLE */;
  } else {
    result.state = 0 /* ONCE */;
  }
  return result;
};
var getFileByBaseName = (currentMd, imgPath) => {
  var _a, _b;
  const resolvedLinks = app.metadataCache.resolvedLinks;
  let imgBaseName = (_b = (_a = imgPath.match(new RegExp("(?<=\\/?)(?<imgBasename>[^\\n\\/]*)$", "m"))) == null ? void 0 : _a.groups) == null ? void 0 : _b.imgBasename;
  for (const [mdFile, links] of Object.entries(resolvedLinks)) {
    if (currentMd.path === mdFile) {
      for (const [filePath, nr] of Object.entries(links)) {
        if (filePath.includes(imgBaseName)) {
          try {
            const AttachFile = app.vault.getAbstractFileByPath(filePath);
            if (AttachFile instanceof import_obsidian3.TFile) {
              return AttachFile;
            }
          } catch (error) {
            new import_obsidian3.Notice(` cannot get the image file`);
            console.error(error);
          }
        }
      }
    }
  }
};
var ClearAttachment = (imgPath, plugin) => __async(void 0, null, function* () {
  const deleteOption = plugin.settings.deleteOption;
  const currentMd = app.workspace.getActiveFile();
  const file = getFileByBaseName(currentMd, imgPath);
  yield removeReferenceLink.process({ imgPath });
  const delFileFolder = onlyOneFileExists(file);
  const fileFolder = getFileParentFolder(file);
  try {
    if (deleteOption === ".trash") {
      yield app.vault.trash(file, false);
      new import_obsidian3.Notice("Image moved to Obsidian Trash !", SUCCESS_NOTICE_TIMEOUT);
      if (delFileFolder) {
        deleteFile(getTopFolderOnlyOneChild(fileFolder), plugin);
      }
    } else if (deleteOption === "system-trash") {
      yield app.vault.trash(file, true);
      new import_obsidian3.Notice("Image moved to System Trash !", SUCCESS_NOTICE_TIMEOUT);
      if (delFileFolder) {
        deleteFile(getTopFolderOnlyOneChild(fileFolder), plugin);
      }
    } else if (deleteOption === "permanent") {
      yield app.vault.delete(file);
      new import_obsidian3.Notice("Image deleted Permanently !", SUCCESS_NOTICE_TIMEOUT);
      if (delFileFolder) {
        deleteFile(getTopFolderOnlyOneChild(fileFolder), plugin);
      }
    }
    if (delFileFolder) {
      new import_obsidian3.Notice("Attachment folder has been deleted!", 3e3);
    }
  } catch (error) {
    console.error(error);
    new import_obsidian3.Notice("Faild to delelte the image !", SUCCESS_NOTICE_TIMEOUT);
  }
});
var handlerDelFile = (imgPath, currentMd, plugin) => {
  let logs;
  let modal;
  const state = determineRemove(imgPath).state;
  switch (state) {
    case 0:
      ClearAttachment(imgPath, plugin);
      break;
    case 1:
    case 2:
      logs = determineRemove(imgPath).mdPath;
      modal = new LogsModal(currentMd, state, imgPath, logs, app);
      modal.open();
    default:
      break;
  }
};
var getFileParentFolder = (file) => {
  if (file instanceof import_obsidian3.TFile) {
    if (file.parent instanceof import_obsidian3.TFolder) {
      return file.parent;
    }
  }
  return;
};
var onlyOneFileExists = (file) => {
  const fileFolder = getFileParentFolder(file);
  return fileFolder.children.length === 1;
};
var escapeRegex = (str) => {
  return str.replace(/[/\-\\^$*+?.()|[\]{}]/g, "\\$&");
};
var getTopFolderOnlyOneChild = (folder) => {
  const parentFolder = folder.parent;
  if (parentFolder instanceof import_obsidian3.TFolder && parentFolder.children.length === 1) {
    return getTopFolderOnlyOneChild(parentFolder);
  }
  return folder;
};
var deleteFile = (file, plugin) => __async(void 0, null, function* () {
  const deleteOption = plugin.settings.deleteOption;
  try {
    if (deleteOption === ".trash") {
      yield app.vault.trash(file, false);
    } else if (deleteOption === "system-trash") {
      yield app.vault.trash(file, true);
    } else if (deleteOption === "permanent") {
      yield app.vault.delete(file);
    }
  } catch (error) {
    console.error(error);
    new import_obsidian3.Notice("Failed to delete the file/folder !", SUCCESS_NOTICE_TIMEOUT);
  }
});

// src/modals/deletionPrompt.ts
var import_obsidian5 = require("obsidian");

// src/utils/deleleAllAttachsInTheNote.ts
var import_obsidian4 = require("obsidian");
var deleteAllAttachs = (plugin) => __async(void 0, null, function* () {
  const activeMd = app.workspace.getActiveFile();
  const resolvedLinks = app.metadataCache.resolvedLinks;
  const attachInfoArr = [];
  for (const [mdFile, links] of Object.entries(resolvedLinks)) {
    if ((activeMd == null ? void 0 : activeMd.path) !== mdFile)
      continue;
    if (Object.keys(links).length == 0)
      break;
    for (const [filePath, nr] of Object.entries(links)) {
      if (filePath.match(/.*\.md$/m))
        continue;
      if (isReferencedByOtherNotes(filePath, activeMd))
        continue;
      try {
        const AttachFile = app.vault.getAbstractFileByPath(filePath);
        const parentFolder = getFileParentFolder(AttachFile);
        if (!(AttachFile instanceof import_obsidian4.TFile))
          continue;
        if (attachInfoArr.length !== 0 && attachInfoArr.some((item) => item.folder === parentFolder)) {
          for (let i = 0; i < attachInfoArr.length; i++) {
            const element = attachInfoArr[i];
            if (element.folder === parentFolder) {
              attachInfoArr[i].attachCount += 1;
              attachInfoArr[i].attachFiles.push(AttachFile);
            }
          }
        } else {
          attachInfoArr.push({
            folder: parentFolder,
            initialLength: parentFolder.children.length,
            attachCount: 1,
            attachFiles: [AttachFile]
          });
        }
      } catch (error) {
        console.warn(error);
      }
    }
  }
  const shouldDeleteAllAttachsAndFolder = attachInfoArr.every((item) => item.initialLength === item.attachCount);
  if (shouldDeleteAllAttachsAndFolder) {
    for (const item of attachInfoArr) {
      const deletedFolder = getTopFolderOnlyOneChild(item.folder);
      yield deleteFile(deletedFolder, plugin);
    }
  } else {
    const deletedFolders = attachInfoArr.filter((item) => item.initialLength === item.attachCount);
    const deletedAttachs = attachInfoArr.filter((item) => item.initialLength !== item.attachCount);
    if (deletedFolders.length > 0) {
      for (const item of deletedFolders) {
        const deletedFolder = getTopFolderOnlyOneChild(item.folder);
        yield deleteFile(deletedFolder, plugin);
      }
    }
    for (const item of deletedAttachs) {
      for (const attachFile of item.attachFiles) {
        yield deleteFile(attachFile, plugin);
      }
    }
  }
  new import_obsidian4.Notice("All attachments and its parent folder have been deleted!", 3e3);
});
var isReferencedByOtherNotes = (attachPath, currentMd) => {
  const resolvedLinks = app.metadataCache.resolvedLinks;
  let flag = false;
  for (const [mdFile, links] of Object.entries(resolvedLinks)) {
    if (mdFile !== currentMd.path) {
      for (const [filePath, nr] of Object.entries(links)) {
        if (filePath === attachPath) {
          flag = true;
        }
      }
    }
  }
  return flag;
};
var getRefencedLinkCount = () => {
  const activeMd = app.workspace.getActiveFile();
  const resolvedLinks = app.metadataCache.resolvedLinks;
  let count = 0;
  for (const [mdFile, links] of Object.entries(resolvedLinks)) {
    if ((activeMd == null ? void 0 : activeMd.path) !== mdFile)
      continue;
    if (Object.keys(links).length == 0)
      break;
    for (const [filePath, nr] of Object.entries(links)) {
      if (filePath.match(/.*\.md$/m))
        continue;
      if (isReferencedByOtherNotes(filePath, activeMd))
        continue;
      count++;
    }
  }
  return count;
};

// src/modals/deletionPrompt.ts
var DeleteAllLogsModal = class extends import_obsidian5.Modal {
  constructor(note, myPlugin) {
    super(app);
    this.note = note;
    this.myPlugin = myPlugin;
  }
  getLog() {
    const referenceMessage = `Are you sure you want to delete "${this.note.basename}.md"?

It will be moved to your ${this.myPlugin.settings.deleteOption}.`;
    return referenceMessage;
  }
  showLogs() {
    const logs = this.contentEl.createEl("div");
    logs.addClass("fast-image-cleaner-log");
    logs.setText(this.getLog());
  }
  onOpen() {
    const { contentEl } = this;
    const myModal = this;
    const headerWrapper = contentEl.createEl("div");
    headerWrapper.addClass("fast-image-cleaner-center-wrapper");
    this.showLogs();
    const referencedMessageWrapper = contentEl.createEl("span");
    referencedMessageWrapper.style.color = "red";
    const referencedMessage = `There are(is) currently  [${getRefencedLinkCount()}]  non-multi-referenced link(s) pointing to this note.`;
    referencedMessageWrapper.append(referencedMessage);
    const buttonWrapper = this.contentEl.createEl("div");
    buttonWrapper.addClass("fast-image-cleaner-center-wrapper");
    const headerEl = headerWrapper.createEl("h1", {
      text: "Delete the file and its all attachments - logs "
    });
    headerEl.addClass("modal-title");
    this.showConfirmButton(buttonWrapper, myModal);
    this.showCancelBtn(buttonWrapper, myModal);
  }
  showCancelBtn(buttonWrapper, myModal) {
    const closeButton = buttonWrapper.createEl("button", {
      text: "Cancel"
    });
    closeButton.setAttribute("aria-label", "Cancel the operation");
    closeButton.addEventListener("click", () => {
      myModal.close();
    });
  }
  showConfirmButton(buttonWrapper, myModal) {
    const removeLinkButton = buttonWrapper.createEl("button", {
      text: "Confirm"
    });
    removeLinkButton.setAttribute("aria-label", "Continue to delete current file and its all non-multi-referenced attachments");
    removeLinkButton.addClass("mod-warning");
    removeLinkButton.addEventListener("click", () => __async(this, null, function* () {
      deleteFile(this.note, this.myPlugin);
      deleteAllAttachs(this.myPlugin);
      myModal.close();
    }));
  }
};

// src/main.ts
var NathanImageCleaner = class extends import_obsidian6.Plugin {
  constructor() {
    super(...arguments);
    this.addMenu = (menu, imgPath, currentMd) => {
      menu.addItem((item) => item.setIcon("trash-2").setTitle("clear file and referenced link").onClick(() => __async(this, null, function* () {
        try {
          handlerDelFile(imgPath, currentMd, this);
        } catch (e) {
          new import_obsidian6.Notice("Error, could not clear the file!");
        }
      })));
    };
  }
  onload() {
    return __async(this, null, function* () {
      console.log("Fast file Cleaner plugin loaded...");
      this.addSettingTab(new NathanImageCleanerSettingsTab(this.app, this));
      yield this.loadSettings();
      this.registerDocument(document);
      app.workspace.on("window-open", (workspaceWindow, window) => {
        this.registerDocument(window.document);
      });
      this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof import_obsidian6.TFile) {
          const addMenuItem = (item) => {
            item.setTitle("Delete the file and its all attachments").setIcon("trash-2").setSection("danger");
            item.onClick(() => __async(this, null, function* () {
              const modal = new DeleteAllLogsModal(file, this);
              modal.open();
            }));
          };
          menu.addItem(addMenuItem);
        }
      }));
      addCommand(this);
    });
  }
  onunload() {
    console.log("Fast file Cleaner plugin unloaded...");
  }
  onElement(el, event, selector, listener, options) {
    el.on(event, selector, listener, options);
    return () => el.off(event, selector, listener, options);
  }
  registerDocument(document2) {
    this.register(this.onElement(document2, "contextmenu", "img, iframe, video, div.file-embed-title,audio", this.onClick.bind(this)));
  }
  loadSettings() {
    return __async(this, null, function* () {
      this.settings = Object.assign({}, DEFAULT_SETTINGS, yield this.loadData());
    });
  }
  saveSettings() {
    return __async(this, null, function* () {
      yield this.saveData(this.settings);
    });
  }
  registerEscapeButton(menu, document2 = activeDocument) {
    menu.register(this.onElement(document2, "keydown", "*", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        menu.hide();
      }
    }));
  }
  onClick(event) {
    var _a;
    event.preventDefault();
    const target = event.target;
    const nodeType = target.localName;
    const currentMd = app.workspace.getActiveFile();
    const menu = new import_obsidian6.Menu();
    let imgPath = "";
    const delTargetType = ["img", "iframe", "video", "div", "audio"];
    if (delTargetType.includes(nodeType)) {
      imgPath = (_a = target.parentElement) == null ? void 0 : _a.getAttribute("src");
      this.addMenu(menu, imgPath, currentMd);
    }
    this.registerEscapeButton(menu);
    menu.showAtPosition({ x: event.pageX, y: event.pageY - 40 });
    this.app.workspace.trigger("NL-fast-file-cleaner:contextmenu", menu);
  }
};
