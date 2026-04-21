# chatgpt2api

本项目仅供学习与研究交流。请务必遵循 OpenAI 的使用条款及当地法律法规，不得用于非法用途！

ChatGPT 图片生成代理与账号池管理面板，提供账号维护、额度刷新和图片生成接口。

## 功能

- 兼容 OpenAI `Chat Completions` 图片响应
- 兼容 OpenAI `Responses API` 图片生成接口
- 支持导入 CPA 格式文件
- 支持多种方式导入 `access_token`
- 自动刷新账号邮箱、类型、图片额度、恢复时间
- 轮询可用账号进行图片生成
- 失效 Token 自动剔除
- 提供 Web 后台管理账号和生成图片 
- 支持文生图、编辑图

> gpt-image-2灰度中，不保证完全是gpt-image-2

文生图界面：

![image](assets/image.png)

编辑图：

![image](assets/image_edit.png)


Chery Studio 中使用：

![image](assets/chery_studio.png)

号池管理：

![image](assets/account_pool.png)

## 接口

所有接口都需要请求头：

```http
Authorization: Bearer <auth-key>
```

### 图片生成

```http
POST /v1/images/generations
```

```http
POST /v1/chat/completions
```

```http
POST /v1/responses
```

请求体示例：

```json
{
  "prompt": "a cyberpunk cat walking in rainy Tokyo street",
  "model": "gpt-image-1",
  "n": 1,
  "response_format": "b64_json"
}
```

## 部署

```bash
git clone git@github.com:basketikun/chatgpt2api.git
# 首次启动会自动生成 config.json，也可以手动复制后修改
# cp config.example.json config.json
# 可按需编辑 config.json 的密钥和 `refresh_account_interval_minute`
docker compose up -d
```

## 社区支持
学 AI , 上 L 站

[LinuxDO](https://linux.do)
