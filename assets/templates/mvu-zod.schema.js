// canonical MVU_ZOD Schema 模板：复制后必须按项目状态合同完整改写，不能只保留示例字段。
import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource@523b1f0d82d3debbc2435ec35530f02e8d388219/dist/util/mvu_zod.js';

const clamp = (min, max) => value => _.clamp(value, min, max);

export const Schema = z.object({
  世界: z.object({
    当前日期: z.string().describe('项目规定的日期格式').prefault(''),
    当前时间: z.string().describe('HH:MM').prefault('08:00'),
    当前地点: z.string().prefault('未设定'),
  }).prefault({}),

  玩家: z.object({
    姓名: z.string().prefault('待登记'),
    生命值: z.coerce.number().transform(clamp(0, 100)).prefault(100),
    体力: z.coerce.number().transform(clamp(0, 100)).prefault(100),
    背包: z.record(
      z.string().describe('物品名'),
      z.string().describe('数量、状态或简短描述'),
    ).prefault({}),
  }).prefault({}),

  任务: z.object({
    主线: z.object({
      名称: z.string().prefault('未开始'),
      阶段: z.string().prefault('未开始'),
      进度: z.coerce.number().transform(clamp(0, 100)).prefault(0),
    }).prefault({}),
  }).prefault({}),

  现场: z.object({
    敌对单位: z.array(z.string()).prefault([]),
    可调查目标: z.array(z.string()).prefault([]),
  }).prefault({}),
});

$(() => {
  registerMvuSchema(Schema);
});
