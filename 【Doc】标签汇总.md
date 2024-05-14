---
uid: "20240512122432559"
title: 【Doc】标签汇总
tags:
  - Projects
state: 
cssclasses: 
created: 2024-05-12 12:24:32
modified: 2024-05-12 13:16:29
banner: "[[DailyNote.png]]"
date: 2024-05-12
priorutyid: "20240512122432559"
---

```dataviewjs
let tags = {};
dv.pages("").file.etags.distinct()
  .filter(t => {
    const levels = t.split("/");
    return levels.length >= 1 // 选择标签等级大于等于1的标签
  })
  .filter(t => dv.pages(t).length >= 1) // 去除长度小于1的标签
  .filter(t => t.trim() !== '') // 去除等于空的标签
  .forEach(t => {
    const levels = t.split("/");
    const firstLevel = levels[0];
    const lastLevel = levels[levels.length - 1].replace('#', ''); // 获取最后一级的标签并去除 "#"
    if (!tags[firstLevel]) {
      tags[firstLevel] = [];
    }
    tags[firstLevel].push(`[#${lastLevel}](${t})`+"("+dv.pages(t).length+")"); // 给每个标签加上 "#"
  });

let result = '';
for (let firstLevel in tags) {
  result += '> [!example]+ '+firstLevel + '\n\t> ' + tags[firstLevel].join('、') + '\n\n';
}

dv.paragraph(result);
```
