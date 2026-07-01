package websearch

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"chatgpt2api/internal/config"
	"chatgpt2api/internal/util"
)

const maxResponseBytes = 1 << 20

type Client struct {
	config config.WebSearchConfig
	http   *http.Client
}

type Result struct {
	Title   string
	URL     string
	Snippet string
}

func NewClient(cfg config.WebSearchConfig) *Client {
	timeout := cfg.Timeout
	if timeout <= 0 {
		timeout = 8 * time.Second
	}
	return &Client{
		config: cfg,
		http:   &http.Client{Timeout: timeout},
	}
}

func (c *Client) Ready() bool {
	return c != nil && c.config.Ready()
}

func (c *Client) Search(ctx context.Context, query string) ([]Result, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, fmt.Errorf("搜索关键词为空")
	}
	if c == nil || !c.config.Ready() {
		return nil, fmt.Errorf("网络搜索未配置：请设置 CHATGPT2API_WEB_SEARCH_URL")
	}
	req, err := c.buildRequest(ctx, query)
	if err != nil {
		return nil, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("网络搜索请求失败: %w", err)
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))
	if err != nil {
		return nil, fmt.Errorf("读取网络搜索响应失败: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("网络搜索服务返回 HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(data)))
	}
	var payload any
	if err := json.Unmarshal(data, &payload); err != nil {
		return nil, fmt.Errorf("解析网络搜索响应失败: %w", err)
	}
	results := extractResults(payload, c.config.MaxResults)
	if len(results) == 0 {
		return nil, fmt.Errorf("网络搜索没有返回可用结果")
	}
	return results, nil
}

func (c *Client) buildRequest(ctx context.Context, query string) (*http.Request, error) {
	method := c.config.Method
	if method == "" {
		method = http.MethodGet
	}
	endpoint := strings.TrimSpace(c.config.EndpointURL)
	if endpoint == "" {
		return nil, fmt.Errorf("网络搜索未配置：请设置 CHATGPT2API_WEB_SEARCH_URL")
	}
	var body io.Reader
	if method == http.MethodPost {
		payload := map[string]any{"query": query, "q": query}
		data, _ := json.Marshal(payload)
		body = bytes.NewReader(data)
	} else if strings.Contains(endpoint, "{query}") {
		endpoint = strings.ReplaceAll(endpoint, "{query}", url.QueryEscape(query))
	} else {
		u, err := url.Parse(endpoint)
		if err != nil {
			return nil, fmt.Errorf("网络搜索 URL 无效: %w", err)
		}
		q := u.Query()
		if q.Get("q") == "" && q.Get("query") == "" {
			q.Set("q", query)
		}
		u.RawQuery = q.Encode()
		endpoint = u.String()
	}
	req, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if method == http.MethodPost {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.config.HeaderName != "" && c.config.HeaderValue != "" {
		req.Header.Set(c.config.HeaderName, c.config.HeaderValue)
	}
	return req, nil
}

func PromptContext(results []Result) string {
	if len(results) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString("以下是本轮联网搜索结果。回答时优先依据这些结果；如果结果不足或可能过期，请明确说明。引用事实时给出来源标题和 URL。\n")
	for i, item := range results {
		b.WriteString(fmt.Sprintf("\n[%d] %s\nURL: %s", i+1, item.Title, item.URL))
		if item.Snippet != "" {
			b.WriteString("\n摘要: ")
			b.WriteString(item.Snippet)
		}
		b.WriteByte('\n')
	}
	return strings.TrimSpace(b.String())
}

func InjectMessages(messages []map[string]any, searchContext string) []map[string]any {
	searchContext = strings.TrimSpace(searchContext)
	if searchContext == "" {
		return messages
	}
	out := make([]map[string]any, 0, len(messages)+1)
	out = append(out, map[string]any{"role": "system", "content": searchContext})
	out = append(out, messages...)
	return out
}

func extractResults(payload any, limit int) []Result {
	if limit <= 0 {
		limit = 5
	}
	var out []Result
	seen := map[string]struct{}{}
	var walk func(any)
	walk = func(value any) {
		if len(out) >= limit {
			return
		}
		switch typed := value.(type) {
		case []any:
			for _, item := range typed {
				walk(item)
				if len(out) >= limit {
					return
				}
			}
		case map[string]any:
			if result, ok := resultFromMap(typed); ok {
				key := strings.ToLower(result.URL + "\x00" + result.Title)
				if _, exists := seen[key]; !exists {
					seen[key] = struct{}{}
					out = append(out, result)
				}
				return
			}
			for _, key := range []string{"results", "items", "organic", "value", "webPages"} {
				if len(out) >= limit {
					return
				}
				child, ok := typed[key]
				if !ok {
					continue
				}
				if key == "webPages" {
					if m := util.StringMap(child); len(m) > 0 {
						walk(m["value"])
						continue
					}
				}
				walk(child)
			}
		}
	}
	walk(payload)
	return out
}

func resultFromMap(item map[string]any) (Result, bool) {
	title := firstText(item, "title", "name")
	link := firstText(item, "url", "link", "href")
	snippet := firstText(item, "snippet", "description", "content", "summary")
	if title == "" && snippet == "" {
		return Result{}, false
	}
	if link == "" {
		return Result{}, false
	}
	return Result{
		Title:   truncate(title, 180),
		URL:     truncate(link, 500),
		Snippet: truncate(snippet, 600),
	}, true
}

func firstText(item map[string]any, keys ...string) string {
	for _, key := range keys {
		text := strings.TrimSpace(util.Clean(item[key]))
		if text != "" {
			return text
		}
	}
	return ""
}

func truncate(value string, limit int) string {
	value = strings.Join(strings.Fields(value), " ")
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[:limit]) + "..."
}
