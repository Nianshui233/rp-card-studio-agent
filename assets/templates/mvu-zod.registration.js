// 与 canonical Schema 分开；构建后导入 bundle，不把相对 import 直接粘贴进酒馆脚本。
import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';
import { Schema } from './schema.js';
$(() => { registerMvuSchema(Schema); });
