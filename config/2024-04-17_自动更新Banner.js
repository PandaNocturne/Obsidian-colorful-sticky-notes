module.exports = {
  entry: async (QuickAdd, settings, params) => {
    // 获取当前活动文件和缓存的元数据
    const file = app.workspace.getActiveFile();
    const cachedMetadata = app.metadataCache.getFileCache(file);

    // 提取嵌入的图片或gif
    let embedImgs = [];
    if (cachedMetadata?.embeds) {
      embedImgs = cachedMetadata.embeds.map(e => e.link).filter(l => /\.(png|gif|jpe?g)$/.test(l));
    }
    if (embedImgs.length < 1) {
      embedImgs = [settings["默认图片"]];
    }

    // 设置显示第几个图片，如果不存在则会自动选择第1张图片
    let num = parseInt(settings["显示第几张图片"], 10) || 1;
    if (num > embedImgs.length) {
      num = 1;
    }

    // 插入banner属性
    const banner = settings["图片属性"] ? settings["图片属性"] : "banner";
    await app.fileManager.processFrontMatter(file, fm => {

      // 如果不存在banner属性，则插入，如果不是特别需要的话，可以注释这段
      if (!fm[banner]) {
        fm[banner] = "";
        fm[banner] = `[[${embedImgs[num - 1]}]]`;
        new Notice(`自动插入Banner：🖼${embedImgs[num - 1]}`);
        return;
      }

      if (settings["是否强制更新"] && (fm[banner] !== `[[${embedImgs[num - 1]}]]`)) {
        fm[banner] = `[[${embedImgs[num - 1]}]]`;
        new Notice(`更新Banner：🖼${embedImgs[num - 1]}`);
        return;
      }
    });
  },
  settings: {
    name: "自动更新Banner",
    author: "熊猫别熬夜",
    options: {
      "图片属性": {
        type: "text",
        defaultValue: "banner",
      },
      "是否强制更新": {
        type: "toggle",
        defaultValue: true,
        description: "如果文档的第一张图片更改了，该选项会强制刷新"
      },
      "显示第几张图片": {
        type: "text",
        defaultValue: "1",
        description: "设置显示第几个图片，如果不存在则会自动选择第1张图片"
      },
      "默认图片": {
        type: "text",
        defaultValue: "DailyNote.png",
        description: "如果提取不到对应图片，则自动插入默认图片"
      }
    }
  }
};
