module.exports = async (params) => {
  // 获取激活窗口的位置和大小
  var activeWindowLeft = activeWindow.screenX;
  var activeWindowTop = activeWindow.screenY;
  var activeWindowWidth = activeWindow.outerWidth;
  var activeWindowHeight = activeWindow.outerHeight;

  // 计算新窗口的位置和大小
  var newWindowLeft = activeWindowLeft + activeWindowWidth + 5; // 在激活窗口右侧偏移10像素
  var newWindowTop = activeWindowTop;
  // var newWindowWidth = 400; // 设置新窗口的宽度为400像素
  // var newWindowHeight = 450; // 设置新窗口的高度为450像素

  // 在新窗口打开一个当前文档
  // app.commands.executeCommandById("workspace:open-in-new-window"); 
  app.commands.executeCommandById("workspace:move-to-new-window");   
  // 暂停100ms
  await new Promise(resolve => setTimeout(resolve, 5));

  // 设置窗口的位置和大小
  activeWindow.resizeTo(activeWindowWidth, activeWindowHeight); // 调整窗口大小为宽度，高度
  activeWindow.moveTo(newWindowLeft, newWindowTop);
};

