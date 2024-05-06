module.exports = {
  entry: async (QuickAdd, settings, params) => {
    let modalForm;
    try {
      modalForm = app.plugins.plugins.modalforms.api;
    } catch {
      new Notice("🔴本脚本需要Modal Form插件，请先安装或启动Modal Form插件！");
      return;
    }
    let type = true;
    let taskContent = ""; let tags = "";
    let startStr = "";
    let reminderDate = ""; let reminderTime = "";
    let createdDate = ""; let createdTime = ""; let createdTime2 = "";
    // 记录时间差
    let hours = 0; let minutes = 0;

    let due = "";
    let priority = "";
    let recurs = "";
    let status = "";
    // !获取当前编辑器
    let editor;
    try {
      editor = app.workspace.activeEditor.editor;
      // 选择所在的一行
      const line = editor.getLine(editor.getCursor().line);
      let selection = line ? line.replace(/<br>/gm,"\n") : "- [ ] ";
      console.log(selection);
      // 切换列表为复选框
      if (selection.match(/(^[\t\s]*-\s)(?!\[)/)) {
        selection = selection.replace(/(^[\t\s]*-\s)(?!\[)/, "$1[ ] ");
        type = false;
      }
      // !提取任务信息
      let regex = /(^[\t\s-]+-?)\s\[(.)\]\s(\d{2}:\d{2})?(\s-\s(\d{2}:\d{2})?)?([^🔽🔼⏬⏫🔁➕📅⏰⏳🛫✅]*)/;
      let matches = selection.match(regex);
      if (matches) {
        startStr = matches[1] ? matches[1] : "";
        status = matches[2] ? matches[2] : "";
        taskContent = matches[6] ? matches[6] : "";
        tags = taskContent.match(/\s(#\S+)/gm);
        console.log(`标签: ${tags}`);
        // 移除任务内容中的标签
        taskContent = taskContent.replace(/\s#[^\s]+/gm, "").trim();
      }

      // !提取优先级
      let priorityRegex = /(🔽|🔼|⏬|⏫|🔺)/;
      let priorityMatches = selection.match(priorityRegex);
      priority = priorityMatches ? priorityMatches[1] : "";

      // !提取重复周期🔁
      let recursRegex = /(🔁\severy)\s(\d+)?\s?(day|week)(\son\s\w+)?/;
      let recursMatches = selection.match(recursRegex);
      recurs = recursMatches ? (recursMatches[1] + " " + (recursMatches[3] + (recursMatches[4] !== undefined ? recursMatches[4] : ""))) : "";
      console.log(recurs);


      // !提取任务创建日期和时间➕
      let createRegex = /🛫\s(\d{4}-\d{2}-\d{2})\s(\d{2}:\d{2})?/;
      let createMatches = selection.match(createRegex);

      if (createMatches) {
        createdDate = createMatches[1] ? createMatches[1] : "";
        // createdTime = createMatches[2] ? createMatches[2] : "";
      }
      if (settings["AutoCreatedDate"]) {
        createdDate = createdDate ? createdDate : window.moment().format("YYYY-MM-DD");
      }

      // !2024-04-30_10:58 具体创建时间放到列表前面，适配其他时间线插件(Day Planer (OG)(✨) 和 Day Planer)
      // Day Planer (OG)可能更容易上手点，Day Planner 稍微复杂，流程比较多，可能需要多测试
      let createdTimeRegex = /\]\s(\d{2}:\d{2})?(\s-\s(\d{2}:\d{2}))?/;

      let createdTimeMatches = selection.match(createdTimeRegex);
      if (createdTimeMatches) {
        createdTime = createdTimeMatches[1] ? createdTimeMatches[1] : "";
        createdTime2 = createdTimeMatches[3] ? createdTimeMatches[3] : "";
        console.log([createdTime, createdTime2]);

        // 使用window.moment()计算createdTime2 - createdTime的时间差
        const timeFormat = 'HH:mm';

        const startTime = window.moment(createdTime, timeFormat);
        const endTime = window.moment(createdTime2, timeFormat);

        const duration = window.moment.duration(endTime.diff(startTime));
        hours = Math.floor(duration.asHours());
        minutes = Math.round(duration.asMinutes() % 60);

        const timeDiff = `${hours}小时${minutes}分钟`;
        console.log(timeDiff);
      }
      if (settings["AutoTime"]) {
        createdTime = createdTime ? createdTime : window.moment().format("HH:mm");
      }

      // !提取提醒日期和时间⏰
      let startRegex = /⏰\s(\d{4}-\d{2}-\d{2})\s(\d{2}:\d{2})?/;
      let startMatches = selection.match(startRegex);
      if (startMatches) {
        reminderDate = startMatches[1] ? startMatches[1] : "";
        reminderTime = startMatches[2] ? startMatches[2] : "";
      }
      reminderTime = reminderTime ? reminderTime : window.moment().format("HH:mm");

      // !提取deadline📅
      let dueRegex = /📅\s(\d{4}-\d{2}-\d{2})/;
      let dueMatches = selection.match(dueRegex);
      due = dueMatches ? dueMatches[1] : "";

    } catch (e) {
      new Notice(`🔴无法获取选中的文本，请选重试！\nBug: \n${e}`);
      return;
    }

    // ! Bug：下拉选项无法设置默认值
    // !Fix: This helper returns a new list with the defValue item always being the first item.
    // !ref: https://github.com/danielo515/obsidian-modal-form/issues/227
    const moveDefaultToTop = (defValue, list) => {
      const orderedList = [...list];
      const index = orderedList.findIndex(item => item.value === defValue);
      if (index > 0) {
        const [item] = orderedList.splice(index, 1);
        orderedList.unshift(item);
      }
      return orderedList;
    };

    const recursOptions = [
      {
        "value": "",
        "label": "none"
      },
      {
        "value": "🔁 every day",
        "label": "每天"
      },
      {
        "value": "🔁 every week on Monday",
        "label": "星期一"
      },
      {
        "value": "🔁 every week on Tuesday",
        "label": "星期二"
      },
      {
        "value": "🔁 every week on Wednesday",
        "label": "星期三"
      },
      {
        "value": "🔁 every week on Thursday",
        "label": "星期四"
      },
      {
        "value": "🔁 every week on Friday",
        "label": "星期五"
      },
      {
        "value": "🔁 every week on Saturday",
        "label": "星期六"
      },
      {
        "value": "🔁 every week on Sunday",
        "label": "星期天"
      },
    ];

    const priorityOptions = [
      {
        "value": "",
        "label": "none"
      },
      {
        "value": "⏫",
        "label": "🔴重要且紧急⏫"
      },
      {
        "value": "🔼",
        "label": "🟠不重要但紧急🔼"
      },
      {
        "value": "🔽",
        "label": "🟡重要但不紧急🔽"
      },
      {
        "value": "⏬",
        "label": "🟢不重要且不紧急⏬"
      },
      {
        "value": "🔺",
        "label": "❗非常紧急且重要🔺"
      },
    ];

    let statusOptions = [
      {
        "value": " ",
        "label": "🔳ToDo"
      },
      {
        "value": "!",
        "label": "⚠Important"
      },
      {
        "value": "?",
        "label": "❓Question"
      },
      {
        "value": "/",
        "label": "⏳Doing"
      },
      {
        "value": "x",
        "label": "✅Done"
      },
      {
        "value": "-",
        "label": "❌Cancel"
      },
    ];
    const index = statusOptions.findIndex(item => item.value === status);
    if (index < 0) {
      statusOptions.push({
        "value": status,
        "label": `Unknown(${status})`
      });
    }

    // Modal Form Task表单
    const editorForm1 = {
      "title": "Creat or Edit Task",
      "name": "creat-or-edit-task",
      "fields": [
        {
          "name": "taskContent",
          "label": "Task Content",
          "description": "",
          "isRequired": true,
          "input": {
            "type": "textarea"
          }
        },
        // 设定s开始日期加时间
        {
          "name": "reminderDate",
          "label": "⏰",
          "description": "",
          "input": {
            "type": "date"
          }
        },
        {
          "name": "reminderTime",
          "label": "⏱",
          "description": "",
          "input": {
            "type": "time"
          }
        },
        // 设定deadline
        {
          "name": "due",
          "label": "📅",
          "description": "",
          "input": {
            "type": "date"
          }
        },
        // 重复周期，注意如果设定每2周，请手动添加罗马数字(2、3...)，应该用不到吧......
        // eg：every 2 week on Thursday
        {
          "name": "recurs",
          "label": "重复(Recurs)",
          "description": "",
          "input": {
            "type": "select",
            "source": "fixed",
            "options": moveDefaultToTop(recurs, recursOptions)
          }
        },
        // ➕创建日期：
        {
          "name": "createdDate",
          "label": "🛫",
          "description": "",
          "input": {
            "type": "date"
          }
        },
        {
          "name": "createdTime",
          "label": "⏱",
          "description": "",
          "input": {
            "type": "time"
          }
        },
        {
          "name": "priority",
          "label": "优先级(Priority)",
          "description": "",
          "input": {
            "type": "select",
            "source": "fixed",
            "options": moveDefaultToTop(priority, priorityOptions)
          }
        },
        {
          "name": "status",
          "label": "状态(Status)",
          "description": "",
          "input": {
            "type": "select",
            "source": "fixed",
            "options": moveDefaultToTop(status, statusOptions)
          }
        },
        {
          "name": "tags",
          "description": "",
          "input": {
            "type": "tag"
          }
        },
      ],
    };

    let result = await modalForm.openForm(
      editorForm1,
      {
        values: {
          "taskContent": taskContent,
          "reminderDate": reminderDate,
          "reminderTime": reminderTime,
          "due": due,
          "recurs": "",
          "createdDate": createdDate,
          "createdTime": createdTime,
          "status": status,
          "tags": tags ? tags : settings["Tag"] || "",
        }
      }
    );
    if (!result) {
      return;
    }

    // 取消任务会自动添加终止时间❌，完成任务则是由task插件来添加✅，故不需要干预
    // 获取输入标签
    const getTags = result.getValue('tags').value;
    console.log("getTags", getTags);
    let tagsStr = "";
    if (getTags.length >= 1) {
      tagsStr = getTags.map(t => "#" + t.trim().replace("#", "")).join(" ");
    } else {
      tagsStr = "";
    }
    // task的基本内容
    const task_content = result.getValue('taskContent').value.replace(/\n/gm, "<br>");
    const task_status = result.getValue('status').value;
    let task_doneDate = "";
    if (task_status === "x") {
      task_doneDate = "✅" + String(window.moment().format("YYYY-MM-DD"));
    } else if (task_status === "-") {
      task_doneDate = "❌" + String(window.moment().format("YYYY-MM-DD"));
    }

    // task的安排获取
    // !任务创建日期
    const task_creatDate = result.getValue('createdDate').value ? "🛫 " + result.getValue('createdDate').value : "";
    // 如果没有日期，则不显示时间
    // const task_creatTime = task_creatDate ? result.getValue('createdTime').value : "";
    let task_creatTime = result.getValue('createdTime').value ? result.getValue('createdTime').value : "";
    console.log(task_creatTime, hours, minutes);
    // 修正推断出createdTime2的逻辑
    const task_creatTime2 = window.moment(task_creatTime, 'HH:mm').add(hours, 'hours').add(minutes, 'minutes').format('HH:mm');
    console.log(`延迟后时间: ${task_creatTime2}`);
    if (task_creatTime && task_creatTime !== task_creatTime2) {
      task_creatTime = `${task_creatTime} - ${task_creatTime2}`;
    }

    // !任务提醒日期
    const task_reminderDate = result.getValue('reminderDate').value ? "⏰ " + result.getValue('reminderDate').value : "";
    // 如果没有日期，则不显示时间
    const task_reminderTime = task_reminderDate ? result.getValue('reminderTime').value : "";

    // !deadline Time
    // 注意事项，如果存在task_reminderDate但不存在due，则无法提醒，故当due不存在时，采用与reminderDate相同的日期。
    const task_due = result.getValue('due').value ? "📅 " + result.getValue('due').value : task_reminderDate.replace("⏰", "📅");

    // !任务优先级
    const task_priority = result.getValue('priority').value;
    // !任务周期
    const task_recurs = result.getValue('recurs').value;

    console.log(tagsStr, task_content);

    const output = (type ? `${startStr} \[${task_status}\] ` : `${startStr} `) +
      `${task_creatTime} ${tagsStr} ${task_content} ${task_reminderDate} ${task_reminderTime} ${task_priority} ${task_recurs} ${task_creatDate} ${task_due}  ${task_doneDate}`.replace(/\s+/g, " ").trim();

    console.log(output);

    // 替换当前行文本
    const line = editor.getLine(editor.getCursor().line);
    editor.replaceRange(output, { line: editor.getCursor().line, ch: 0 }, { line: editor.getCursor().line, ch: line.length });
    // 光标移动到末尾
    editor.setCursor({ line: editor.getCursor().line, ch: output.length });
  },
  settings: {
    name: "创建或编辑Task任务",
    author: "熊猫别熬夜",
    options: {
      "Tag": {
        type: "text",
        defaultValue: "",
        description: "设置默认标签，eg: #Project/学习"
      },
      "AutoCreatedDate": {
        type: "toggle",
        defaultValue: true,
        description: "是否自动插入创建日期(➕)"
      },
      "AutoTime": {
        type: "toggle",
        defaultValue: true,
        description: "是否自动插入时间前缀(HH:mm)"
      },
    }
  }
};