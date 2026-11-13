# FuelGo Colombia — APK 分流部署与验收

**状态：代码已提交；Cloudflare Pages / Durable Object 未确认实际部署；真实 APK 内容与10个地址未验证。禁止宣称已上线。**

## 架构
- `index.html` 四个 Descargar FuelGo 均以同源 `/api/download` 为目标，不暴露 APK 地址，也不在前端发安装成功事件。
- `functions/api/download.js` 是 Cloudflare Pages 唯一下载入口。缺少绑定时返回 503，不放行。
- `download-worker/src/index.js` 是**另外部署**的 Cloudflare Durable Object Worker；同一个命名 Durable Object 串行处理所有下载请求、校验设备信息并存储轮询位置和汇总计数。
- `_headers` 请求受支持浏览器发送 Android Platform Client Hints。无 CH 的浏览器默认不允许下载；访问网站本身不受限制。
- 平台版本和 User-Agent 均可被伪造；这是保守过滤而不是硬件级证明。Chrome 精简 UA 的 `Android 10; K` 应结合 CH 判定。

## 必须由技术人员在 Cloudflare 配置
1. 核实域名属于 FuelGo 项目、Pages 绑定的是 `zilong155256-boop/fuelgo-colombia` 的 main 分支，确认线上真实地址。
2. 单独部署 `download-worker/` 中的 Worker：`cd download-worker && npx wrangler deploy`。Workers Durable Object 不能直接创建在 Pages 项目里。
3. Cloudflare Pages 生产环境和预览环境分别新增 Durable Object Binding：变量名 **FUELGO_ROUTER**，类名 **DownloadRouter**，对应 Worker **fuelgo-apk-router**，然后重新部署。
4. 不要把用户提供的十个不透明游戏类域名当作已经验证的 FuelGo APK。逐个检查文件 hash、签名证书、包名、下载链及安全扫描结果；验证成功后才加入 Worker secret **DOWNLOAD_POOL**。
5. 用 `npx wrangler secret put DOWNLOAD_POOL` 设置 JSON 数组，示例：`[{"id":"apk-01","url":"https://verified-app-host.example/app.apk","enabled":true,"verified":true}]`。不要提交真实地址或 API 密钥到 GitHub。
6. 下载链接必须支持 HTTPS 和服务器 HEAD 健康检查，并返回 APK 类型或文件名，否则将被暂停；实际安装包仍需额外核查，HEAD 通过不是完整安全证明。
7. 配置 Cloudflare WAF 速率限制、存储统计的访问权限与合适的保存期限；目前没有管理页面和安全的暂停重置工具，失效链接需要维护人员处理。
8. 所有用户都能浏览普通页面。只有成功通过服务端设备检查、轮询分配和 HEAD 检查才得到 302 下载跳转。

## 事件定义
- `button_click`：到达服务端的下载入口请求，不代表下载完成。
- `rejected:old` / `rejected:other` / `rejected:unknown`：失败的设备分类；拒绝时不递增轮询序号。
- `eligible`：服务端检查通过。
- `allocation_succeeded` / `allocation_failed`：分配成功/失败。
- `link_health_failed`：链接健康检查失败并暂停。
- `link:<id>:allocated` 和 `latest_assignment`：仅记录编号、时间和 302 下发结果，不保存完整设备指纹。
- **没有实际 APK 下载完成或安装成功追踪**。302 不代表传输完成，更不代表安装；Meta 不得把点击/跳转当安装成功。如果以后接入 Pixel+CAPI，必须分别命名事件并用 event_id 去重。

## 自动测试
`cd download-worker && npm test`；现有用例覆盖 Android 10、11、12、13、14、15、16、Android CH 缺失和冲突、iPhone/iPad/Mac/Windows、轮询并发、无链接池和失效链接暂停。
测试代码提交不代表已执行。部署后还需真实设备或模拟器测试，以及生产 Cloudflare 访问日志核对。

## 待完成上线验收
- [ ] APK 的10个链接确认为 FuelGo 安装包，文件签名及安全性通过检查。
- [ ] Cloudflare Pages 与当前仓库及正式域名绑定关系已证实。
- [ ] Worker 发布与 Pages Durable Object Binding 已完成。
- [ ] `Accept-CH` 真实浏览器回传并验证版本；缺失时按未知设备拒绝。
- [ ] 320/360/375/390/412/430px 下所有按钮、提示和页面布局通过实机验收。
- [ ] Android 10 被拦截；Android 11、12、13、14、15、16+ 实际能够分流下载。
- [ ] iPhone、iPad、Mac、Windows 无法取得任何 APK 链接。
- [ ] 并发请求下序号正确；不合格用户不递增序号。
- [ ] 异常网络、失效地址、HEAD 不支持、下载文件真实性、恶意跳转均已测试。
- [ ] Meta PageView 保持不变且没有虚假的下载成功/安装成功事件。
- [ ] 配置生产环境的私密管理、统计查询、失败告警和清理/复位流程。

**上线前不应把无法验证的真实下载地址标记 `verified:true`。**
