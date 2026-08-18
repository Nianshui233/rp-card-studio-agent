# 纸鸢台：原创原生 MVU 闭环样本

真实初始值进入 [initvar] 世界书条目；SillyTavern 运行桥等待 MVU、读取当前消息楼层、确认 stat_data、通过 parseMessage + replaceMvuData 写回并读回；模型更新规则与输出格式负责每轮变化；完整和流式正则负责玩家显示清理。

这个文件不是 MVU 框架替身，也不把“存在一个 loader.js”当成已加载成功。
