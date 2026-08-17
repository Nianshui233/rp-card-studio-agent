// 原创 MVU_ZOD 注册脚本：Schema 负责校验和补全结构，[initvar] 负责真实初始值。
(async()=>{
  const host=window.parent&&window.parent!==window?window.parent:window;
  const wait=window.waitGlobalInitialized||host.waitGlobalInitialized;
  await wait?.('Mvu');
  const z=window.z||host.z;
  const register=window.registerMvuSchema||host.registerMvuSchema;
  if(!z||!register) throw new Error('MVU_ZOD 宿主能力尚未就绪');
  const Schema=z.object({
    世界:z.object({当前时间:z.string().prefault('议会第十二日 09:00'),会场:z.string().prefault('砂钟议事厅')}),
    议案:z.object({当前:z.string().prefault('暂无议案'),支持:z.coerce.number().int().min(0).prefault(0),反对:z.coerce.number().int().min(0).prefault(0)}),
    舆论:z.object({稳定度:z.coerce.number().min(0).max(100).prefault(50),关键词:z.array(z.string()).prefault([])})
  });
  register(Schema);
})();
