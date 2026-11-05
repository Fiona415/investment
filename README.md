# 持仓罗盘 · 基金与市场观察

这是[线上看板](https://fund-atlas-mei-2026.fionamei27.chatgpt.site/)的**公开空白模板**源码。首次打开没有任何个人持仓。用户自行添加基金或导入 JSON / JPG / PNG；持仓、交易流水和行情快照仅保存在各自浏览器的 `localStorage`，互不共享。隐藏金额只是显示设置，不是加密。请定期在页面底部导出完整 JSON 备份。

## 功能

- 上证指数、两市成交额、板块资金流和市场情绪观察；页面打开时加载，保持打开时约每 5 分钟更新。
- 两账户持仓、逐笔规则化分析、主题仓位观察上限和总体再平衡参考。
- 买入、卖出、按兵不动记录；下单时间、15:00 前后、金额或比例。买卖先标为待确认，不会自动改动正式持仓。
- 近 7 日、近 30 日及卖出后至今的记录复盘。缺少历史行情时不计算虚假的收益率。
- JPG/PNG 图片由浏览器中的 Tesseract.js 识别，导入前必须人工核对基金名称、代码与金额。

## 目录与运行

- `source/`：页面 HTML、CSS 和浏览器 JavaScript。
- `worker/template.js`：站点服务及行情、基金、新闻接口。`worker/index.js` 是把 `source/` 嵌入后的生成文件。
- `scripts/generate-worker.mjs`：从 `source/` 生成 Worker。
- `scripts/build.mjs`、`scripts/validate-artifact.mjs`：生成并检查 Sites 部署产物。
- `.openai/hosting.json`：现有线上站点的项目配置。

使用 Node.js 20 或更新版本，在本目录运行：

```bash
node scripts/generate-worker.mjs
node scripts/build.mjs
node scripts/validate-artifact.mjs
```

直接双击 `source/index.html` 无法获取 Worker 接口；需要把 Worker 部署到兼容平台。仓库公开仅表示源码可查看，不会自动创建 GitHub Pages 网站；实际可使用的站点链接在上方。

`scripts/sync-public-source.mjs` 只供原作者从本地私人看板同步页面时使用；其他人编辑 `source/` 即可。生成脚本会移除私人看板的初始持仓数据。

## 数据与限制

基金净值以已公布日期为准，部分份额代码尚未核对时不会用其他份额净值代替。行情和新闻依赖第三方公开接口，可能延迟或中断。15:00 仅用于估计申请日，具体交易日、份额确认和费用以基金合同与销售平台为准。投资建议为规则化观察，不能保证本金或目标收益。

