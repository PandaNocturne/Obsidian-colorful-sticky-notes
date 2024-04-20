module.exports = {
  entry: async (QuickAdd, settings, params) => {
    const activefile = app.workspace.getActiveFile();
    const yaml = settings["Properties"];

    await app.fileManager.processFrontMatter(activefile, fm => {
      if (fm[yaml]) fm[yaml] = "";
      fm[yaml] = moment().format(settings["Format"]);
    });

  },
  settings: {
    name: "更新编辑时间",
    author: "熊猫别熬夜",
    options: {
      "Properties": {
        type: "text",
        defaultValue: "modified",
      },
      "Format": {
        type: "text",
        defaultValue: "YYYY-MM-DD HH:mm:ss Z",
      },
    }
  }
};

