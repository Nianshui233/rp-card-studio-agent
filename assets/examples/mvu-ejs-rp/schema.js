import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource@523b1f0d82d3debbc2435ec35530f02e8d388219/dist/util/mvu_zod.js';

const clamp = (min, max) => value => _.clamp(value, min, max);

export const Schema = z.object({
  世界: z.object({
    日期: z.string().describe('YYYY-MM-DD').prefault('2026-09-26'),
    时间: z.string().describe('HH:MM').prefault('06:30'),
    地点: z.string().prefault('灰港公寓一层大厅'),
    天气: z.enum(['晴', '阴', '雨', '暴雨', '雾']).prefault('雾'),
  }).prefault({}),
  玩家: z.object({
    姓名: z.string().prefault('待登记'),
    生命值: z.coerce.number().transform(clamp(0, 100)).prefault(100),
    体力: z.coerce.number().transform(clamp(0, 100)).prefault(100),
    感染风险: z.coerce.number().transform(clamp(0, 100)).prefault(0),
    背包: z.record(z.string().describe('物品名'), z.string().describe('数量或状态')).prefault({}),
  }).prefault({}),
  同伴: z.record(z.string().describe('角色姓名'), z.object({
    关系: z.enum(['陌生', '戒备', '合作', '信任', '亲密']).prefault('陌生'),
    好感度: z.coerce.number().transform(clamp(-100, 100)).prefault(0),
    当前地点: z.string().prefault('未知'),
    当前行动: z.string().prefault(''),
  }).prefault({})).prefault({}),
  任务: z.object({
    主线: z.object({
      名称: z.string().prefault('确认楼内幸存者'),
      阶段: z.string().prefault('封锁大厅'),
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
