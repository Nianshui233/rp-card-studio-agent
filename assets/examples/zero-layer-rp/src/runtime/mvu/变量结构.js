// 0 层项目的变量结构仍由固定 registerMvuSchema 底座注册；具体字段按项目继续扩展。
import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';

registerMvuSchema(z.object({
  当前页签: z.string().prefault('总览'),
  最近事件: z.array(z.string()).prefault([]),
}));
