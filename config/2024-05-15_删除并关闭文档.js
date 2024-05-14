module.exports = async (params) => {
  const file = app.workspace.getActiveFile();
  const quickAddApi = app.plugins.plugins.quickadd.api;
  const option = await quickAddApi.yesNoPrompt("是否删除当前文档", file.path);
  if (!option) return;

  await app.vault.trash(app.vault.getAbstractFileByPath(file.path));
  // 删除后关闭当前标签页
  app.commands.executeCommandById("workspace:close");
};
