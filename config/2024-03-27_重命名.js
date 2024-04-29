/*
 * @Author: 熊猫别熬夜 
 * @Date: 2024-03-27 11:51:21 
 * @Last Modified by: 熊猫别熬夜
 * @Last Modified time: 2024-04-23 17:27:14
 */
const path = require('path');
const quickAddApi = app.plugins.plugins.quickadd.api;
module.exports = async (params) => {
  let file = app.workspace.getActiveFile();
  try {
    const editor = app.workspace.activeEditor.editor;
    // 选择所在的一行
    const line = editor.getLine(editor.getCursor().line);
    // 获取选中的文本否则自动获取当前行的文本
    const selection = editor.getSelection() ? editor.getSelection() : line;
    // !如果为标题
    const regex = /^(#+)\s(.*)/;
    const matches = selection.match(regex);
    if (matches) {
      // 重命名小标题
      app.commands.executeCommandById('editor:rename-heading');
      return;
    }

    // !如果为wiki链接
    let selectionEmbed = matchSelectionEmbed(selection);
    if (selectionEmbed) {
      console.log(selectionEmbed);
      const files = app.vault.getFiles();
      // Wiki: 获取库所有文件列表
      const wikiPath = getFilePath(files, selectionEmbed); // 匹配Wiki链接
      console.log(wikiPath);
      if (!wikiPath) {
        return;
      };
      // !2024-03-30_14:14：添加excalidraw.md文件
      let newName = "";
      if (wikiPath.endsWith('.excalidraw.md')) {
        newName = await quickAddApi.inputPrompt(`🗳重命名嵌入的Excalidraw文件`, null, path.basename(wikiPath).replace(".excalidraw.md", ""), "");
        if (!newName) return;
        newName = newName + ".excalidraw";
      } else {
        newName = await quickAddApi.inputPrompt(`🗳重命名嵌入的${path.extname(wikiPath)}文件`, null, path.basename(wikiPath).replace(path.extname(wikiPath), ""), "");
      }
      if (!newName) return;
      // 2024-04-23_17:16:53 优化一下，合并多余空格
      newName = newName.replace(/\s+/g, " ");
      await app.fileManager.renameFile(app.vault.getAbstractFileByPath(wikiPath), `${path.dirname(wikiPath)}/${newName}${path.extname(wikiPath)}`);
      return;
    };
  } catch (error) {
    // 如果报错则跳过
    console.log(error);
  }
  // !最终重命名文件
  let newName = "";
  if (String(file.basename).endsWith('.excalidraw')) {
    newName = await quickAddApi.inputPrompt(`🎨重命名Excalidraw文件`, null, String(file.basename).replace(".excalidraw", ""), "");
    if (!newName) return;
    newName = newName + ".excalidraw";
  } else {
    newName = await quickAddApi.inputPrompt('📄重命名当前文档', null, String(file.basename));
    if (!newName) return;
  }
  // 2024-04-23_17:16:53 优化一下，合并多余空格
  newName = newName.replace(/\s+/g, " ");
  await app.fileManager.renameFile(file, `${file.parent.path}/${newName}.${file.extension}`);
  return;
};
function matchSelectionEmbed(text) {
  const regex = /\[\[?([^\]]*?)(\|.*)?\]\]?\(?([^)\n]*)\)?/;
  const matches = text.match(regex);
  if (!matches) return;
  if (matches[3]) return decodeURIComponent(matches[3]);
  if (matches[1]) return decodeURIComponent(matches[1]);
}

function getFilePath(files, baseName) {
  let files2 = files.filter(f => path.basename(f.path).replace(".md", "") === path.basename(baseName).replace(".md", ""));
  let filePath = files2.map((f) => f.path);
  return filePath[0];
}