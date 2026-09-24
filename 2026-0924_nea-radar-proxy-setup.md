# 新加坡雷达代理设置 · NEA radar proxy setup (ssw-20260924-11)

软件先尝试**不用密钥、直接**读取 data.gov.sg。部署后打开地图，看地图下方那一行：

- 出现「新加坡雷达 05:35 MYT」→ 直接读取可用，**不必做下面任何步骤**。
- 出现「新加坡雷达读取失败：Failed to fetch / HTTP 401 / HTTP 429 …」→ data.gov.sg 不让网页直接读取或限流，按下面设置一次代理。

## 1. 申请 data.gov.sg 免费密钥
1. 在 data.gov.sg 注册并登录。
2. 打开任一数据集页面（例如 Weather Radar Images），在 **API** 分页生成 API key。复制备用。

## 2. 建 Cloudflare Worker（免费版每天 10 万次请求，足够）
1. 登录 dash.cloudflare.com → **Workers & Pages** → **Create** → **Create Worker**，名字填 `nea-proxy`，先 **Deploy**。
2. **Edit code**：删掉默认代码，贴上 `nea-proxy-worker.js` 全部内容 → **Deploy**。
3. Worker 的 **Settings → Variables and Secrets → Add**：类型选 **Secret**，名称 `DATA_GOV_SG_API_KEY`，值贴密钥 → 保存并重新部署。
4. 记下网址，例如 `https://nea-proxy.xxxx.workers.dev`。

## 3. 把代理网址填进软件
在 `index.html` 找到：

    const NEA_PROXY = '';

改成：

    const NEA_PROXY = 'https://nea-proxy.xxxx.workers.dev';

再把 `index.html` 的 `VERSION` 和 `sw.js` 的 `CACHE` 一起改成新版本号（两者必须相同），push。

## 说明
- 密钥只存在 Cloudflare 的 Secret 里，不会出现在 GitHub。
- 代理只放行雷达图（70/240/480 km），其他路径一律 404。
- 只接受来自 `https://stanleywoosweeleong.github.io`、本机 localhost，以及 file://（本地测试）的网页请求。这只能挡住别的网站借用，挡不住刻意伪造的程序；若发现用量异常，到 data.gov.sg 重新生成密钥即可。
- 在浏览器地址栏直接打开代理网址会看到 `origin not allowed`，这是正常的——只有软件本身能用。
- 代理出错时软件会写出原因（例如 `proxy has no DATA_GOV_SG_API_KEY secret`），并自动再试一次直接读取。
