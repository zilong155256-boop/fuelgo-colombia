# FuelGo Colombia — 前端交付版 / Entrega visual

## 范围
纯 HTML/CSS/JS 前端展示。保留 FuelGo 品牌页面、五个 HTML/CSS APP 手机预览（Inicio → Cupones → Historial → Código QR → Mi cuenta）及滑动、安装说明和 FAQ 原生展开收起。手机预览内容和原有文案不作重新设计。

## 文件
- `index.html`: 落地页、静态按钮视觉与 FAQ
- `app-showcase.html`: 五屏 HTML/CSS 手机展示、左右触摸滑动和鼠标拖动，基准 390px，缩小展示模型约 15%
- `assets/app-html/`: 14 个静态图片素材，独立加载和缓存；品牌/真实图片保留素材而非假冒 HTML 官方 Logo
- `fuelgo-logo.svg`: 已确认的站点 Logo

## 已移除 / NO backend
当前发布树不包含 Cloudflare Functions、download-worker、APK 下载地址轮换、设备版本限制、Pixel、转换回传、统计 API、跟踪 Cookie 或这些功能的依赖。**旧技术功能不会运行。**

## 新技术人员待接入
1. APK 地址与十链接轮换、真实下载操作和异常处理
2. Android 11+ 设备版本检测及其他设备提示
3. Meta Pixel/事件追踪，按地区和实际同意设置合规实施
4. 访问及下载统计、后台 API 和监控
5. 真实分享/客服/钱包支付功能（如果业务需要）及按钮连接
6. 隐私政策、服务条款、商业承诺及支付合作资质核验；当前法务位置仅展示视觉

下载按钮现仅是 HTML 静态展示标签，不会执行下载或提示成功。请勿把当前视觉界面当作已接通支付功能的证据。

## 部署
仓库根目录为纯静态站。部署入口 `index.html`，无需构建命令、环境变量或 API。请部署前核对静态文件路径及跨设备显示。首屏加油站照片和四个钱包图标目前依赖外部图片服务；若需完全离线或更稳定首屏加载，请在确认授权素材后本地化、压缩并更新链接。

## 回退
修改前已备份到分支 `backup-before-final-frontend-20261116`。勿直接删除。
