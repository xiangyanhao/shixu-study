# 师序 · 高中信息技术教资学习台

## 开发说明

本项目在产品设计、程序开发、测试和文档整理过程中使用了 OpenAI GPT 辅助。GPT 作为开发工具参与需求梳理、代码建议与质量检查，项目功能、学习内容和发布版本仍由项目维护者审阅与负责；使用 GPT 辅助开发不代表本项目由 OpenAI 官方提供或背书。

（相信你已经体会到GPT的防御性写作了，另外，网页里面的各类鸡汤文案基本上是GPT写的）

## 一键启动

准备好 **Node.js 22 或以上版本**，无需安装 npm 依赖。

- Windows：完整解压项目，双击 `启动学习台.cmd`，自动检查环境并打开默认浏览器。
- macOS / Linux：执行 `sh start.sh`，或执行 `npm start`。
- 终端启动：`node launcher.mjs`。只开服务、不打开浏览器：`node launcher.mjs --no-open`。
- PowerShell限制npm.ps1时，使用 `npm.cmd start`。

默认地址 `http://127.0.0.1:4173`，被其他程序占用时尝试后续9个端口，以窗口输出为准。同一项目重复启动会复用服务。可通过 `SHIXU_PORT` 指定起始端口。不要直接双击HTML；保持服务窗口开启，关闭窗口或按Ctrl+C停止。

路径相对项目目录解析，可放到其他盘符、带空格或中文的文件夹，无需修改源码。项目目录需要可写。

## GitHub Pages 静态部署

项目包含 `.github/workflows/deploy-pages.yml`，会在推送到 `main` 分支后直接发布 `dist`，不需要Node.js构建，也不会部署本地服务端代码或 `data` 目录。

1. 将源码和 `dist` 一并推送到GitHub仓库的 `main` 分支。
2. 在仓库 **Settings → Pages → Build and deployment** 中，将 **Source** 设为 **GitHub Actions**。
3. 打开 **Actions** 查看“Deploy static site to GitHub Pages”；也可以手动运行该工作流。
4. 部署完成后访问 `https://<用户名>.github.io/<仓库名>/`。项目使用相对资源路径，支持仓库子路径。

工作流依据[GitHub Pages自定义工作流说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)，只上传 `dist` 静态文件。

### 在线静态模式的数据与模型限制

- 答卷、错题、笔记、阅读进度和模型非密钥设置只保存在当前浏览器的 `localStorage`，本站没有后端数据存储。清理浏览器数据或更换设备前请导出学习备份。
- API Key只保留在当前页面内存，刷新或关闭页面后需要重新填写；不会写入学习备份、Git仓库、浏览器持久存储或GitHub Actions。不要在公共设备上输入私人密钥，也不要把密钥写入源码或仓库Secrets供公共网页共享。
- 在线版不使用本机代理。AI请求由浏览器直接发送到用户填写的模型URL，因此服务必须使用HTTPS，并允许该GitHub Pages来源跨域访问（CORS）。不支持浏览器跨域的模型服务无法在Pages中使用AI功能。
- 需要本机代理、Windows DPAPI加密保存API Key，或者需要连接不支持CORS的模型服务时，请下载完整项目并使用本地版；本地版和Pages版是两种独立运行方式，不需要同时启动。
- 在线版学习数据只在浏览器；本地版可将学习数据保存到项目 `data` 目录。两种版本均可通过导出、导入学习备份迁移记录。
- GitHub Pages上的静态文件通常可以公开访问，部署前应确认 `dist` 中的资料和PDF适合公开分发。

## 学习数据迁移

本地版自动将答卷、错题、笔记、阅读进度、进行中的练习和模型非密钥设置写入 **`data/study.json`**。浏览器缓存只作辅助，文件存在时以项目数据文件为准。

1. 等待保存完成，关闭服务窗口。
2. 将整个 `shixu-study` 文件夹（包括 `data`、`dist`、`sources`）复制到另一台电脑。
3. 在新电脑启动，自动恢复记录，可以使用不同浏览器和不同端口。

**API Key不进入学习数据或迁移包，新电脑需要重新填写。** 可选的本机加密密文独立保存在 `data/.local-secrets`；手动复制项目时也应排除此目录。模型URL、模型名和代理开关会迁移。进行中练习保留原截止时间，迁移不会延长考试时间。

`data/study.previous.json` 保留上一次有效记录。异常损坏时先停止服务、保留损坏文件，再把前一版本复制为 `study.json` 恢复。保存采用临时文件与原子替换；多页面冲突会提示刷新，避免静默覆盖。分享项目给其他人前，可移走 `data` 中的JSON文件。

### 从旧版本或在线网站迁入

旧版本数据仅在浏览器。同一浏览器、同一地址首次运行新版本时会自动迁入；其他浏览器或在线网站，请先在旧版“模型与数据设置”导出学习备份，再在本地版导入。导入后自动写入项目数据文件。

在线静态托管仍使用浏览器存储，不能访问本机磁盘。迁移到本地时使用导出/导入。

## 打包迁移

```powershell
python scripts/package_portable.py
```

使用Python标准库生成 `releases/shixu-study-portable.zip`，包含运行文件、完整知识库、PDF、原始Markdown及已有学习数据。排除Git、托管身份、测试浏览器缓存和环境密钥文件。运行网站不需要Python，重新打包或重建资料时才需要。

## 功能与资料

包含49份资料与章节、108道自编模拟题：快速自测、自主组卷、三科120分钟150分完整模拟、主观题专项、刷新续答、主观题自评或AI估分、错题复习、掌握分析和答疑。关闭题型后标记减量练习。科目一、科目二按中学教师资格公共科目处理，情境覆盖不同学科课堂和通用教育实践，不限定为信息技术；科目三采用教材中的常见结构，不声称为官方固定题型。

“主观题专项”提供本地题库和AI根据资料生成两种来源，可按科目、题型、题量、时间与难度练习。科目一提供材料分析和写作，科目二提供辨析、简答和材料分析，科目三提供简答、案例分析和教学设计。交卷后逐题显示标准答案、资料依据和评分量规，可以手动自评，也可以使用“AI批改主观题”获得逐点估分反馈。

补充课标为用户提供的《普通高中信息科技课程标准（2017年版2025年修订）·日常修订版》，按12个主题入库，保留PDF和页码。课程、素养、教学与评价优先检索课标，图表以PDF原文为准；学生学业水平考试建议不替代教资组卷蓝图。

## 模型接入与职责

### AI助教的回答与状态

AI问答支持流式显示，以及Markdown标题、分层列表、表格、引用和带复制按钮的代码块。资料编号可以点击回看原文；也可复制整段回答。Enter发送、Shift+Enter换行，输入法选字时不会误发送。阅读上文时新内容不会强制把页面拉到底部。

所有面向用户的模型输出统一经过安全富文本渲染，包括AI学习建议、助教回答、AI评分反馈，以及AI生成题的参考答案和解析。模型若误返回JSON，页面会将其转换为中文标题、列表和字段内容；未完成或损坏的结构化内容显示友好提示，不直接展示裸JSON。模型HTML和脚本不会执行，连接测试也不回显模型原始响应。

状态依据实际响应：连接服务 → 服务已响应、等待模型 → 接收正文。只有服务发送推理信号时才显示“模型正在思考”，不显示推理原文；未收到服务确认时不会假装模型已开始生成。服务若忽略流式请求并返回完整JSON，会显示“等待完整回答”，兼容原有输出格式。

连接超时、HTTP拒绝、等待正文超时、输出中断分别提示原因，支持停止生成和重新生成；已收到的正文会保留。连接等待30秒、首次输出或推理信号等待90秒、正文中断等待60秒，单次问答最长5分钟。某些服务会缓冲响应头，在收到确认前无法判断其内部是否已开始生成。停止请求会同步取消本地代理的上游连接。

流式协议参考：[OpenAI官方Chat Completions流式事件](https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events)。

在“模型与数据设置”填写模型URL、API Key和准确模型名，保存后测试。支持OpenAI兼容 `POST /chat/completions`，Base URL自动补全端点。本地版默认启用本机代理以解决CORS问题；代理仅监听127.0.0.1，不记录密钥。GitHub Pages在线版不走代理，由浏览器直接连接模型服务。

Windows 本地版默认勾选“在本机加密保存 API Key”。保存后，刷新页面或停止后重新启动，均会自动使用，无需再次输入。输入框始终不回显；留空继续使用已存密钥，输入新Key并保存即可替换，“清除 Key”删除当前模型URL对应的密钥。取消勾选时需重新输入Key，之后仅在当前页面内存使用，并删除该URL的已存密钥。

加密使用 [Windows DPAPI CurrentUser](https://learn.microsoft.com/en-us/dotnet/standard/security/how-to-use-data-protection)，由当前Windows用户环境保护，不在项目中放置解密主密钥。密文在 `data/.local-secrets/credentials.json`；明文仅在本地服务调用模型时短暂使用，接口不提供读取或显示密钥的功能，也不把密钥写入浏览器存储。密钥与完整模型请求URL绑定，修改URL后须单独配置，禁止将旧密钥发送给不同服务。

便携包排除整个 `.local-secrets`（包括密文和临时文件），学习备份也不包含密钥。同机同Windows用户可自动恢复；换电脑或Windows用户需重新输入。此加密保存功能目前仅支持Windows本地版，macOS、Linux及在线静态版仍可在当前页面内存中使用Key。

资料、问题和作答会发送给自行配置的服务，可能产生费用。运行时职责位于 `dist/policies.js`，每次请求实际注入；`AGENTS.md`记录维护规则。程序校验AI题型、题量、分值、选项、引用与评分范围。所有题为自编模拟，主观题为自评/AI估分，不转换官方报告分。

AI组卷允许为考查理论合理创设人物、课堂事件和校园活动，不要求情境细节在资料中逐字出现；理论依据、答案和解析仍须与资料一致。引文核验忽略空白、常见标点及小幅文字差异。若仅有某道题的理论引文无法核验，系统保留同批其他合格题目，只定点重新生成该题，每题最多重试2次；重试仍不通过时才停止并明确提示。

## 重建资料与验证

```powershell
python -X utf8 build_content.py
npm.cmd test
```

原始Markdown在 `sources/materials`，课标提取缓存在 `sources/curriculum.json`，不再读取上级目录。默认重建只用Python标准库。仅重新提取PDF时需要PyMuPDF：

```powershell
python -m pip install pymupdf
python -X utf8 build_content.py --refresh-curriculum
```

支持 `--source-root` 指定其他资料根目录、`--curriculum` 指定补充PDF。保留完整 `sources` 和 `dist/assets`。

接口格式：[OpenAI官方参考](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)。考试大纲：[教育部教育考试院](https://ntce.neea.edu.cn/html1/category/1507/1099-1.htm)。
