// 工程入口：只协调 canonical Schema 与真实注册器；导入的是构建结果。
import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource@523b1f0d82d3debbc2435ec35530f02e8d388219/dist/util/mvu_zod.js';
import { Schema } from './schema.js';
$(() => { registerMvuSchema(Schema); });
