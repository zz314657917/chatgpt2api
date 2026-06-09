package util

import (
	"fmt"
	"regexp"
	"strings"
)

var exactErrorTranslations = map[string]string{
	"access_token contains whitespace":                                    "access_token 不能包含空白字符",
	"access_token is required":                                            "缺少 access_token",
	"access_token is required for codex responses image route":            "Codex Responses 图片链路缺少 access_token",
	"access_token is required for official image conversation route":      "官方图片对话链路缺少 access_token",
	"access_token or account_id is required":                              "缺少 access_token 或 account_id",
	"access_tokens or account_ids is required":                            "缺少 access_tokens 或 account_ids",
	"account ids is required":                                             "缺少账号 ID",
	"account not found":                                                   "账号不存在",
	"action must be retention, user-limit, quota, thumbnails, or all":     "action 必须是 retention、user-limit、quota、thumbnails 或 all",
	"adjustment type is required":                                         "缺少调整类型",
	"admin permission required":                                           "需要管理员权限",
	"amount must be greater than 0":                                       "数量必须大于 0",
	"announcement not found":                                              "公告不存在",
	"address type not supported":                                          "地址类型不支持",
	"asset_id is required for official interpreter asset download":        "官方解释器资源下载缺少 asset_id",
	"author is required":                                                  "缺少 author",
	"authorization is invalid":                                            "授权信息无效",
	"balance cannot be negative":                                          "余额不能为负数",
	"base_url is required":                                                "缺少 base_url",
	"billing service is unavailable":                                      "计费服务不可用",
	"bootstrap admin username already exists":                             "初始化管理员用户名已存在",
	"canvas already exists":                                               "画布已存在",
	"canvas contains a cycle":                                             "画布包含循环依赖",
	"canvas executor is required":                                         "缺少画布执行器",
	"canvas has no entry node":                                            "画布没有入口节点",
	"canvas has no nodes":                                                 "画布没有节点",
	"canvas id is required":                                               "缺少画布 ID",
	"canvas not found":                                                    "画布不存在",
	"canvas run not found":                                                "画布运行记录不存在",
	"canvas service is unavailable":                                       "画布服务不可用",
	"chat task streaming is not supported":                                "文本任务不支持流式执行",
	"chat requirements requires arkose token, which is not implemented":   "ChatGPT 要求 Arkose 验证，但当前尚未实现",
	"chatgpt_account_id is required for codex responses image route":      "Codex Responses 图片链路缺少 chatgpt_account_id",
	"checksum verification failed":                                        "校验和验证失败",
	"client_task_id is required":                                          "缺少 client_task_id",
	"cloudflare_temp_email response missing address or jwt":               "Cloudflare Temp Email 响应缺少 address 或 jwt",
	"command not supported":                                               "命令不支持",
	"connection not allowed":                                              "连接不被允许",
	"connection refused":                                                  "连接被拒绝",
	"content is required":                                                 "缺少内容",
	"conversation_id is required for official image download":             "官方下载图片缺少 conversation_id",
	"conversation_id is required for official interpreter asset download": "官方解释器资源下载缺少 conversation_id",
	"creation task failed":                                                "创作任务失败",
	"creation task not found":                                             "创作任务不存在",
	"email+password or api_key is required":                               "缺少邮箱密码或 api_key",
	"empty endpoint":                                                      "endpoint 不能为空",
	"file upload metadata incomplete":                                     "文件上传元数据不完整",
	"form request failed":                                                 "表单请求失败",
	"general failure":                                                     "一般性失败",
	"gptmail response missing email":                                      "GPTMail 响应缺少 email",
	"host unreachable":                                                    "主机不可达",
	"host is required":                                                    "缺少 host",
	"image data is required":                                              "缺少图片数据",
	"image file is empty":                                                 "图片文件为空",
	"image file is required":                                              "缺少图片文件",
	"image is required":                                                   "缺少图片",
	"image not found":                                                     "图片不存在",
	"image object key is empty":                                           "图片对象存储 key 为空",
	"image object storage is not configured":                              "图片对象存储未配置",
	"image object storage is not initialized":                             "图片对象存储未初始化",
	"image path is not a file":                                            "图片路径不是文件",
	"image service is not initialized":                                    "图片服务未初始化",
	"image task returned no image data":                                   "图片任务没有返回图片数据",
	"input text is required":                                              "缺少输入文本",
	"invalid canvas payload":                                              "画布数据格式无效",
	"invalid endpoint":                                                    "endpoint 无效",
	"invalid fallback_reference_image":                                    "fallback_reference_image 格式无效",
	"invalid image object path":                                           "图片对象路径无效",
	"invalid image path":                                                  "图片路径无效",
	"invalid json body":                                                   "请求体不是有效的 JSON",
	"invalid messages":                                                    "messages 格式无效",
	"invalid multipart form":                                              "multipart 表单无效",
	"invalid payload":                                                     "请求数据格式无效",
	"invalid proxy url":                                                   "代理地址无效",
	"invalid request":                                                     "请求无效",
	"invalid trailing JSON data":                                          "JSON 尾部包含无效数据",
	"invalid thumbnail path":                                              "缩略图路径无效",
	"launch token is required":                                            "缺少启动 token",
	"Linuxdo Client ID is required when enabled":                          "启用 Linuxdo 登录时必须填写 Client ID",
	"Linuxdo Client Secret is required when enabled":                      "启用 Linuxdo 登录时必须填写 Client Secret",
	"Linuxdo Frontend Redirect URL is required when enabled":              "启用 Linuxdo 登录时必须填写前端回调地址",
	"Linuxdo Frontend Redirect URL must be an absolute http(s) URL or a relative path": "Linuxdo 前端回调地址必须是 http(s) 绝对 URL 或相对路径",
	"Linuxdo login is disabled":                                                              "Linuxdo 登录已关闭",
	"Linuxdo login is not configured":                                                        "Linuxdo 登录未配置",
	"Linuxdo login or admin permission required":                                             "需要 Linuxdo 登录或管理员权限",
	"Linuxdo PKCE must be enabled when token auth method is none":                            "token 认证方式为 none 时必须启用 Linuxdo PKCE",
	"Linuxdo Redirect URL is required when enabled":                                          "启用 Linuxdo 登录时必须填写回调地址",
	"Linuxdo Redirect URL must be an absolute http(s) URL":                                   "Linuxdo 回调地址必须是 http(s) 绝对 URL",
	"Linuxdo token auth method must be one of client_secret_post, client_secret_basic, none": "Linuxdo token 认证方式必须是 client_secret_post、client_secret_basic 或 none",
	"Linuxdo user tokens are not managed by administrators":                                  "Linuxdo 用户 Token 不能由管理员管理",
	"login page image cannot exceed 10MB":                                                    "登录页图片不能超过 10MB",
	"login page image file is required":                                                      "缺少登录页图片文件",
	"log maintenance backend is required":                                                    "缺少日志维护后端",
	"log storage backend is required":                                                        "缺少日志存储后端",
	"mail.providers has no enabled provider":                                                 "没有启用的邮箱服务",
	"mail domain is required":                                                                "缺少邮箱域名",
	"mail provider did not return address":                                                   "邮箱服务没有返回邮箱地址",
	"message_id is required for official interpreter asset download":                         "官方解释器资源下载缺少 message_id",
	"messages are required":                                                                  "缺少 messages",
	"messages or prompt is required":                                                         "缺少 messages 或 prompt",
	"missing access_token":                                                                   "缺少 access_token",
	"MoEmail missing email or id":                                                            "MoEmail 响应缺少 email 或 id",
	"MoEmail missing email_id":                                                               "MoEmail 缺少 email_id",
	"moemail api_base is required":                                                           "缺少 MoEmail api_base",
	"n must be between 1 and 4":                                                              "n 必须在 1 到 4 之间",
	"newlines are not allowed":                                                               "不能包含换行符",
	"network unreachable":                                                                    "网络不可达",
	"no account service configured":                                                          "账号服务未配置",
	"no address found":                                                                       "未找到地址",
	"no available image quota":                                                               "当前没有可用的图片额度",
	"no available text access token":                                                         "当前没有可用的文本 access_token",
	"no executable backup found":                                                             "未找到可回滚的可执行文件备份",
	"no update available":                                                                    "当前没有可用更新",
	"no updates provided":                                                                    "没有提供任何更新内容",
	"only HTTPS URLs are allowed":                                                            "只允许 HTTPS URL",
	"owner_id is required":                                                                   "缺少 owner_id",
	"path is required":                                                                       "缺少 path",
	"paths is required":                                                                      "缺少 paths",
	"permission denied":                                                                      "权限不足",
	"pool not found":                                                                         "连接池不存在",
	"preview is required":                                                                    "缺少 preview",
	"profile API key not found":                                                              "个人 API Key 不存在",
	"profile API key requires a bound user account":                                          "个人 API Key 需要绑定用户账号",
	"prompt favorites require a bound user account":                                          "提示词收藏需要绑定用户账号",
	"prompt favorite not found":                                                              "提示词收藏不存在",
	"prompt_id is required":                                                                  "缺少 prompt_id",
	"prompt is required":                                                                     "缺少提示词",
	"proxy url is required":                                                                  "缺少代理地址",
	"quota decrease cannot exceed remaining quota":                                           "减少的配额不能超过剩余配额",
	"quota limit cannot be negative":                                                         "配额上限不能为负数",
	"quota limit is required":                                                                "缺少配额上限",
	"quota period must be daily, weekly, or monthly":                                         "配额周期必须是 daily、weekly 或 monthly",
	"relative path must start with one slash":                                                "相对路径必须以一个斜杠开头",
	"release info is missing":                                                                "缺少 Release 信息",
	"request failed":                                                                         "请求失败",
	"response generation failed":                                                             "生成响应失败",
	"retention days must be between 1 and 3650":                                              "日志保留天数必须在 1 到 3650 之间",
	"role has no users":                                                                      "该角色下没有用户",
	"role id is required":                                                                    "缺少角色 ID",
	"role is assigned to users":                                                              "该角色已分配给用户，不能删除",
	"role not found":                                                                         "角色不存在",
	"run id is required":                                                                     "缺少运行 ID",
	"scope must be mine, public, or all":                                                     "scope 必须是 mine、public 或 all",
	"secret_key is required":                                                                 "缺少 secret_key",
	"selected files is required":                                                             "缺少已选择的文件",
	"server not found":                                                                       "服务器不存在",
	"Service restart initiated":                                                              "服务正在重启",
	"session JSON missing accessToken":                                                       "Session JSON 缺少 accessToken",
	"session JSON missing sessionToken":                                                      "Session JSON 缺少 sessionToken",
	"session account update failed":                                                          "Session 账号更新失败",
	"session response missing accessToken":                                                   "Session 响应缺少 accessToken",
	"session token validation failed":                                                        "Session token 校验失败",
	"session_json is required":                                                               "缺少 session_json",
	"session_token is empty":                                                                 "session_token 为空",
	"scheme must be http or https":                                                           "scheme 必须是 http 或 https",
	"socks authentication failed":                                                            "SOCKS 认证失败",
	"socks credentials are too long":                                                         "SOCKS 凭据过长",
	"socks proxy rejected authentication methods":                                            "SOCKS 代理拒绝认证方式",
	"socks proxy requires username/password authentication":                                  "SOCKS 代理需要用户名和密码认证",
	"source is required":                                                                     "缺少 source",
	"storage document backend is required":                                                   "缺少文档存储后端",
	"sub2api binding is incomplete":                                                          "上游绑定信息不完整",
	"sub2api binding store is unavailable":                                                   "上游绑定存储不可用",
	"sub2api launch is not configured":                                                       "上游启动登录未配置",
	"sub2api launch redeem is not configured":                                                "上游启动兑换未配置",
	"sub2api launch redeem payload is invalid":                                               "上游启动兑换响应格式无效",
	"sub2api launch redeem payload missing api_key.key":                                      "上游启动兑换响应缺少 api_key.key",
	"sub2api launch redeem payload missing gateway_base_url":                                 "上游启动兑换响应缺少 gateway_base_url",
	"sub2api launch redeem payload missing user.id":                                          "上游启动兑换响应缺少 user.id",
	"sub2api login did not return access_token":                                              "上游登录没有返回 access_token",
	"sub2api login payload is invalid":                                                       "上游登录响应格式无效",
	"sub2api server requires email+password or api_key":                                      "上游服务器需要邮箱密码或 api_key",
	"sub2api session was not created":                                                        "上游登录本地会话创建失败",
	"target host is too long":                                                                "目标主机名过长",
	"task returned no output data":                                                           "任务没有返回输出数据",
	"thumbnail unavailable":                                                                  "缩略图不可用",
	"title is required":                                                                      "缺少 title",
	"token exchange callback code not found":                                                 "Token 兑换回调缺少 code",
	"token exchange response missing access_token, refresh_token, or id_token":               "Token 兑换响应缺少 access_token、refresh_token 或 id_token",
	"token response missing access_token":                                                    "Token 响应缺少 access_token",
	"tokens is required":                                                                     "缺少 tokens",
	"tokens or account_ids is required":                                                      "缺少 tokens 或 account_ids",
	"unsupported image file":                                                                 "不支持的图片文件",
	"Update completed. Please restart the service.":                                          "更新已完成，请重启服务。",
	"Update repository must use owner/repo format":                                           "更新仓库必须使用 owner/repo 格式",
	"Rollback completed. Please restart the service.":                                        "回滚已完成，请重启服务。",
	"userinfo missing id field":                                                              "用户信息缺少 id 字段",
	"userinfo returned invalid id field":                                                     "用户信息返回了无效的 id 字段",
	"unsupported image model,supported models: ":                                             "不支持的图片模型，支持的模型：",
	"upstream image request failed without error detail":                                     "上游图片请求失败，未返回错误详情",
	"upstream image stream completed without image output":                                   "上游图片流已结束，但没有返回图片输出",
	"ttl expired":                                                                            "TTL 已过期",
	"raw request failed":                                                                     "原始请求失败",
	"register flow did not return access_token":                                              "注册流程没有返回 access_token",
	"tempmail_lol response missing address or token":                                         "TempMail 响应缺少 address 或 token",
	"unknown error":                                                                          "未知错误",
	"user API key not found":                                                                 "用户 API Key 不存在",
	"user already belongs to a team":                                                         "当前账号已加入团队，不能再创建或加入其他团队",
	"user balance insufficient":                                                              "用户余额不足",
	"user id is required":                                                                    "缺少用户 ID",
	"user ids are required":                                                                  "缺少用户 ID",
	"user key not found":                                                                     "用户 Key 不存在",
	"user not found":                                                                         "用户不存在",
	"user quota exceeded":                                                                    "用户配额不足",
	"user session is required":                                                               "需要用户登录",
	"team id is required":                                                                    "缺少团队 ID",
	"team not found":                                                                         "团队不存在",
	"team permission required":                                                               "需要团队管理权限",
	"invite email is required":                                                               "缺少邀请邮箱",
	"invite email does not match current user":                                               "邀请邮箱与当前登录账号不一致",
	"invite id is required":                                                                  "缺少邀请 ID",
	"invite is not available":                                                                "邀请已失效",
	"invite is not pending":                                                                  "邀请不是待接受状态",
	"invite not found":                                                                       "邀请不存在",
	"vision requires authentication":                                                         "视觉能力需要认证",
	"visibility must be private or public":                                                   "visibility 必须是 private 或 public",
	"waiting for register verification code timed out":                                       "等待注册验证码超时",
	"independent login waiting for verification code timed out":                              "独立登录等待验证码超时",
	"YYDSMail missing address or token":                                                      "YYDSMail 响应缺少 address 或 token",
	"YYDSMail missing token":                                                                 "YYDSMail 缺少 token",
}

// LocalizeErrorMessage returns a Chinese user-facing message while preserving
// technical identifiers such as field names, HTTP status codes, and model IDs.
func LocalizeErrorMessage(message string) string {
	text := strings.TrimSpace(message)
	if text == "" {
		return ""
	}
	if translated, ok := exactErrorTranslations[text]; ok {
		return translated
	}
	lower := strings.ToLower(text)
	if translated, ok := exactErrorTranslations[lower]; ok {
		return translated
	}
	for source, translated := range exactErrorTranslations {
		if strings.HasPrefix(text, source) && strings.HasSuffix(source, ": ") {
			return translated + strings.TrimSpace(strings.TrimPrefix(text, source))
		}
	}
	if detail, ok := localizeStructuredError(text, lower); ok {
		return detail
	}
	return text
}

func LocalizeOpenAIErrorPayload(payload map[string]any) map[string]any {
	if payload == nil {
		return nil
	}
	copied := CopyMap(payload)
	errorBody := StringMap(copied["error"])
	if len(errorBody) == 0 {
		return copied
	}
	errorCopy := CopyMap(errorBody)
	if message := Clean(errorCopy["message"]); message != "" {
		errorCopy["message"] = LocalizeErrorMessage(message)
	}
	copied["error"] = errorCopy
	return copied
}

func localizeStructuredError(text, lower string) (string, bool) {
	switch {
	case strings.Contains(lower, strings.ToLower(UpstreamConnectionFailureMessage)):
		return "上游连接在 TLS 握手前失败，请检查代理是否能访问 chatgpt.com，或更换代理", true
	case strings.Contains(lower, "image generation request rejected by content policy"):
		if reason := suffixAfterAny(text, ": "); reason != "" {
			return "图片生成请求被内容安全策略拒绝：" + reason, true
		}
		return "图片生成请求被内容安全策略拒绝", true
	case strings.Contains(lower, "cloudflare challenge"):
		return "上游返回 Cloudflare 验证页面，请刷新浏览器指纹/会话或更换代理", true
	case strings.Contains(lower, "flow_control_error"):
		return "上游图片流被 HTTP/2 流控中断，请重试；如果反复出现请更换代理", true
	case strings.Contains(lower, "codex-gpt-image-2 需要 plus"):
		return text, true
	case strings.Contains(lower, "an error occurred while processing your request"):
		requestID := regexp.MustCompile(`(?i)request id\s+([a-z0-9-]+)`).FindStringSubmatch(text)
		if len(requestID) > 1 {
			return "上游处理请求失败，请稍后重试。请求 ID：" + requestID[1], true
		}
		return "上游处理请求失败，请稍后重试", true
	case strings.Contains(lower, "no images generated") && strings.Contains(lower, "model may have refused"):
		return "没有生成图片，模型可能拒绝了这次请求，请调整提示词后重试", true
	case strings.Contains(text, "GitHub API returned"):
		return localizeGitHubAPIError(text), true
	}
	if match := regexp.MustCompile(`(?i)^(.+) failed: status=(\d+)(?:,\s*(.*))?$`).FindStringSubmatch(text); len(match) > 0 {
		if len(match) > 3 && strings.TrimSpace(match[3]) != "" {
			return fmt.Sprintf("%s 请求失败：HTTP %s，%s", localizeContextName(match[1]), match[2], strings.TrimSpace(match[3])), true
		}
		return fmt.Sprintf("%s 请求失败：HTTP %s", localizeContextName(match[1]), match[2]), true
	}
	if match := regexp.MustCompile(`(?i)^(.+) failed: HTTP (\d+)(?:\s+(.*))?$`).FindStringSubmatch(text); len(match) > 0 {
		if len(match) > 3 && strings.TrimSpace(match[3]) != "" {
			return fmt.Sprintf("%s 请求失败：HTTP %s，%s", localizeContextName(match[1]), match[2], strings.TrimSpace(match[3])), true
		}
		return fmt.Sprintf("%s 请求失败：HTTP %s", localizeContextName(match[1]), match[2]), true
	}
	if match := regexp.MustCompile(`(?i)^download returned (\d+)$`).FindStringSubmatch(text); len(match) > 0 {
		return "下载失败：HTTP " + match[1], true
	}
	if match := regexp.MustCompile(`(?i)^checksum download returned (\d+)$`).FindStringSubmatch(text); len(match) > 0 {
		return "校验和下载失败：HTTP " + match[1], true
	}
	if match := regexp.MustCompile(`(?i)^download too large: (\d+) bytes$`).FindStringSubmatch(text); len(match) > 0 {
		return "下载文件过大：" + match[1] + " 字节", true
	}
	if match := regexp.MustCompile(`(?i)^download exceeded maximum size of (\d+) bytes$`).FindStringSubmatch(text); len(match) > 0 {
		return "下载超过最大限制：" + match[1] + " 字节", true
	}
	if match := regexp.MustCompile(`(?i)^unsupported image_generation model: (.+)$`).FindStringSubmatch(text); len(match) > 0 {
		return "不支持的 image_generation 模型：" + match[1], true
	}
	if match := regexp.MustCompile(`(?i)^unsupported image model,supported models: (.+)$`).FindStringSubmatch(text); len(match) > 0 {
		return "不支持的图片模型，支持的模型：" + match[1], true
	}
	if match := regexp.MustCompile(`(?i)^HTTP (\d+)$`).FindStringSubmatch(text); len(match) > 0 {
		return "请求失败：HTTP " + match[1], true
	}
	if match := regexp.MustCompile(`(?i)^no compatible release archive found for (.+)$`).FindStringSubmatch(text); len(match) > 0 {
		return "没有找到适用于 " + match[1] + " 的 Release 压缩包", true
	}
	if match := regexp.MustCompile(`(?i)^official interpreter asset (.+) returned non-image content type (.+)$`).FindStringSubmatch(text); len(match) > 0 {
		return "官方解释器资源 " + match[1] + " 返回了非图片内容类型：" + match[2], true
	}
	if match := regexp.MustCompile(`(?i)^official image file (.+) returned empty download URL$`).FindStringSubmatch(text); len(match) > 0 {
		return "官方图片文件 " + match[1] + " 返回了空下载地址", true
	}
	if match := regexp.MustCompile(`(?i)^session endpoint returned (\d+):\s*(.*)$`).FindStringSubmatch(text); len(match) > 0 {
		return "Session 接口返回 HTTP " + match[1] + "：" + strings.TrimSpace(match[2]), true
	}
	if match := regexp.MustCompile(`(?i)^userinfo status=(\d+)$`).FindStringSubmatch(text); len(match) > 0 {
		return "获取用户信息失败：HTTP " + match[1], true
	}
	if match := regexp.MustCompile(`(?i)^tool_choice (.+) requires at least one available tool$`).FindStringSubmatch(text); len(match) > 0 {
		return "tool_choice " + match[1] + " 至少需要一个可用工具", true
	}
	if match := regexp.MustCompile(`(?i)^tool_choice forced (.+) is not an available tool$`).FindStringSubmatch(text); len(match) > 0 {
		return "强制指定的 tool_choice " + match[1] + " 不是可用工具", true
	}
	if match := regexp.MustCompile(`(?i)^tool_choice forced (.+) but model produced (.+)$`).FindStringSubmatch(text); len(match) > 0 {
		return "强制指定 tool_choice " + match[1] + "，但模型返回了 " + match[2], true
	}
	if match := regexp.MustCompile(`(?i)^([a-z_]+)_http_(\d+)(.*)$`).FindStringSubmatch(text); len(match) > 0 {
		detail := strings.TrimSpace(match[3])
		if detail != "" {
			return fmt.Sprintf("%s失败：HTTP %s，%s", localizeRegisterStepName(match[1]), match[2], strings.TrimLeft(detail, ";: ")), true
		}
		return fmt.Sprintf("%s失败：HTTP %s", localizeRegisterStepName(match[1]), match[2]), true
	}
	if match := regexp.MustCompile(`(?i)^sentinel_req_failed_(\d+)$`).FindStringSubmatch(text); len(match) > 0 {
		return "Sentinel 请求失败：HTTP " + match[1], true
	}
	return localizePrefixError(text)
}

func localizePrefixError(text string) (string, bool) {
	prefixes := []struct {
		source string
		target string
	}{
		{"archive entry too large: ", "压缩包条目过大："},
		{"backup current executable: ", "备份当前可执行文件失败："},
		{"backup executable: ", "备份可执行文件失败："},
		{"checksum mismatch: ", "校验和不匹配："},
		{"checksum not found for ", "未找到校验和："},
		{"chmod updated binary: ", "设置更新后可执行文件权限失败："},
		{"create request: ", "创建请求失败："},
		{"create update temp dir: ", "创建更新临时目录失败："},
		{"decode userinfo: ", "解析用户信息失败："},
		{"delete image object: ", "删除图片对象失败："},
		{"download failed: ", "下载失败："},
		{"download from untrusted host: ", "下载地址主机不受信任："},
		{"edge source node not found: ", "边的源节点不存在："},
		{"edge target node not found: ", "边的目标节点不存在："},
		{"extraction failed: ", "解压失败："},
		{"failed to solve proof token: ", "计算 proof token 失败："},
		{"get executable path: ", "获取可执行文件路径失败："},
		{"http request: ", "HTTP 请求失败："},
		{"image decode failed: ", "图片解码失败："},
		{"invalid archive path: ", "压缩包路径无效："},
		{"invalid checksum URL: ", "校验和 URL 无效："},
		{"invalid document name: ", "文档名称无效："},
		{"invalid download URL: ", "下载 URL 无效："},
		{"invalid socks address type ", "SOCKS 地址类型无效："},
		{"invalid socks version ", "SOCKS 版本无效："},
		{"invalid target port ", "目标端口无效："},
		{"invalid URL: ", "URL 无效："},
		{"latest GitHub Release was not found for ", "未找到 latest GitHub Release："},
		{"load object storage config: ", "加载对象存储配置失败："},
		{"mail request failed: ", "邮箱请求失败："},
		{"missing auth chat requirements token: ", "认证 chat requirements 缺少 token："},
		{"missing chat requirements token: ", "chat requirements 缺少 token："},
		{"no address found for ", "未找到地址："},
		{"parse authorize url: ", "解析授权 URL 失败："},
		{"parse session response: ", "解析 Session 响应失败："},
		{"put image object: ", "上传图片对象失败："},
		{"read body: ", "读取响应体失败："},
		{"release archive does not contain ", "Release 压缩包缺少 "},
		{"replace executable: ", "替换可执行文件失败："},
		{"request token: ", "请求 token 失败："},
		{"request userinfo: ", "请求用户信息失败："},
		{"resolve executable path: ", "解析可执行文件路径失败："},
		{"restore executable backup: ", "恢复可执行文件备份失败："},
		{"remote list failed: ", "远程列表请求失败："},
		{"selected node not found: ", "选中的节点不存在："},
		{"socks connect failed: ", "SOCKS 连接失败："},
		{"sub2api launch redeem failed: ", "上游启动兑换失败："},
		{"sub2api login failed: ", "上游登录失败："},
		{"sub2api request failed: ", "上游请求失败："},
		{"unknown node type: ", "未知节点类型："},
		{"unknown storage backend: ", "未知存储后端："},
		{"unsafe archive path: ", "压缩包路径不安全："},
		{"unsupported archive format: ", "不支持的压缩包格式："},
		{"unsupported billing adjustment type: ", "不支持的计费调整类型："},
		{"unsupported billing target scope: ", "不支持的计费目标范围："},
		{"unsupported billing type: ", "不支持的计费类型："},
		{"unsupported mail.provider: ", "不支持的 mail.provider："},
		{"unsupported token auth method: ", "不支持的 token 认证方式："},
		{"unsupported token_type: ", "不支持的 token_type："},
		{"user not found: ", "用户不存在："},
		{"YYDSMail request failed: ", "YYDSMail 请求失败："},
	}
	lower := strings.ToLower(text)
	for _, item := range prefixes {
		if strings.HasPrefix(lower, strings.ToLower(item.source)) {
			return item.target + LocalizeErrorMessage(strings.TrimSpace(text[len(item.source):])), true
		}
	}
	return "", false
}

func localizeGitHubAPIError(text string) string {
	replacer := strings.NewReplacer(
		"GitHub API returned", "GitHub API 返回",
		"latest GitHub Release was not found for", "未找到 latest GitHub Release：",
		"publish a GitHub Release with release archives, configure CHATGPT2API_UPDATE_REPO to the repository that contains releases, or ensure the GitHub token can read the repository", "请发布包含 Release 压缩包的 GitHub Release，或把 CHATGPT2API_UPDATE_REPO 配置为包含 Release 的仓库，并确认 GitHub Token 有读取权限",
		"GitHub API rate limit exhausted", "GitHub API 额度已耗尽",
		"reset at", "重置时间",
		"set CHATGPT2API_UPDATE_GITHUB_TOKEN to use authenticated GitHub API requests", "请设置 CHATGPT2API_UPDATE_GITHUB_TOKEN 使用已认证的 GitHub API 请求",
	)
	return replacer.Replace(text)
}

func suffixAfterAny(text string, sep string) string {
	if index := strings.Index(text, sep); index >= 0 {
		return strings.TrimSpace(text[index+len(sep):])
	}
	return ""
}

func localizeContextName(value string) string {
	text := strings.TrimSpace(value)
	switch text {
	case "bootstrap":
		return "初始化"
	case "image_upload":
		return "图片上传"
	case "image_download":
		return "图片下载"
	default:
		return text
	}
}

func localizeRegisterStepName(value string) string {
	switch strings.TrimSpace(value) {
	case "create_account":
		return "创建账号"
	case "email_submit":
		return "提交邮箱"
	case "oauth_token":
		return "OAuth token"
	case "organization_select":
		return "选择组织"
	case "password_verify":
		return "验证密码"
	case "platform_authorize", "platform_login_authorize":
		return "平台授权"
	case "send_otp":
		return "发送验证码"
	case "user_register":
		return "用户注册"
	case "validate_otp":
		return "验证验证码"
	case "workspace_select":
		return "选择工作区"
	default:
		return value
	}
}
