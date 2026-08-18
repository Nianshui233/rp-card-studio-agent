import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';

const Schema = z.object({
  站点: z.object({ 名称: z.string().prefault('未登记'), 区域: z.string().prefault('未知') }).prefault({}),
  天气: z.string().prefault('未知'),
  告警: z.string().prefault('无'),
  当前任务: z.object({ 名称: z.string().prefault('暂无任务'), 状态: z.string().prefault('未知') }).prefault({}),
});

$(() => registerMvuSchema(Schema));
