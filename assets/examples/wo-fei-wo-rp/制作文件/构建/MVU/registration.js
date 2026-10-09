// 制作文件/运行源码/MVU/注册入口.js
import { registerMvuSchema } from "https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource@523b1f0d82d3debbc2435ec35530f02e8d388219/dist/util/mvu_zod.js";

// 制作文件/运行源码/MVU/schema.js
var 数值轴 = (最小, 最大) => (值) => _.clamp(值, 最小, 最大);
var Schema = z.object({
  世界: z.object({
    日期: z.string().describe("YYYY-MM-DD，未记录时保持「未记录」").prefault("未记录"),
    时段: z.enum(["清晨", "白天", "黄昏", "夜晚"]).prefault("白天"),
    地点: z.string().describe("当前具体地点").prefault("未记录"),
    天气: z.string().prefault("未记录"),
    威胁等级: z.enum(["平静", "不安", "危险", "尸潮"]).prefault("平静"),
    在场者: z.array(z.string().describe("在场者称呼")).prefault([])
  }).prefault({}),
  主控: z.object({
    称呼: z.string().describe("外部主控的名号；未登记时保持「待登记」").prefault("待登记"),
    来历: z.string().prefault("待登记"),
    专长: z.string().prefault("待登记"),
    行事倾向: z.string().prefault("待登记"),
    当前目标: z.string().prefault("待登记"),
    身体: z.object({
      体力: z.coerce.number().transform(数值轴(0, 100)).prefault(100),
      伤势: z.coerce.number().describe("0 无伤 / 1 轻伤 / 2 重伤 / 3 致命 / 4 当场死亡").transform(数值轴(0, 4)).prefault(0),
      精神: z.coerce.number().transform(数值轴(0, 100)).prefault(100),
      脱水小时: z.coerce.number().transform(数值轴(0, 96)).prefault(0),
      饥饿小时: z.coerce.number().transform(数值轴(0, 168)).prefault(0),
      清醒小时: z.coerce.number().transform(数值轴(0, 96)).prefault(0)
    }).prefault({}),
    感染: z.object({
      可疑暴露: z.boolean().prefault(false),
      暴露原因: z.string().prefault(""),
      是否确认: z.boolean().prefault(false),
      剩余小时: z.coerce.number().describe("归零即完成转化").transform(数值轴(0, 36)).prefault(36),
      已处置: z.array(z.string().describe("一次处置，如 清创／截肢／抑制剂")).prefault([])
    }).prefault({}),
    觉醒: z.object({
      是否觉醒: z.boolean().prefault(false),
      能力类别: z.enum(["未觉醒", "躯体强化", "感知扩展", "念动力", "生体干涉", "环境操控", "精神渗透"]).prefault("未觉醒"),
      等级: z.coerce.number().transform(数值轴(0, 5)).prefault(0),
      觉醒代价: z.coerce.number().describe("0-24 稳定 / 25-49 波动 / 50-74 濒临失控 / 75-99 高危 / 100 失控释放").transform(数值轴(0, 100)).prefault(0),
      恢复小时: z.coerce.number().transform(数值轴(0, 720)).prefault(0),
      身份是否暴露: z.boolean().prefault(false),
      失控风险来源: z.string().prefault("")
    }).prefault({}),
    物资: z.record(z.string().describe("物品名"), z.coerce.number().describe("数量").transform(数值轴(0, 9999))).prefault({}),
    装备: z.array(z.string().describe("随身装备")).prefault([])
  }).prefault({}),
  同伴: z.record(z.string().describe("人物称呼"), z.object({
    类型: z.enum(["NPC", "外来者"]).prefault("NPC"),
    好感度: z.coerce.number().describe("-100 敌对 / -49 至 -1 戒备 / 0 陌生 / 1 至 49 合作 / 50 至 79 信任 / 80 以上 亲密").transform(数值轴(-100, 100)).prefault(0),
    关系依据: z.string().describe("最近一次改变好感度的具体行为；没有可指认行为就不得改动").prefault(""),
    亏欠: z.string().prefault("无"),
    当前地点: z.string().prefault("未知"),
    当前行动: z.string().prefault(""),
    是否在场: z.boolean().prefault(false),
    状态: z.string().describe("伤势、精神与装备现状；死亡时写死亡与时间").prefault("")
  }).prefault({})).prefault({}),
  势力: z.record(z.string().describe("势力名称"), z.object({
    立场: z.enum(["敌意", "戒备", "中立", "合作", "同盟"]).prefault("中立"),
    关注度: z.coerce.number().describe("该势力对我方的关注与暴露程度").transform(数值轴(0, 100)).prefault(0),
    当前阶段: z.string().prefault("待初始化"),
    下一步: z.string().prefault("待初始化"),
    后台进度: z.coerce.number().describe("每个时段自行推进 3-10；到 100 完成当前阶段").transform(数值轴(0, 100)).prefault(0),
    已知我方信息: z.string().prefault("")
  }).prefault({})).prefault({}),
  据点: z.record(z.string().describe("据点名称"), z.object({
    控制方: z.string().prefault("待初始化"),
    人数: z.coerce.number().transform(数值轴(0, 1e5)).prefault(0),
    配给: z.string().prefault("待初始化"),
    防御: z.string().prefault("待初始化"),
    士气: z.coerce.number().describe("0-100；单次变化不超过 20").transform(数值轴(0, 100)).prefault(50),
    物资: z.record(z.string().describe("物资名"), z.coerce.number().describe("数量").transform(数值轴(0, 9999))).prefault({}),
    对我态度: z.enum(["排斥", "观望", "接纳", "依赖"]).prefault("观望")
  }).prefault({})).prefault({}),
  悬念: z.record(z.string().describe("悬念名称或代号"), z.object({
    涉及方: z.string().prefault(""),
    最后进展: z.string().prefault(""),
    可信度: z.enum(["传闻", "未经核实", "已核实", "存疑"]).prefault("未经核实"),
    是否收束: z.boolean().prefault(false)
  }).prefault({})).prefault({}),
  现场: z.object({
    敌对单位: z.array(z.string().describe("敌人称呼与数量")).prefault([]),
    可调查目标: z.array(z.string()).prefault([]),
    暴露与噪音: z.coerce.number().describe("60 以上必须出现被吸引的后果").transform(数值轴(0, 100)).prefault(0),
    掩体与退路: z.string().prefault("")
  }).prefault({}),
  系统: z.object({
    已登记: z.boolean().prefault(false),
    时段计数: z.coerce.number().transform(数值轴(0, 9999)).prefault(0),
    上次后台推进: z.string().prefault("未开始"),
    难度基调: z.string().prefault("严酷但不无解"),
    备注: z.string().prefault("")
  }).prefault({})
});

// 制作文件/运行源码/MVU/注册入口.js
$(() => {
  registerMvuSchema(Schema);
});
