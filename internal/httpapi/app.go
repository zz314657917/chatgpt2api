package httpapi

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"chatgpt2api/internal/config"
	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
	"chatgpt2api/internal/version"
	frontend "chatgpt2api/internal/web"

	_ "github.com/HugoSmits86/nativewebp"
)

const (
	maxLoginPageImageSize      = 10 << 20
	maxJSONImageReferenceSize  = 50 << 20
	maxJSONImageURLRedirects   = 5
	imageThumbnailCacheControl = "public, max-age=31536000, immutable"
	authSessionCookieName      = "chatgpt2api_session"
	imageMaxSavedPerUserLimit  = 30
)

type App struct {
	config       *config.Store
	auth         *service.AuthService
	accounts     *service.AccountService
	billing      *service.BillingService
	logs         *service.LogService
	logger       *service.Logger
	proxy        *service.ProxyService
	engine       *protocol.Engine
	images       *service.ImageService
	textAssets   *service.TextAssetService
	tasks        *service.ImageTaskService
	analytics    *service.AnalyticsService
	canvases     *service.CanvasService
	social       *service.SocialProjectService
	announce     *service.AnnouncementService
	prompts      *service.PromptFavoriteService
	cpa          *service.CPAConfig
	cpaImport    *service.CPAImportService
	sub2         *service.Sub2APIConfig
	sub2Import   *service.Sub2APIService
	sub2Bindings *service.Sub2APIBindingStore
	sub2Launch   *service.Sub2APILaunchService
	teams        *service.TeamService
	register     *service.RegisterService
	update       *service.UpdateService
	cancel       context.CancelFunc
}

func NewApp() (*App, error) {
	cfg, err := config.NewStore()
	if err != nil {
		return nil, err
	}
	storageBackend, err := cfg.StorageBackend()
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	logs := service.NewLogService(storageBackend)
	logger, err := service.NewLogger(cfg.DataDir, cfg.LogLevels)
	if err != nil {
		cancel()
		return nil, err
	}
	proxy := service.NewProxyService(cfg)
	accounts := service.NewAccountService(storageBackend, cfg, proxy, logs)
	auth := service.NewAuthService(storageBackend)
	billing := service.NewBillingService(storageBackend, cfg)
	auth.SetUserCreatedHook(func(userID string) {
		billing.InitializeUserDefaults(userID)
	})
	bootstrap, err := auth.EnsureBootstrapAdmin(cfg.AdminUsername(), cfg.AdminPassword())
	if err != nil {
		cancel()
		return nil, err
	}
	if bootstrap.Created && bootstrap.Generated {
		fmt.Fprintf(os.Stderr, "bootstrap admin password generated: username=%s password=%s\n", bootstrap.Username, bootstrap.Password)
		logger.Warning("bootstrap admin password generated", "username", bootstrap.Username)
	}
	documentStore, _ := storageBackend.(storage.JSONDocumentBackend)
	sub2Bindings := service.NewSub2APIBindingStore(documentStore)
	imageSessions := service.NewImageConversationSessionService(filepath.Join(cfg.DataDir, "image_conversation_sessions.json"), storageBackend)
	engine := &protocol.Engine{Accounts: accounts, Config: cfg, Storage: documentStore, Proxy: proxy, Logger: logger, ImageConversationSessions: imageSessions}
	teams := service.NewTeamService(storageBackend)
	teams.SetUserEmailLookup(func(ownerID string) string {
		binding, ok := sub2Bindings.Get(ownerID)
		if !ok {
			return ""
		}
		return binding.UserEmail
	})
	teams.SetUserNameLookup(func(ownerID string) string {
		return auth.DisplayNameForUser(ownerID)
	})
	images := service.NewImageService(cfg, storageBackend)
	images.SetLogger(logger)
	app := &App{config: cfg, auth: auth, accounts: accounts, billing: billing, logs: logs, logger: logger, proxy: proxy, engine: engine, images: images, textAssets: service.NewTextAssetService(storageBackend), analytics: service.NewAnalyticsService(storageBackend), canvases: service.NewCanvasService(storageBackend), social: service.NewSocialProjectService(storageBackend), announce: service.NewAnnouncementService(storageBackend), prompts: service.NewPromptFavoriteService(storageBackend), cpa: service.NewCPAConfig(storageBackend), sub2: service.NewSub2APIConfig(storageBackend), sub2Bindings: sub2Bindings, teams: teams, update: newUpdateService(cfg), cancel: cancel}
	app.cpaImport = service.NewCPAImportService(app.cpa, accounts, proxy)
	app.sub2Import = service.NewSub2APIService(app.sub2, accounts)
	app.sub2Launch = service.NewSub2APILaunchService(auth, sub2Bindings, cfg)
	app.register = service.NewRegisterService(accounts, storageBackend)
	app.tasks = service.NewStoredImageTaskService(storageBackend,
		func(ctx context.Context, identity service.Identity, payload map[string]any) (map[string]any, error) {
			if binding, ok := app.sub2APIBindingForMode(ctx, identity, "generate"); ok {
				return app.runLoggedSub2APIImageGenerationTask(ctx, identity, payload, binding)
			}
			if identity.Provider == service.AuthProviderSub2API {
				return nil, sub2APIKeyBindingRequiredError()
			}
			return app.runLoggedImageTask(ctx, identity, payload, "/api/creation-tasks/image-generations", "文生图", func(ctx context.Context, payload map[string]any) (map[string]any, error) {
				result, _, err := engine.HandleImageGenerations(ctx, payload)
				return result, err
			})
		},
		func(ctx context.Context, identity service.Identity, payload map[string]any) (map[string]any, error) {
			if binding, ok := app.sub2APIBindingForMode(ctx, identity, "edit"); ok {
				return app.runLoggedSub2APIImageEditTask(ctx, identity, payload, binding)
			}
			if identity.Provider == service.AuthProviderSub2API {
				return nil, sub2APIKeyBindingRequiredError()
			}
			return app.runLoggedImageTask(ctx, identity, payload, "/api/creation-tasks/image-edits", "图生图", func(ctx context.Context, payload map[string]any) (map[string]any, error) {
				images, _ := payload["images"].([]protocol.UploadedImage)
				result, _, err := engine.HandleImageEdits(ctx, payload, images)
				return result, err
			})
		},
		func(ctx context.Context, identity service.Identity, payload map[string]any) (map[string]any, error) {
			if binding, ok := app.sub2APIBindingForMode(ctx, identity, "chat"); ok {
				return app.runLoggedSub2APIChatTask(ctx, identity, payload, binding)
			}
			if identity.Provider == service.AuthProviderSub2API {
				return nil, sub2APIKeyBindingRequiredError()
			}
			return app.runLoggedChatTask(ctx, identity, payload)
		},
		cfg.ImageRetentionDays,
		cfg.UserDefaultConcurrentLimit,
		cfg.UserDefaultRPMLimit,
	)
	app.tasks.SetVideoHandler(func(ctx context.Context, identity service.Identity, payload map[string]any) (map[string]any, error) {
		if binding, ok := app.sub2APIBindingForMode(ctx, identity, "video"); ok {
			return app.runLoggedSub2APIVideoTask(ctx, identity, payload, binding)
		}
		return nil, sub2APIKeyBindingRequiredError()
	})
	app.tasks.SetBillingService(billing)
	if cfg.LuoyeIndependentMode() {
		app.tasks.SetExternalBilling(app)
	}
	app.tasks.SetTeamDailyLimitGetter(app.teams.MemberDailyLimitAmount)
	app.tasks.SetTaskTimeoutGetter(func() time.Duration {
		return time.Duration(app.config.ImageTaskTimeoutSeconds()) * time.Second
	})
	accounts.StartLimitedWatcher(ctx, time.Duration(cfg.RefreshAccountIntervalMinute())*time.Minute)
	logs.StartRetentionCleaner(ctx, cfg.LogRetentionDays, 24*time.Hour, logger)
	_, _ = app.images.CleanupStorage(service.ImageStorageCleanupOptions{
		RetentionDays:    cfg.ImageRetentionDays(),
		MaxBytes:         cfg.ImageStorageLimitBytes(),
		MaxImagesPerUser: cfg.ImageMaxSavedPerUser(),
	})
	return app, nil
}

func newUpdateService(cfg *config.Store) *service.UpdateService {
	return service.NewUpdateService(service.UpdateOptions{
		CurrentVersion: version.Get(),
		BuildType:      version.GetBuildType(),
		Repo:           cfg.UpdateRepo(),
		ProxyURL:       cfg.UpdateProxyURL(),
		GitHubToken:    cfg.UpdateGitHubToken(),
	})
}

func (a *App) Close() {
	if a.cancel != nil {
		a.cancel()
	}
	if a.logger != nil {
		_ = a.logger.Close()
	}
	if a.config != nil {
		if backend, err := a.config.StorageBackend(); err == nil {
			if closer, ok := backend.(interface{ Close() error }); ok {
				_ = closer.Close()
			}
		}
	}
}

func (a *App) Logger() *service.Logger {
	return a.logger
}

func (a *App) handleModels(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	if a.blockIndependentProtocolForUser(w, identity) {
		return
	}
	result, err := a.engine.ListModels(r.Context())
	a.writeProtocol(w, r, result, nil, err, "openai", "/v1/models", "models", identity, "模型列表", service.ImageVisibilityPrivate, service.BillingReference{})
}

func (a *App) handleImageGenerations(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	if a.blockIndependentProtocolForUser(w, identity) {
		return
	}
	body, err := readJSONMap(r)
	if err != nil {
		writeOpenAIError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	body["owner_id"] = identityScope(identity)
	body["owner_name"] = identityDisplayName(identity)
	body["base_url"] = a.resolveImageBaseURL(r)
	a.attachFallbackReferenceImage(identity, body)
	a.attachCreationTaskLimiter(body, identity)
	visibility, err := service.NormalizePrivateImageVisibility(util.Clean(body["visibility"]))
	if err != nil {
		writeOpenAIError(w, http.StatusBadRequest, err.Error())
		return
	}
	model := firstNonEmpty(util.Clean(body["model"]), util.ImageModelAuto)
	billingUnitAmount := protocolImageBillingUnitAmount(model, body)
	if err := a.checkProtocolBilling(identity, protocolBillableUnits("/v1/images/generations", body)*billingUnitAmount); err != nil {
		a.writeProtocol(w, r, nil, nil, err, "openai", "/v1/images/generations", model, identity, "文生图", visibility, service.BillingReference{})
		return
	}
	billingRef := a.protocolBillingReference(identity, "/v1/images/generations", model)
	a.attachProtocolBillingCharger(body, identity, billingRef, billingUnitAmount)
	result, stream, err := a.engine.HandleImageGenerations(r.Context(), body)
	a.writeProtocol(w, r, result, stream, err, "openai", "/v1/images/generations", model, identity, "文生图", visibility, billingRef, body)
}

func (a *App) handleImageEdits(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	if a.blockIndependentProtocolForUser(w, identity) {
		return
	}
	body, images, err := a.readImageEditBody(r, identity)
	if err != nil {
		writeOpenAIError(w, http.StatusBadRequest, err.Error())
		return
	}
	if n := util.ToInt(body["n"], 1); n < 1 || n > 4 {
		writeOpenAIError(w, http.StatusBadRequest, "n must be between 1 and 4")
		return
	}
	if len(images) == 0 {
		writeOpenAIError(w, http.StatusBadRequest, "image file or image_url is required")
		return
	}
	body["owner_id"] = identityScope(identity)
	body["owner_name"] = identityDisplayName(identity)
	body["base_url"] = a.resolveImageBaseURL(r)
	a.attachFallbackReferenceImage(identity, body)
	a.attachCreationTaskLimiter(body, identity)
	body["images"] = images
	visibility, err := service.NormalizePrivateImageVisibility(util.Clean(body["visibility"]))
	if err != nil {
		writeOpenAIError(w, http.StatusBadRequest, err.Error())
		return
	}
	model := firstNonEmpty(util.Clean(body["model"]), util.ImageModelAuto)
	billingUnitAmount := protocolImageBillingUnitAmount(model, body)
	if err := a.checkProtocolBilling(identity, protocolBillableUnits("/v1/images/edits", body)*billingUnitAmount); err != nil {
		a.writeProtocol(w, r, nil, nil, err, "openai", "/v1/images/edits", model, identity, "图生图", visibility, service.BillingReference{})
		return
	}
	billingRef := a.protocolBillingReference(identity, "/v1/images/edits", model)
	a.attachProtocolBillingCharger(body, identity, billingRef, billingUnitAmount)
	result, stream, err := a.engine.HandleImageEdits(r.Context(), body, images)
	a.writeProtocol(w, r, result, stream, err, "openai", "/v1/images/edits", model, identity, "图生图", visibility, billingRef, body)
}

func (a *App) handleChatCompletions(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	if a.blockIndependentProtocolForUser(w, identity) {
		return
	}
	body, err := readJSONMap(r)
	if err != nil {
		writeOpenAIError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	body["owner_id"] = identityScope(identity)
	body["owner_name"] = identityDisplayName(identity)
	a.attachCreationTaskLimiter(body, identity)
	model := firstNonEmpty(util.Clean(body["model"]), util.ImageModelAuto)
	billingUnitAmount := protocolImageBillingUnitAmount(model, body)
	if err := a.checkProtocolBilling(identity, protocolBillableUnits("/v1/chat/completions", body)*billingUnitAmount); err != nil {
		a.writeProtocol(w, r, nil, nil, err, "openai", "/v1/chat/completions", model, identity, "文本生成", service.ImageVisibilityPrivate, service.BillingReference{})
		return
	}
	billingRef := a.protocolBillingReference(identity, "/v1/chat/completions", model)
	a.attachProtocolBillingCharger(body, identity, billingRef, billingUnitAmount)
	ctx, _ := protocol.WithAccountUsageTracker(r.Context())
	r = r.WithContext(ctx)
	result, stream, err := a.engine.HandleChatCompletions(ctx, body)
	a.writeProtocol(w, r, result, stream, err, "openai", "/v1/chat/completions", model, identity, "文本生成", service.ImageVisibilityPrivate, billingRef)
}

func (a *App) handleResponses(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	if a.blockIndependentProtocolForUser(w, identity) {
		return
	}
	body, err := readJSONMap(r)
	if err != nil {
		writeOpenAIError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	body["owner_id"] = identityScope(identity)
	body["owner_name"] = identityDisplayName(identity)
	a.attachCreationTaskLimiter(body, identity)
	model := firstNonEmpty(util.Clean(body["model"]), util.ImageModelAuto)
	billingUnitAmount := protocolImageBillingUnitAmount(model, body)
	if err := a.checkProtocolBilling(identity, protocolBillableUnits("/v1/responses", body)*billingUnitAmount); err != nil {
		a.writeProtocol(w, r, nil, nil, err, "openai", "/v1/responses", model, identity, "Responses", service.ImageVisibilityPrivate, service.BillingReference{})
		return
	}
	billingRef := a.protocolBillingReference(identity, "/v1/responses", model)
	a.attachProtocolBillingCharger(body, identity, billingRef, billingUnitAmount)
	ctx, _ := protocol.WithAccountUsageTracker(r.Context())
	r = r.WithContext(ctx)
	result, stream, err := a.engine.HandleResponsesScoped(ctx, body, identityScope(identity))
	a.writeProtocol(w, r, result, stream, err, "openai", "/v1/responses", model, identity, "Responses", service.ImageVisibilityPrivate, billingRef)
}

func (a *App) handleMessages(w http.ResponseWriter, r *http.Request) {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" && r.Header.Get("x-api-key") != "" {
		authHeader = "Bearer " + r.Header.Get("x-api-key")
	}
	identity, ok := a.requireIdentity(w, r, authHeader)
	if !ok {
		return
	}
	if a.blockIndependentProtocolForUser(w, identity) {
		return
	}
	body, err := readJSONMap(r)
	if err != nil {
		writeOpenAIError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	model := firstNonEmpty(util.Clean(body["model"]), util.ImageModelAuto)
	ctx, _ := protocol.WithAccountUsageTracker(r.Context())
	r = r.WithContext(ctx)
	result, stream, err := a.engine.HandleMessages(ctx, body)
	a.writeProtocol(w, r, result, stream, err, "anthropic", "/v1/messages", model, identity, "Messages", service.ImageVisibilityPrivate, service.BillingReference{})
}

func (a *App) blockIndependentProtocolForUser(w http.ResponseWriter, identity service.Identity) bool {
	if a == nil || a.config == nil || !a.config.LuoyeIndependentMode() {
		return false
	}
	if identity.Role != service.AuthRoleUser || identity.Provider != service.AuthProviderSub2API {
		return false
	}
	writeOpenAIError(w, http.StatusForbidden, "protocol api is disabled in independent mode")
	return true
}

func (a *App) writeProtocol(w http.ResponseWriter, r *http.Request, result map[string]any, stream *protocol.StreamResult, err error, sseKind, endpoint, model string, identity service.Identity, summary, visibility string, billingRef service.BillingReference, imagePayloads ...map[string]any) {
	start := time.Now()
	requestCapture := requestAuditCapture(r.Context())
	if err != nil {
		a.logCall(r.Context(), identity, summary, r.Method, endpoint, model, start, "failed", protocolErrorHTTPStatus(err), err.Error(), nil, requestCapture)
		markRequestBusinessLogged(r)
		a.writeProtocolError(w, err)
		return
	}
	if stream == nil {
		urls := collectURLs(result)
		a.recordProtocolGeneratedImages(identity, collectImageRecordURLs(result), visibility, imagePayloads...)
		a.logCall(r.Context(), identity, summary, r.Method, endpoint, model, start, "success", http.StatusOK, "", urls, requestCapture)
		markRequestBusinessLogged(r)
		util.WriteJSON(w, http.StatusOK, result)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	flusher, _ := w.(http.Flusher)
	if stream.Kind == "anthropic" || sseKind == "anthropic" {
		var urls []string
		var recordURLs []string
		for item := range stream.Items {
			urls = append(urls, collectURLs(item)...)
			recordURLs = append(recordURLs, collectImageRecordURLs(item)...)
			event := firstNonEmpty(util.Clean(item["type"]), "message_delta")
			fmt.Fprintf(w, "event: %s\n", event)
			fmt.Fprintf(w, "data: %s\n\n", jsonString(item))
			if flusher != nil {
				flusher.Flush()
			}
		}
		if err := <-stream.Err; err != nil {
			a.recordProtocolGeneratedImages(identity, recordURLs, visibility, imagePayloads...)
			a.logCall(r.Context(), identity, summary, r.Method, endpoint, model, start, "failed", protocolErrorHTTPStatus(err), err.Error(), urls, requestCapture)
			markRequestBusinessLogged(r)
			fmt.Fprintf(w, "event: error\n")
			fmt.Fprintf(w, "data: %s\n\n", jsonString(openAIErrorForStream(err)))
			return
		}
		a.recordProtocolGeneratedImages(identity, recordURLs, visibility, imagePayloads...)
		a.logCall(r.Context(), identity, summary, r.Method, endpoint, model, start, "success", http.StatusOK, "", urls, requestCapture)
		markRequestBusinessLogged(r)
		return
	}
	fmt.Fprint(w, ": stream-open\n\n")
	if flusher != nil {
		flusher.Flush()
	}
	var urls []string
	var recordURLs []string
	for item := range stream.Items {
		urls = append(urls, collectURLs(item)...)
		recordURLs = append(recordURLs, collectImageRecordURLs(item)...)
		fmt.Fprintf(w, "data: %s\n\n", jsonString(item))
		if flusher != nil {
			flusher.Flush()
		}
	}
	if err := <-stream.Err; err != nil {
		a.recordProtocolGeneratedImages(identity, recordURLs, visibility, imagePayloads...)
		a.logCall(r.Context(), identity, summary, r.Method, endpoint, model, start, "failed", protocolErrorHTTPStatus(err), err.Error(), urls, requestCapture)
		markRequestBusinessLogged(r)
		fmt.Fprintf(w, "data: %s\n\n", jsonString(openAIErrorForStream(err)))
	} else {
		a.recordProtocolGeneratedImages(identity, recordURLs, visibility, imagePayloads...)
		a.logCall(r.Context(), identity, summary, r.Method, endpoint, model, start, "success", http.StatusOK, "", urls, requestCapture)
		markRequestBusinessLogged(r)
	}
	fmt.Fprint(w, "data: [DONE]\n\n")
}

func protocolErrorHTTPStatus(err error) int {
	err = service.NormalizeImageRequestError(err)
	var httpErr protocol.HTTPError
	if errors.As(err, &httpErr) {
		return httpErr.Status
	}
	var policyErr service.ImageContentPolicyError
	if errors.As(err, &policyErr) {
		return http.StatusBadRequest
	}
	var tooLargeErr service.ImageTooLargeError
	if errors.As(err, &tooLargeErr) {
		return http.StatusBadRequest
	}
	var billingErr service.BillingLimitError
	if errors.As(err, &billingErr) {
		return http.StatusTooManyRequests
	}
	var imageErr *protocol.ImageGenerationError
	if errors.As(err, &imageErr) {
		return imageErr.StatusCode
	}
	message := err.Error()
	if strings.Contains(strings.ToLower(message), "no available image quota") {
		return http.StatusTooManyRequests
	}
	return http.StatusBadGateway
}

func (a *App) writeProtocolError(w http.ResponseWriter, err error) {
	err = service.NormalizeImageRequestError(err)
	var httpErr protocol.HTTPError
	if errors.As(err, &httpErr) {
		writeOpenAIError(w, httpErr.Status, httpErr.Message)
		return
	}
	var policyErr service.ImageContentPolicyError
	if errors.As(err, &policyErr) {
		util.WriteJSON(w, http.StatusBadRequest, util.LocalizeOpenAIErrorPayload(policyErr.OpenAIError()))
		return
	}
	var tooLargeErr service.ImageTooLargeError
	if errors.As(err, &tooLargeErr) {
		util.WriteJSON(w, http.StatusBadRequest, util.LocalizeOpenAIErrorPayload(tooLargeErr.OpenAIError()))
		return
	}
	var billingErr service.BillingLimitError
	if errors.As(err, &billingErr) {
		util.WriteJSON(w, http.StatusTooManyRequests, util.LocalizeOpenAIErrorPayload(billingErr.OpenAIError()))
		return
	}
	var imageErr *protocol.ImageGenerationError
	if errors.As(err, &imageErr) {
		util.WriteJSON(w, imageErr.StatusCode, util.LocalizeOpenAIErrorPayload(imageErr.OpenAIError()))
		return
	}
	message := err.Error()
	if strings.Contains(strings.ToLower(message), "no available image quota") {
		util.WriteJSON(w, http.StatusTooManyRequests, map[string]any{"error": map[string]any{"message": util.LocalizeErrorMessage("no available image quota"), "type": "insufficient_quota", "param": nil, "code": "insufficient_quota"}})
		return
	}
	writeOpenAIError(w, http.StatusBadGateway, message)
}

func writeOpenAIError(w http.ResponseWriter, status int, message string) {
	if status <= 0 {
		status = http.StatusBadRequest
	}
	util.WriteJSON(w, status, map[string]any{
		"error": map[string]any{
			"message": util.LocalizeErrorMessage(message),
			"type":    openAIErrorTypeForStatus(status),
			"param":   nil,
			"code":    openAIErrorCodeForStatus(status),
		},
	})
}

func openAIErrorTypeForStatus(status int) string {
	switch {
	case status == http.StatusUnauthorized:
		return "authentication_error"
	case status == http.StatusForbidden:
		return "permission_error"
	case status == http.StatusTooManyRequests:
		return "rate_limit_error"
	case status >= 500:
		return "server_error"
	default:
		return "invalid_request_error"
	}
}

func openAIErrorCodeForStatus(status int) any {
	switch {
	case status == http.StatusUnauthorized:
		return "invalid_api_key"
	case status == http.StatusForbidden:
		return "permission_denied"
	case status == http.StatusTooManyRequests:
		return "rate_limit_exceeded"
	case status >= 500:
		return "server_error"
	default:
		return nil
	}
}

func (a *App) handleLogin(w http.ResponseWriter, r *http.Request) {
	if a.luoyeIndependentMode() {
		util.WriteError(w, http.StatusForbidden, "local login is disabled in independent mode")
		return
	}
	body, err := readJSONMap(r)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	identity, token, err := a.auth.LoginPassword(util.Clean(body["username"]), util.Clean(body["password"]))
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	setAuthSessionCookie(w, r, token)
	a.writeLoginResponse(w, *identity, token)
}

func (a *App) handleSession(w http.ResponseWriter, r *http.Request) {
	started := time.Now()
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		a.logFrontendCriticalRequest(r, "auth_session", started, http.StatusUnauthorized)
		return
	}
	if token := requestBearerToken(r); token != "" {
		setAuthSessionCookie(w, r, token)
	}
	a.writeLoginResponse(w, identity, "")
	a.logFrontendCriticalRequest(r, "auth_session", started, http.StatusOK)
}

func (a *App) handleAccountRegister(w http.ResponseWriter, r *http.Request) {
	if a.luoyeIndependentMode() {
		util.WriteError(w, http.StatusForbidden, "local registration is disabled in independent mode")
		return
	}
	if !a.config.RegistrationEnabled() {
		util.WriteError(w, http.StatusForbidden, "已关闭注册通道")
		return
	}
	body, err := readJSONMap(r)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	identity, token, err := a.auth.RegisterPasswordUser(util.Clean(body["username"]), util.Clean(body["password"]), util.Clean(body["name"]))
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	setAuthSessionCookie(w, r, token)
	a.writeLoginResponse(w, *identity, token)
}

func (a *App) handleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	clearAuthSessionCookie(w, r)
	util.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *App) writeLoginResponse(w http.ResponseWriter, identity service.Identity, token string) {
	a.writeLoginResponseWithExtra(w, identity, token, nil)
}

func (a *App) writeLoginResponseWithExtra(w http.ResponseWriter, identity service.Identity, token string, extra map[string]any) {
	permissions := a.identityPermissions(identity)
	payload := map[string]any{
		"ok":                        true,
		"version":                   version.Get(),
		"token":                     token,
		"role":                      identity.Role,
		"role_id":                   identity.RoleID,
		"role_name":                 identity.RoleName,
		"subject_id":                identity.ID,
		"name":                      identity.Name,
		"provider":                  identity.Provider,
		"credential_id":             identity.CredentialID,
		"credential_name":           identity.CredentialName,
		"creation_concurrent_limit": a.identityCreationConcurrentLimit(identity),
		"creation_rpm_limit":        a.identityCreationRPMLimit(identity),
		"billing":                   a.identityBillingState(identity),
		"menu_paths":                permissions.MenuPaths,
		"api_permissions":           permissions.APIPermissions,
		"menus":                     service.FilterMenuPermissions(permissions.MenuPaths),
	}
	if binding, ok := a.sub2APISessionBindingForIdentity(identity); ok {
		payload["sub2api"] = binding.PublicMap()
	}
	if token == "" {
		delete(payload, "token")
	}
	for key, value := range extra {
		payload[key] = value
	}
	util.WriteJSON(w, http.StatusOK, payload)
}

func (a *App) identityCreationConcurrentLimit(identity service.Identity) int {
	if identity.Role != service.AuthRoleUser {
		return 0
	}
	return a.config.UserDefaultConcurrentLimit()
}

func (a *App) identityCreationRPMLimit(identity service.Identity) int {
	if identity.Role != service.AuthRoleUser {
		return 0
	}
	return a.config.UserDefaultRPMLimit()
}

func (a *App) identityBillingState(identity service.Identity) map[string]any {
	if identity.Provider == service.AuthProviderSub2API {
		if a != nil && a.sub2Launch != nil {
			if balance, err := a.sub2Launch.Balance(context.Background(), identity); err == nil {
				return balance
			}
		}
		return map[string]any{
			"type":         service.BillingTypeStandard,
			"unit":         service.BillingUnitImage,
			"unlimited":    true,
			"available":    0,
			"standard":     nil,
			"subscription": nil,
			"limit_state":  "unlimited",
		}
	}
	if identity.Role != service.AuthRoleUser {
		return map[string]any{
			"type":         service.BillingTypeStandard,
			"unit":         service.BillingUnitImage,
			"unlimited":    true,
			"available":    0,
			"standard":     nil,
			"subscription": nil,
			"limit_state":  "unlimited",
		}
	}
	if a == nil || a.billing == nil {
		return nil
	}
	return a.billing.Get(identityScope(identity))
}

func (a *App) luoyeIndependentMode() bool {
	return a != nil && a.config != nil && a.config.LuoyeIndependentMode()
}

func (a *App) handleSettings(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		util.WriteJSON(w, http.StatusOK, map[string]any{"config": a.config.Get()})
	case http.MethodPost:
		body, err := readJSONMap(r)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, "invalid json body")
			return
		}
		updated, err := a.config.Update(body)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		a.update = newUpdateService(a.config)
		util.WriteJSON(w, http.StatusOK, map[string]any{"config": updated})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (a *App) handleAppMeta(w http.ResponseWriter, r *http.Request) {
	util.WriteJSON(w, http.StatusOK, map[string]any{
		"app_title":                   "落叶创艺",
		"project_name":                "落叶创艺",
		"login_page_image_url":        a.config.LoginPageImageURL(),
		"login_page_image_mode":       a.config.LoginPageImageMode(),
		"login_page_image_zoom":       a.config.LoginPageImageZoom(),
		"login_page_image_position_x": a.config.LoginPageImagePositionX(),
		"login_page_image_position_y": a.config.LoginPageImagePositionY(),
		"luoye_independent_mode":      a.luoyeIndependentMode(),
	})
}

func (a *App) handlePermissionCatalog(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	util.WriteJSON(w, http.StatusOK, a.auth.PermissionCatalog())
}

func (a *App) handleLoginPageImageSettings(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if err := r.ParseMultipartForm(maxLoginPageImageSize + (1 << 20)); err != nil {
		util.WriteError(w, http.StatusBadRequest, "invalid multipart form")
		return
	}

	currentImageURL := a.config.LoginPageImageURL()
	nextImageURL := strings.TrimSpace(r.FormValue("login_page_image_url"))
	uploadedImageURL := ""
	switch strings.ToLower(strings.TrimSpace(r.FormValue("login_page_image_action"))) {
	case "remove":
		nextImageURL = ""
	case "replace":
		fileHeader := firstMultipartFile(r.MultipartForm, "login_page_image_file")
		if fileHeader == nil {
			util.WriteError(w, http.StatusBadRequest, "login page image file is required")
			return
		}
		storedURL, err := a.storeLoginPageImage(fileHeader)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		nextImageURL = storedURL
		uploadedImageURL = storedURL
	}

	updated, err := a.config.Update(map[string]any{
		"login_page_image_url":        nextImageURL,
		"login_page_image_mode":       strings.TrimSpace(r.FormValue("login_page_image_mode")),
		"login_page_image_zoom":       strings.TrimSpace(r.FormValue("login_page_image_zoom")),
		"login_page_image_position_x": strings.TrimSpace(r.FormValue("login_page_image_position_x")),
		"login_page_image_position_y": strings.TrimSpace(r.FormValue("login_page_image_position_y")),
	})
	if err != nil {
		if uploadedImageURL != "" {
			a.deleteLocalLoginPageImage(uploadedImageURL)
		}
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if currentImageURL != "" && currentImageURL != nextImageURL {
		a.deleteLocalLoginPageImage(currentImageURL)
	}
	util.WriteJSON(w, http.StatusOK, map[string]any{"config": updated})
}

func (a *App) storeLoginPageImage(header *multipart.FileHeader) (string, error) {
	data, ext, err := readLoginPageImageFile(header)
	if err != nil {
		return "", err
	}
	stem := safeUploadStem(header.Filename)
	if stem == "" {
		stem = "login-page"
	}
	filename := fmt.Sprintf("%d-%s%s", time.Now().UnixNano(), stem, ext)
	target := filepath.Join(a.config.LoginPageImagesDir(), filename)
	if err := os.WriteFile(target, data, 0o644); err != nil {
		return "", err
	}
	return "/login-page-images/" + filename, nil
}

func readLoginPageImageFile(header *multipart.FileHeader) ([]byte, string, error) {
	if header == nil {
		return nil, "", fmt.Errorf("image file is required")
	}
	if header.Size > maxLoginPageImageSize {
		return nil, "", fmt.Errorf("login page image cannot exceed 10MB")
	}
	file, err := header.Open()
	if err != nil {
		return nil, "", err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxLoginPageImageSize+1))
	if err != nil {
		return nil, "", err
	}
	if len(data) == 0 {
		return nil, "", fmt.Errorf("image file is empty")
	}
	if len(data) > maxLoginPageImageSize {
		return nil, "", fmt.Errorf("login page image cannot exceed 10MB")
	}
	if ext := strings.ToLower(filepath.Ext(header.Filename)); ext == ".svg" && bytes.Contains(bytes.ToLower(data[:min(len(data), 512)]), []byte("<svg")) {
		return data, ".svg", nil
	}
	if _, _, err := image.DecodeConfig(bytes.NewReader(data)); err != nil {
		return nil, "", fmt.Errorf("unsupported image file")
	}
	switch http.DetectContentType(data) {
	case "image/jpeg":
		return data, ".jpg", nil
	case "image/gif":
		return data, ".gif", nil
	case "image/webp":
		return data, ".webp", nil
	default:
		return data, ".png", nil
	}
}

func (a *App) deleteLocalLoginPageImage(imageURL string) {
	imagePath, ok := a.localLoginPageImagePath(imageURL)
	if ok {
		_ = os.Remove(imagePath)
	}
}

func (a *App) localLoginPageImagePath(imageURL string) (string, bool) {
	cleanURL := strings.TrimSpace(imageURL)
	if !strings.HasPrefix(cleanURL, "/login-page-images/") {
		return "", false
	}
	rel := strings.TrimPrefix(path.Clean(cleanURL), "/login-page-images/")
	if rel == "." || rel == "" || strings.Contains(rel, "..") {
		return "", false
	}
	root, err := filepath.Abs(a.config.LoginPageImagesDir())
	if err != nil {
		return "", false
	}
	target, err := filepath.Abs(filepath.Join(root, filepath.FromSlash(rel)))
	if err != nil {
		return "", false
	}
	if target != root && !strings.HasPrefix(target, root+string(os.PathSeparator)) {
		return "", false
	}
	return target, true
}

func firstMultipartFile(form *multipart.Form, key string) *multipart.FileHeader {
	if form == nil || len(form.File[key]) == 0 {
		return nil
	}
	return form.File[key][0]
}

func safeUploadStem(filename string) string {
	name := strings.TrimSuffix(filepath.Base(filename), filepath.Ext(filename))
	name = strings.ToLower(strings.TrimSpace(name))
	var builder strings.Builder
	for _, char := range name {
		switch {
		case char >= 'a' && char <= 'z':
			builder.WriteRune(char)
		case char >= '0' && char <= '9':
			builder.WriteRune(char)
		case char == '-' || char == '_':
			builder.WriteRune(char)
		case char == ' ' || char == '.':
			builder.WriteRune('-')
		}
	}
	return strings.Trim(builder.String(), "-_")
}

func (a *App) handleImages(w http.ResponseWriter, r *http.Request) {
	started := time.Now()
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		a.logFrontendCriticalRequest(r, "image_list", started, http.StatusUnauthorized)
		return
	}
	switch r.Method {
	case http.MethodGet:
		scope, teamContext, status, message := a.imageListAccessScope(identity, r.URL.Query())
		if status != 0 {
			util.WriteError(w, status, message)
			a.logFrontendCriticalRequest(r, "image_list", started, status)
			return
		}
		payload := a.images.ListImagesPage(a.resolveImageBaseURL(r), service.ImageListOptions{
			StartDate:        strings.TrimSpace(r.URL.Query().Get("start_date")),
			EndDate:          strings.TrimSpace(r.URL.Query().Get("end_date")),
			PageSize:         util.ToInt(r.URL.Query().Get("page_size"), 0),
			Cursor:           strings.TrimSpace(r.URL.Query().Get("cursor")),
			Search:           strings.TrimSpace(r.URL.Query().Get("search")),
			Visibility:       strings.TrimSpace(r.URL.Query().Get("visibility")),
			Format:           strings.TrimSpace(r.URL.Query().Get("format")),
			Orientation:      strings.TrimSpace(r.URL.Query().Get("orientation")),
			ResolutionPreset: strings.TrimSpace(r.URL.Query().Get("resolution")),
			AspectRatio:      strings.TrimSpace(r.URL.Query().Get("aspect_ratio")),
			CollectionID:     strings.TrimSpace(r.URL.Query().Get("collection_id")),
			Tags:             imageTagsFromQuery(r.URL.Query()),
		}, scope)
		a.decorateImageList(payload)
		if teamContext.TeamID != "" {
			payload["team_storage"] = a.images.TeamStorageSummary(teamContext.TeamID, teamContext.StorageLimitBytes)
			payload["team"] = map[string]any{
				"id":                  teamContext.TeamID,
				"name":                teamContext.TeamName,
				"member_role":         teamContext.Role,
				"storage_limit_bytes": teamContext.StorageLimitBytes,
			}
		}
		payload["retention_days"] = a.config.ImageRetentionDays()
		util.WriteJSON(w, http.StatusOK, payload)
		a.logFrontendCriticalRequest(r, "image_list", started, http.StatusOK)
	case http.MethodDelete:
		body, err := readJSONMap(r)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, "invalid json body")
			return
		}
		scope, status, message := a.imageMutationAccessScope(identity, util.Clean(body["scope"]), util.Clean(body["team_id"]))
		if status != 0 {
			util.WriteError(w, status, message)
			return
		}
		result, err := a.images.DeleteImages(util.AsStringSlice(body["paths"]), scope)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		if util.Clean(body["scope"]) == "team" {
			teamContext, _, _ := a.imageTeamContext(identity, util.Clean(body["team_id"]))
			if teamContext.TeamID != "" {
				result["team_storage"] = a.images.TeamStorageSummary(teamContext.TeamID, teamContext.StorageLimitBytes)
			}
		}
		util.WriteJSON(w, http.StatusOK, result)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (a *App) handleTextAssets(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	cleanPath := strings.Trim(strings.TrimPrefix(path.Clean(r.URL.Path), "/api/text-assets"), "/")
	if cleanPath == "." {
		cleanPath = ""
	}
	if cleanPath == "" {
		switch r.Method {
		case http.MethodGet:
			scope, status, message := a.textAssetReadScope(identity, r.URL.Query())
			if status != 0 {
				util.WriteError(w, status, message)
				return
			}
			result := a.textAssets.List(service.TextAssetListOptions{
				PageSize:     util.ToInt(r.URL.Query().Get("page_size"), 0),
				Cursor:       strings.TrimSpace(r.URL.Query().Get("cursor")),
				Search:       strings.TrimSpace(r.URL.Query().Get("search")),
				CollectionID: strings.TrimSpace(r.URL.Query().Get("collection_id")),
			}, scope)
			util.WriteJSON(w, http.StatusOK, result)
		case http.MethodPost:
			body, err := readJSONMap(r)
			if err != nil {
				util.WriteError(w, http.StatusBadRequest, "invalid json body")
				return
			}
			scope, status, message := a.textAssetMutationScope(identity, util.Clean(body["scope"]), util.Clean(body["team_id"]))
			if status != 0 {
				util.WriteError(w, status, message)
				return
			}
			item, err := a.textAssets.Create(body, scope)
			if err != nil {
				util.WriteError(w, http.StatusBadRequest, err.Error())
				return
			}
			util.WriteJSON(w, http.StatusOK, map[string]any{"item": item})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}

	parts := splitPath(r.URL.Path)
	if len(parts) != 3 || parts[0] != "api" || parts[1] != "text-assets" {
		http.NotFound(w, r)
		return
	}
	id := parts[2]
	switch r.Method {
	case http.MethodPatch:
		body, err := readJSONMap(r)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, "invalid json body")
			return
		}
		scope, status, message := a.textAssetMutationScope(identity, util.Clean(body["scope"]), util.Clean(body["team_id"]))
		if status != 0 {
			util.WriteError(w, status, message)
			return
		}
		item, err := a.textAssets.Update(id, body, scope)
		if err != nil {
			status := http.StatusBadRequest
			if err.Error() == "text asset not found" {
				status = http.StatusNotFound
			}
			util.WriteError(w, status, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{"item": item})
	case http.MethodDelete:
		scope, status, message := a.textAssetMutationScope(identity, strings.TrimSpace(r.URL.Query().Get("scope")), strings.TrimSpace(r.URL.Query().Get("team_id")))
		if status != 0 {
			util.WriteError(w, status, message)
			return
		}
		deleted, err := a.textAssets.Delete(id, scope)
		if err != nil {
			util.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if !deleted {
			util.WriteError(w, http.StatusNotFound, "text asset not found")
			return
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{"deleted": true, "id": id})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (a *App) handleTextAssetCollections(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	cleanPath := strings.Trim(strings.TrimPrefix(path.Clean(r.URL.Path), "/api/text-asset-collections"), "/")
	if cleanPath == "." {
		cleanPath = ""
	}
	if cleanPath == "items" {
		a.handleTextAssetCollectionItems(w, r, identity)
		return
	}
	switch r.Method {
	case http.MethodGet:
		scope, status, message := a.textAssetReadScope(identity, r.URL.Query())
		if status != 0 {
			util.WriteError(w, status, message)
			return
		}
		collections := a.textAssets.ListTextAssetCollectionsResult(scope)
		util.WriteJSON(w, http.StatusOK, map[string]any{"items": collections.Items, "unclassified_count": collections.UnclassifiedCount})
	case http.MethodPost:
		if cleanPath != "" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		body, err := readJSONMap(r)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, "invalid json body")
			return
		}
		scope, status, message := a.textAssetMutationScope(identity, util.Clean(body["scope"]), util.Clean(body["team_id"]))
		if status != 0 {
			util.WriteError(w, status, message)
			return
		}
		item, err := a.textAssets.CreateTextAssetCollection(util.Clean(body["name"]), scope)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		collections := a.textAssets.ListTextAssetCollectionsResult(scope)
		util.WriteJSON(w, http.StatusOK, map[string]any{"item": item, "items": collections.Items, "unclassified_count": collections.UnclassifiedCount})
	case http.MethodPatch:
		if cleanPath == "" {
			util.WriteError(w, http.StatusBadRequest, "collection id is required")
			return
		}
		body, err := readJSONMap(r)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, "invalid json body")
			return
		}
		scope, status, message := a.textAssetMutationScope(identity, util.Clean(body["scope"]), util.Clean(body["team_id"]))
		if status != 0 {
			util.WriteError(w, status, message)
			return
		}
		item, err := a.textAssets.RenameTextAssetCollection(cleanPath, util.Clean(body["name"]), scope)
		if err != nil {
			status := http.StatusBadRequest
			if err.Error() == "collection not found" {
				status = http.StatusNotFound
			}
			util.WriteError(w, status, err.Error())
			return
		}
		collections := a.textAssets.ListTextAssetCollectionsResult(scope)
		util.WriteJSON(w, http.StatusOK, map[string]any{"item": item, "items": collections.Items, "unclassified_count": collections.UnclassifiedCount})
	case http.MethodDelete:
		if cleanPath == "" {
			util.WriteError(w, http.StatusBadRequest, "collection id is required")
			return
		}
		scope, status, message := a.textAssetMutationScope(identity, strings.TrimSpace(r.URL.Query().Get("scope")), strings.TrimSpace(r.URL.Query().Get("team_id")))
		if status != 0 {
			util.WriteError(w, status, message)
			return
		}
		result, err := a.textAssets.DeleteTextAssetCollection(cleanPath, scope)
		if err != nil {
			status := http.StatusBadRequest
			if err.Error() == "collection not found" {
				status = http.StatusNotFound
			}
			util.WriteError(w, status, err.Error())
			return
		}
		collections := a.textAssets.ListTextAssetCollectionsResult(scope)
		result["items"] = collections.Items
		result["unclassified_count"] = collections.UnclassifiedCount
		util.WriteJSON(w, http.StatusOK, result)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (a *App) handleTextAssetCollectionItems(w http.ResponseWriter, r *http.Request, identity service.Identity) {
	if r.Method != http.MethodPatch {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	body, err := readJSONMap(r)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	scope, status, message := a.textAssetMutationScope(identity, util.Clean(body["scope"]), util.Clean(body["team_id"]))
	if status != 0 {
		util.WriteError(w, status, message)
		return
	}
	result, err := a.textAssets.UpdateTextAssetCollectionItems(util.Clean(body["collection_id"]), util.AsStringSlice(body["ids"]), scope)
	if err != nil {
		status := http.StatusBadRequest
		if err.Error() == "collection not found" {
			status = http.StatusNotFound
		}
		util.WriteError(w, status, err.Error())
		return
	}
	collections := a.textAssets.ListTextAssetCollectionsResult(scope)
	result["items"] = collections.Items
	result["unclassified_count"] = collections.UnclassifiedCount
	util.WriteJSON(w, http.StatusOK, result)
}

func (a *App) handleImageTags(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		scope, _, status, message := a.imageListAccessScope(identity, r.URL.Query())
		if status != 0 {
			util.WriteError(w, status, message)
			return
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{"tags": a.images.ListImageTags(scope)})
	case http.MethodPatch, http.MethodPost:
		body, err := readJSONMap(r)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, "invalid json body")
			return
		}
		path := util.Clean(body["path"])
		if path == "" {
			util.WriteError(w, http.StatusBadRequest, "path is required")
			return
		}
		scope, status, message := a.imageMutationAccessScope(identity, util.Clean(body["scope"]), util.Clean(body["team_id"]))
		if status != 0 {
			util.WriteError(w, status, message)
			return
		}
		item, err := a.images.UpdateImageTags(path, service.NormalizeImageTags(body["tags"]), scope)
		if err != nil {
			status := http.StatusBadRequest
			if err.Error() == "image not found" {
				status = http.StatusNotFound
			}
			util.WriteError(w, status, err.Error())
			return
		}
		a.decorateImageItem(item, a.imageOwnerDisplayNames())
		util.WriteJSON(w, http.StatusOK, map[string]any{"item": item, "tags": a.images.ListImageTags(scope)})
	case http.MethodDelete:
		body, _ := readJSONMap(r)
		tag := firstNonEmpty(util.Clean(body["tag"]), util.Clean(r.URL.Query().Get("tag")))
		scope, status, message := a.imageMutationAccessScope(identity, util.Clean(body["scope"]), util.Clean(body["team_id"]))
		if status != 0 {
			util.WriteError(w, status, message)
			return
		}
		result, err := a.images.DeleteImageTag(tag, scope)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, result)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (a *App) handleImageCollections(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	cleanPath := strings.Trim(strings.TrimPrefix(path.Clean(r.URL.Path), "/api/image-collections"), "/")
	if cleanPath == "." {
		cleanPath = ""
	}
	if cleanPath == "items" {
		a.handleImageCollectionItems(w, r, identity)
		return
	}
	switch r.Method {
	case http.MethodGet:
		scope, _, status, message := a.imageListAccessScope(identity, r.URL.Query())
		if status != 0 {
			util.WriteError(w, status, message)
			return
		}
		collections := a.images.ListImageCollectionsResult(scope)
		util.WriteJSON(w, http.StatusOK, map[string]any{"items": collections.Items, "unclassified_count": collections.UnclassifiedCount})
	case http.MethodPost:
		if cleanPath != "" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		body, err := readJSONMap(r)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, "invalid json body")
			return
		}
		scope, teamContext, status, message := a.imageCollectionMutationScope(identity, util.Clean(body["scope"]), util.Clean(body["team_id"]))
		if status != 0 {
			util.WriteError(w, status, message)
			return
		}
		item, err := a.images.CreateImageCollection(util.Clean(body["name"]), scope, teamContext.TeamName)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		collections := a.images.ListImageCollectionsResult(scope)
		util.WriteJSON(w, http.StatusOK, map[string]any{"item": item, "items": collections.Items, "unclassified_count": collections.UnclassifiedCount})
	case http.MethodPatch:
		if cleanPath == "" {
			util.WriteError(w, http.StatusBadRequest, "collection id is required")
			return
		}
		body, err := readJSONMap(r)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, "invalid json body")
			return
		}
		scope, _, status, message := a.imageCollectionMutationScope(identity, util.Clean(body["scope"]), util.Clean(body["team_id"]))
		if status != 0 {
			util.WriteError(w, status, message)
			return
		}
		item, err := a.images.RenameImageCollection(cleanPath, util.Clean(body["name"]), scope)
		if err != nil {
			status := http.StatusBadRequest
			if err.Error() == "collection not found" {
				status = http.StatusNotFound
			}
			util.WriteError(w, status, err.Error())
			return
		}
		collections := a.images.ListImageCollectionsResult(scope)
		util.WriteJSON(w, http.StatusOK, map[string]any{"item": item, "items": collections.Items, "unclassified_count": collections.UnclassifiedCount})
	case http.MethodDelete:
		if cleanPath == "" {
			util.WriteError(w, http.StatusBadRequest, "collection id is required")
			return
		}
		scope, _, status, message := a.imageCollectionMutationScope(identity, strings.TrimSpace(r.URL.Query().Get("scope")), strings.TrimSpace(r.URL.Query().Get("team_id")))
		if status != 0 {
			util.WriteError(w, status, message)
			return
		}
		result, err := a.images.DeleteImageCollection(cleanPath, scope)
		if err != nil {
			status := http.StatusBadRequest
			if err.Error() == "collection not found" {
				status = http.StatusNotFound
			}
			util.WriteError(w, status, err.Error())
			return
		}
		collections := a.images.ListImageCollectionsResult(scope)
		result["items"] = collections.Items
		result["unclassified_count"] = collections.UnclassifiedCount
		util.WriteJSON(w, http.StatusOK, result)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (a *App) handleImageCollectionItems(w http.ResponseWriter, r *http.Request, identity service.Identity) {
	if r.Method != http.MethodPatch {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	body, err := readJSONMap(r)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	scope, _, status, message := a.imageCollectionMutationScope(identity, util.Clean(body["scope"]), util.Clean(body["team_id"]))
	if status != 0 {
		util.WriteError(w, status, message)
		return
	}
	result, err := a.images.UpdateImageCollectionItems(util.Clean(body["collection_id"]), util.AsStringSlice(body["paths"]), scope)
	if err != nil {
		status := http.StatusBadRequest
		if err.Error() == "collection not found" {
			status = http.StatusNotFound
		}
		util.WriteError(w, status, err.Error())
		return
	}
	collections := a.images.ListImageCollectionsResult(scope)
	result["items"] = collections.Items
	result["unclassified_count"] = collections.UnclassifiedCount
	util.WriteJSON(w, http.StatusOK, result)
}

func (a *App) handleImageDetail(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	scope, _, status, message := a.imageListAccessScope(identity, r.URL.Query())
	if status != 0 {
		util.WriteError(w, status, message)
		return
	}
	value := firstNonEmpty(util.Clean(r.URL.Query().Get("path")), util.Clean(r.URL.Query().Get("url")))
	if value == "" {
		util.WriteError(w, http.StatusBadRequest, "path is required")
		return
	}
	item, err := a.images.ImageDetail(a.resolveImageBaseURL(r), value, scope)
	if err != nil {
		status := http.StatusBadRequest
		if err.Error() == "image not found" {
			status = http.StatusNotFound
		}
		util.WriteError(w, status, err.Error())
		return
	}
	a.decorateImageItem(item, a.imageOwnerDisplayNames())
	util.WriteJSON(w, http.StatusOK, map[string]any{"item": item})
}

func (a *App) handleImageDownloadURL(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	scope, _, status, message := a.imageListAccessScope(identity, r.URL.Query())
	if status != 0 {
		util.WriteError(w, status, message)
		return
	}
	value := firstNonEmpty(util.Clean(r.URL.Query().Get("path")), util.Clean(r.URL.Query().Get("url")))
	if value == "" {
		util.WriteError(w, http.StatusBadRequest, "path is required")
		return
	}
	download, err := a.images.ImageDownloadURL(a.resolveImageBaseURL(r), value, scope)
	if err != nil {
		status := http.StatusBadRequest
		if err.Error() == "image not found" {
			status = http.StatusNotFound
		}
		util.WriteError(w, status, err.Error())
		return
	}
	util.WriteJSON(w, http.StatusOK, map[string]any{
		"download_url": download.URL,
		"expires_at":   download.ExpiresAt,
		"direct":       download.Direct,
	})
}

func (a *App) handleImageUploads(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	body, images, err := readMultipartImageBody(r)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, "invalid multipart form")
		return
	}
	if len(images) == 0 {
		util.WriteError(w, http.StatusBadRequest, "image file is required")
		return
	}
	visibility, err := service.NormalizePrivateImageVisibility(util.Clean(body["visibility"]))
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	items := make([]map[string]any, 0, len(images))
	for _, image := range images {
		item, err := a.images.StoreUploadedImage(a.resolveImageBaseURL(r), service.UploadedManagedImage{
			Filename:    image.Filename,
			ContentType: image.ContentType,
			Data:        image.Data,
		}, identityScope(identity), identityDisplayName(identity), visibility)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		items = append(items, item)
	}
	a.cleanupImageStorage()
	ownerNames := a.imageOwnerDisplayNames()
	for _, item := range items {
		a.decorateImageItem(item, ownerNames)
	}
	util.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *App) handleCreationTaskReferenceImageUpload(r *http.Request, identity service.Identity) (map[string]any, error) {
	if err := r.ParseMultipartForm(128 << 20); err != nil {
		return nil, err
	}
	if r.MultipartForm == nil {
		return nil, fmt.Errorf("image file is required")
	}
	clientReferenceID := strings.TrimSpace(firstForm(r.MultipartForm, "client_reference_id"))
	if clientReferenceID == "" {
		return nil, fmt.Errorf("client_reference_id is required")
	}
	var headers []*multipart.FileHeader
	for _, field := range []string{"image", "image[]"} {
		headers = append(headers, r.MultipartForm.File[field]...)
	}
	if len(headers) == 0 {
		return nil, fmt.Errorf("image file is required")
	}
	image, err := readUpload(headers[0])
	if err != nil {
		return nil, err
	}
	if len(image.Data) == 0 {
		return nil, fmt.Errorf("image file is empty")
	}
	ref, err := a.images.StoreTempReferenceImage(service.UploadedTempReferenceImage{
		ClientReferenceID: clientReferenceID,
		ConversationID:    firstForm(r.MultipartForm, "conversation_id"),
		TurnID:            firstForm(r.MultipartForm, "turn_id"),
		Filename:          image.Filename,
		ContentType:       image.ContentType,
		Data:              image.Data,
	}, identityScope(identity))
	if err != nil {
		return nil, err
	}
	return tempReferenceImagePayload(ref), nil
}

func tempReferenceImagePayload(ref service.TempReferenceImage) map[string]any {
	return map[string]any{
		"id":                  ref.ID,
		"client_reference_id": ref.ClientReferenceID,
		"filename":            ref.Filename,
		"content_type":        ref.ContentType,
		"size":                ref.Size,
		"width":               ref.Width,
		"height":              ref.Height,
		"created_at":          ref.CreatedAt,
		"expires_at":          ref.ExpiresAt,
	}
}

func (a *App) handleImageVisibility(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	body, err := readJSONMap(r)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	path := util.Clean(body["path"])
	if path == "" {
		util.WriteError(w, http.StatusBadRequest, "path is required")
		return
	}
	visibility := util.Clean(body["visibility"])
	sharePromptParams := util.ToBool(body["share_prompt_parameters"])
	shareReferences := sharePromptParams && util.ToBool(body["share_reference_images"])
	scope, status, message := a.imageMutationAccessScope(identity, util.Clean(body["scope"]), util.Clean(body["team_id"]))
	if status != 0 {
		util.WriteError(w, status, message)
		return
	}
	item, err := a.images.UpdateImageVisibility(path, visibility, scope, service.ImageVisibilityUpdateOptions{
		SharePromptParams: sharePromptParams,
		ShareReferences:   shareReferences,
	})
	if err != nil {
		status := http.StatusBadRequest
		if err.Error() == "image not found" {
			status = http.StatusNotFound
		}
		util.WriteError(w, status, err.Error())
		return
	}
	a.decorateImageItem(item, a.imageOwnerDisplayNames())
	util.WriteJSON(w, http.StatusOK, map[string]any{"item": item})
}

func (a *App) handleImageLibraryScope(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	body, err := readJSONMap(r)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	targetScope := util.Clean(body["target_scope"])
	if targetScope != service.ImageLibraryScopeTeam {
		util.WriteError(w, http.StatusBadRequest, "target_scope must be team")
		return
	}
	teamContext, status, message := a.imageTeamContext(identity, util.Clean(body["team_id"]))
	if status != 0 {
		util.WriteError(w, status, message)
		return
	}
	result, err := a.images.MoveImagesToTeamLibrary(util.AsStringSlice(body["paths"]), identityScope(identity), teamContext.TeamID, teamContext.TeamName, teamContext.StorageLimitBytes)
	if err != nil {
		var quotaErr service.TeamStorageQuotaExceededError
		if errors.As(err, &quotaErr) {
			util.WriteJSON(w, http.StatusBadRequest, map[string]any{
				"error":          quotaErr.Error(),
				"used_bytes":     quotaErr.UsedBytes,
				"limit_bytes":    quotaErr.LimitBytes,
				"required_bytes": quotaErr.RequiredBytes,
			})
			return
		}
		status := http.StatusBadRequest
		if err.Error() == "image not found" || err.Error() == "team not found" {
			status = http.StatusNotFound
		}
		util.WriteError(w, status, err.Error())
		return
	}
	util.WriteJSON(w, http.StatusOK, result)
}

func (a *App) handleImageFile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	rel, err := imageFileRequestPath(r)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	ref, ok := a.authorizeImageFileRequest(w, r, rel)
	if !ok {
		return
	}
	if len(ref.Data) > 0 {
		if ref.ContentType != "" {
			w.Header().Set("Content-Type", ref.ContentType)
		}
		if r.Method == http.MethodHead {
			w.Header().Set("Content-Length", strconv.Itoa(len(ref.Data)))
			return
		}
		http.ServeContent(w, r, filepath.Base(ref.Rel), ref.Info.ModTime(), bytes.NewReader(ref.Data))
		return
	}
	http.ServeFile(w, r, ref.Path)
}

func (a *App) handleImageReferenceFile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	rel, err := imageReferenceFileRequestPath(r)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	ref, err := a.images.ImageReferenceFileAccess(rel)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	identity, ok := a.imageRequestIdentity(w, r)
	if !ok {
		return
	}
	if identity.Role != service.AuthRoleAdmin && (ref.OwnerID == "" || ref.OwnerID != identityScope(identity)) && !a.identityCanAccessImageTeam(identity, ref.LibraryScope, ref.TeamID) {
		http.NotFound(w, r)
		return
	}
	if ref.ContentType != "" {
		w.Header().Set("Content-Type", ref.ContentType)
	}
	http.ServeFile(w, r, ref.Path)
}

func (a *App) authorizeImageFileRequest(w http.ResponseWriter, r *http.Request, rel string) (service.ImageFileAccess, bool) {
	ref, err := a.images.ImageFileAccess(rel, service.ImageAccessScope{All: true})
	if err != nil {
		http.NotFound(w, r)
		return service.ImageFileAccess{}, false
	}
	identity, ok := a.imageRequestIdentity(w, r)
	if !ok {
		return service.ImageFileAccess{}, false
	}
	if identity.Role == service.AuthRoleAdmin || (ref.OwnerID != "" && ref.OwnerID == identityScope(identity)) {
		return ref, true
	}
	if a.identityCanAccessImageTeam(identity, ref.LibraryScope, ref.TeamID) {
		return ref, true
	}
	http.NotFound(w, r)
	return service.ImageFileAccess{}, false
}

func (a *App) identityCanAccessImageTeam(identity service.Identity, libraryScope, teamID string) bool {
	if libraryScope != service.ImageLibraryScopeTeam || util.Clean(teamID) == "" || a == nil || a.teams == nil {
		return false
	}
	_, err := a.teams.ImageLibraryContext(identity, teamID)
	return err == nil
}

func (a *App) handleImageThumbnail(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	thumbnailRel, err := imageThumbnailRequestPath(r)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	sourceRel, sourceErr := a.images.SourceImageRelativePathFromThumbnail(thumbnailRel)
	if sourceErr != nil {
		http.NotFound(w, r)
		return
	}
	if _, ok := a.authorizeImageFileRequest(w, r, sourceRel); !ok {
		return
	}
	_ = a.images.EnsureThumbnail(thumbnailRel)
	thumbPath := filepath.Join(a.config.ImageThumbnailsDir(), filepath.FromSlash(thumbnailRel))
	if info, err := os.Stat(thumbPath); err == nil && !info.IsDir() {
		w.Header().Set("Cache-Control", imageThumbnailCacheControl)
		http.ServeFile(w, r, thumbPath)
		return
	}
	sourcePath := filepath.Join(a.config.ImagesDir(), filepath.FromSlash(sourceRel))
	if info, err := os.Stat(sourcePath); err == nil && !info.IsDir() {
		http.ServeFile(w, r, sourcePath)
		return
	}
	http.NotFound(w, r)
}

func (a *App) handleImagePreview(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	previewRel, err := imagePreviewRequestPath(r)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	sourceRel, sourceErr := a.images.SourceImageRelativePathFromPreview(previewRel)
	if sourceErr != nil {
		http.NotFound(w, r)
		return
	}
	if _, ok := a.authorizeImageFileRequest(w, r, sourceRel); !ok {
		return
	}
	_ = a.images.EnsurePreview(previewRel)
	previewPath := filepath.Join(a.config.ImagePreviewsDir(), filepath.FromSlash(previewRel))
	if info, err := os.Stat(previewPath); err == nil && !info.IsDir() {
		w.Header().Set("Cache-Control", imageThumbnailCacheControl)
		http.ServeFile(w, r, previewPath)
		return
	}
	sourcePath := filepath.Join(a.config.ImagesDir(), filepath.FromSlash(sourceRel))
	if info, err := os.Stat(sourcePath); err == nil && !info.IsDir() {
		http.ServeFile(w, r, sourcePath)
		return
	}
	http.NotFound(w, r)
}

func imageFileRequestPath(r *http.Request) (string, error) {
	raw := strings.TrimPrefix(r.URL.EscapedPath(), "/images/")
	if raw == "" || raw == r.URL.EscapedPath() {
		return "", errors.New("invalid image path")
	}
	rel, err := url.PathUnescape(raw)
	if err != nil {
		return "", err
	}
	return rel, nil
}

func imageReferenceFileRequestPath(r *http.Request) (string, error) {
	raw := strings.TrimPrefix(r.URL.EscapedPath(), "/image-references/")
	if raw == "" || raw == r.URL.EscapedPath() {
		return "", errors.New("invalid image path")
	}
	rel, err := url.PathUnescape(raw)
	if err != nil {
		return "", err
	}
	return rel, nil
}

func imageThumbnailRequestPath(r *http.Request) (string, error) {
	raw := strings.TrimPrefix(r.URL.EscapedPath(), "/image-thumbnails/")
	if raw == "" || raw == r.URL.EscapedPath() {
		return "", errors.New("invalid thumbnail path")
	}
	rel, err := url.PathUnescape(raw)
	if err != nil {
		return "", err
	}
	return rel, nil
}

func imagePreviewRequestPath(r *http.Request) (string, error) {
	raw := strings.TrimPrefix(r.URL.EscapedPath(), "/image-previews/")
	if raw == "" || raw == r.URL.EscapedPath() {
		return "", errors.New("invalid preview path")
	}
	rel, err := url.PathUnescape(raw)
	if err != nil {
		return "", err
	}
	return rel, nil
}

func (a *App) handleLogs(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	query, err := parseLogQuery(r)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if query.View == "" {
		query.View = a.config.DefaultLogView()
	}
	query.View = service.NormalizeLogView(query.View, a.config.DefaultLogView())
	items := a.logs.Search(query)
	util.WriteJSON(w, http.StatusOK, map[string]any{"items": items, "total": len(items), "page_size": normalizedHTTPLogPageSize(query.Limit), "view": query.View})
}

func (a *App) handleLogGovernance(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		util.WriteJSON(w, http.StatusOK, map[string]any{"governance": a.logs.GovernanceSummary()})
	case http.MethodPost:
		body, err := readJSONMap(r)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, "invalid json body")
			return
		}
		retentionDays := util.ToInt(body["retention_days"], a.config.LogRetentionDays())
		result, err := a.logs.CleanupOlderThan(retentionDays)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{
			"cleanup":    result,
			"governance": a.logs.GovernanceSummary(),
		})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (a *App) handleImageStorageGovernance(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		util.WriteJSON(w, http.StatusOK, map[string]any{"governance": a.images.StorageGovernance()})
	case http.MethodPost:
		body, err := readJSONMap(r)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, "invalid json body")
			return
		}
		action := strings.TrimSpace(util.Clean(body["action"]))
		options := service.ImageStorageCleanupOptions{
			IncludePublic: util.ToBool(body["include_public"]),
		}
		switch action {
		case "retention":
			options.RetentionDays = util.ToInt(body["retention_days"], a.config.ImageRetentionDays())
		case "user-limit":
			options.MaxImagesPerUser = normalizedImageMaxSavedPerUser(util.ToInt(body["max_images_per_user"], a.config.ImageMaxSavedPerUser()))
		case "quota":
			options.MaxBytes = imageCleanupMaxBytes(body["max_bytes"], body["max_mb"], a.config.ImageStorageLimitBytes())
		case "thumbnails":
			options.ClearThumbnails = true
		case "all":
			options.RetentionDays = util.ToInt(body["retention_days"], a.config.ImageRetentionDays())
			options.MaxBytes = imageCleanupMaxBytes(body["max_bytes"], body["max_mb"], a.config.ImageStorageLimitBytes())
			options.MaxImagesPerUser = normalizedImageMaxSavedPerUser(util.ToInt(body["max_images_per_user"], a.config.ImageMaxSavedPerUser()))
			options.ClearThumbnails = util.ToBool(body["clear_thumbnails"])
		default:
			util.WriteError(w, http.StatusBadRequest, "action must be retention, user-limit, quota, thumbnails, or all")
			return
		}
		result, err := a.images.CleanupStorage(options)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{
			"cleanup":    result,
			"governance": a.images.StorageGovernance(),
		})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func imageCleanupMaxBytes(rawBytes, rawMB any, fallback int64) int64 {
	if n := int64(util.ToInt(rawBytes, 0)); n > 0 {
		return n
	}
	if mb := util.ToInt(rawMB, 0); mb > 0 {
		return int64(mb) * 1024 * 1024
	}
	return fallback
}

func normalizedImageMaxSavedPerUser(value int) int {
	if value <= 0 {
		return 0
	}
	if value > imageMaxSavedPerUserLimit {
		return imageMaxSavedPerUserLimit
	}
	return value
}

func (a *App) handleStorageInfo(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	backend, err := a.config.StorageBackend()
	if err != nil {
		util.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	util.WriteJSON(w, http.StatusOK, map[string]any{"backend": backend.Info(), "health": backend.HealthCheck()})
}

func (a *App) handleProxy(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	if r.URL.Path == "/api/proxy/test" {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		body, _ := readJSONMap(r)
		candidate := strings.TrimSpace(util.Clean(body["url"]))
		if candidate == "" {
			candidate = a.config.Proxy()
		}
		if candidate == "" {
			util.WriteError(w, http.StatusBadRequest, "proxy url is required")
			return
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{"result": a.proxy.Test(candidate, 15*time.Second)})
		return
	}
	switch r.Method {
	case http.MethodGet:
		util.WriteJSON(w, http.StatusOK, map[string]any{"proxy": map[string]any{"url": a.config.Proxy()}})
	case http.MethodPost:
		body, _ := readJSONMap(r)
		url := util.Clean(body["url"])
		updated, err := a.config.Update(map[string]any{"proxy": url})
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{"proxy": map[string]any{"url": updated["proxy"]}})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (a *App) requireIdentity(w http.ResponseWriter, r *http.Request, overrideAuth string) (service.Identity, bool) {
	token := overrideAuthToken(overrideAuth, r)
	if identity := a.auth.Authenticate(token); identity != nil {
		if !a.identityCanAccessRequest(*identity, r) {
			if strings.HasPrefix(r.URL.Path, "/v1/") {
				writeOpenAIError(w, http.StatusForbidden, "permission denied")
			} else {
				util.WriteError(w, http.StatusForbidden, "permission denied")
			}
			return service.Identity{}, false
		}
		*r = *r.WithContext(withRequestIdentity(r.Context(), *identity))
		return *identity, true
	}
	if strings.HasPrefix(r.URL.Path, "/v1/") {
		writeOpenAIError(w, http.StatusUnauthorized, "authorization is invalid")
	} else {
		util.WriteError(w, http.StatusUnauthorized, "authorization is invalid")
	}
	return service.Identity{}, false
}

func overrideAuthToken(overrideAuth string, r *http.Request) string {
	if overrideAuth != "" {
		return extractBearerToken(overrideAuth)
	}
	return requestAuthToken(r)
}

func requestAuthToken(r *http.Request) string {
	if token := requestBearerToken(r); token != "" {
		return token
	}
	return requestAuthCookieToken(r)
}

func requestBearerToken(r *http.Request) string {
	return extractBearerToken(r.Header.Get("Authorization"))
}

func requestAuthCookieToken(r *http.Request) string {
	cookie, err := r.Cookie(authSessionCookieName)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(cookie.Value)
}

func (a *App) imageRequestIdentity(w http.ResponseWriter, r *http.Request) (service.Identity, bool) {
	token := requestAuthToken(r)
	if token == "" {
		util.WriteError(w, http.StatusUnauthorized, "authorization is invalid")
		return service.Identity{}, false
	}
	if identity := a.auth.Authenticate(token); identity != nil {
		return *identity, true
	}
	util.WriteError(w, http.StatusUnauthorized, "authorization is invalid")
	return service.Identity{}, false
}

func (a *App) identityPermissions(identity service.Identity) service.PermissionSet {
	if identity.Role == service.AuthRoleAdmin {
		return service.DefaultPermissionSetForRole(service.AuthRoleAdmin)
	}
	return service.PermissionSet{
		MenuPaths:      service.NormalizeMenuPermissions(identity.MenuPaths),
		APIPermissions: service.NormalizeAPIPermissions(identity.APIPermissions),
	}
}

func (a *App) identityCanAccessRequest(identity service.Identity, r *http.Request) bool {
	if identity.Role == service.AuthRoleAdmin || isPermissionCheckSkipped(r.URL.Path) {
		return true
	}
	return a.identityCanAccessAPI(identity, r.Method, r.URL.Path)
}

func (a *App) identityCanAccessAPI(identity service.Identity, method, path string) bool {
	if identity.Role == service.AuthRoleAdmin {
		return true
	}
	return service.HasAPIPermission(a.identityPermissions(identity), method, path)
}

func isPermissionCheckSkipped(path string) bool {
	switch path {
	case "/auth/login":
		return true
	case "/auth/logout":
		return true
	case "/auth/register":
		return true
	case "/auth/session":
		return true
	case "/api/profile":
		return true
	case "/api/profile/password":
		return true
	case "/api/profile/api-key":
		return true
	case "/api/profile/prompt-favorites":
		return true
	case "/api/analytics/events":
		return true
	case "/api/sub2api/binding":
		return true
	case "/api/sub2api/api-keys":
		return true
	default:
		return strings.HasPrefix(path, "/api/profile/api-key/") || strings.HasPrefix(path, "/api/profile/prompt-favorites/")
	}
}

func extractBearerToken(auth string) string {
	scheme, value, ok := strings.Cut(strings.TrimSpace(auth), " ")
	if !ok || strings.ToLower(scheme) != "bearer" {
		return ""
	}
	return strings.TrimSpace(value)
}

func setAuthSessionCookie(w http.ResponseWriter, r *http.Request, token string) {
	token = strings.TrimSpace(token)
	if token == "" {
		return
	}
	secure, sameSite := authSessionCookiePolicy(r)
	http.SetCookie(w, &http.Cookie{
		Name:     authSessionCookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   30 * 24 * 60 * 60,
		HttpOnly: true,
		Secure:   secure,
		SameSite: sameSite,
	})
}

func clearAuthSessionCookie(w http.ResponseWriter, r *http.Request) {
	secure, sameSite := authSessionCookiePolicy(r)
	http.SetCookie(w, &http.Cookie{
		Name:     authSessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		SameSite: sameSite,
	})
}

func authSessionCookiePolicy(r *http.Request) (bool, http.SameSite) {
	if isSub2APIEmbeddedAuthRequest(r) {
		return true, http.SameSiteNoneMode
	}
	return isHTTPSRequest(r), http.SameSiteLaxMode
}

func isSub2APIEmbeddedAuthRequest(r *http.Request) bool {
	if r == nil || r.URL == nil {
		return false
	}
	if strings.EqualFold(strings.TrimSpace(r.URL.Query().Get("ui_mode")), "embedded") {
		return true
	}
	path := strings.TrimRight(r.URL.Path, "/")
	return path == "/auth/sub2api/launch" || path == "/api/v1/auths/sub2api/launch"
}

func (a *App) resolveImageBaseURL(r *http.Request) string {
	if base := a.config.BaseURL(); base != "" {
		return base
	}
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	if forwarded := r.Header.Get("x-forwarded-proto"); forwarded != "" {
		scheme = strings.Split(forwarded, ",")[0]
	}
	host := r.Host
	if value := r.Header.Get("host"); value != "" {
		host = value
	}
	return scheme + "://" + host
}

func readJSONMap(r *http.Request) (map[string]any, error) {
	var body map[string]any
	err := util.DecodeJSON(r.Body, &body)
	if body == nil {
		body = map[string]any{}
	}
	return body, err
}

func (a *App) readImageEditTaskBody(r *http.Request, identity service.Identity) (map[string]any, []protocol.UploadedImage, error) {
	return a.readImageEditBody(r, identity)
}

func (a *App) readImageEditBody(r *http.Request, identity service.Identity) (map[string]any, []protocol.UploadedImage, error) {
	contentType := strings.ToLower(r.Header.Get("Content-Type"))
	if !strings.Contains(contentType, "application/json") {
		return readMultipartImageBody(r)
	}
	body, err := readJSONMap(r)
	if err != nil {
		return nil, nil, fmt.Errorf("invalid json body")
	}
	images, err := a.jsonImageEditUploads(r.Context(), body, identity)
	if err != nil {
		return nil, nil, err
	}
	if len(images) == 0 {
		return nil, nil, fmt.Errorf("image file or image_url is required")
	}
	body["response_format"] = firstNonEmpty(util.Clean(body["response_format"]), "b64_json")
	body["stream"] = util.ToBool(body["stream"])
	return body, images, nil
}

func (a *App) jsonImageEditUploads(ctx context.Context, body map[string]any, identity service.Identity) ([]protocol.UploadedImage, error) {
	var images []protocol.UploadedImage
	refs := util.AsStringSlice(body["reference_image_ids"])
	var signedReferenceURLs []string
	usesSub2APIEdit := a.imageEditUsesSub2API(ctx, identity)
	model := sub2APIImageModel(body["model"])
	if len(refs) > 0 {
		managedImages, err := a.images.TempReferenceImageBytes(refs, identityScope(identity))
		if err != nil {
			return nil, err
		}
		for _, image := range managedImages {
			images = append(images, protocol.UploadedImage{
				Filename:    image.Filename,
				ContentType: image.ContentType,
				Data:        image.Data,
			})
		}
		if usesSub2APIEdit && model == util.ImageModelGPTOfficial {
			signedReferenceURLs, err = a.images.TempReferenceImageSignedURLs(refs, identityScope(identity), 30*time.Minute)
			if err != nil {
				return nil, err
			}
		}
	}
	urls, err := jsonImageURLReferences(body)
	if err != nil {
		return nil, err
	}
	urlNative := jsonImageEditUsesPublicReferenceURLs(model)
	publicURLs := dedupe(append(publicJSONImageURLs(urls), signedReferenceURLs...))
	if len(publicURLs) > 0 {
		body["official_public_image_urls"] = publicURLs
	}
	publicURLRefs := publicJSONImageURLs(urls)
	allJSONRefsPublic := len(publicURLRefs) == len(urls)
	if usesSub2APIEdit && model == util.ImageModelGPTOfficial && len(publicURLs) > 0 && allJSONRefsPublic {
		return make([]protocol.UploadedImage, len(publicURLs)), nil
	}
	if (model == util.ImageModelMidjourney || model == util.ImageModelGrokImagine) && len(publicURLs) > 0 {
		for _, rawURL := range urls {
			if isPublicJSONImageURL(rawURL) {
				images = append(images, protocol.UploadedImage{})
				continue
			}
			image, err := uploadedImageFromJSONImageURL(ctx, rawURL)
			if err != nil {
				return nil, err
			}
			images = append(images, image)
		}
		return images, nil
	}
	for _, rawURL := range urls {
		image, err := uploadedImageFromJSONImageURL(ctx, rawURL)
		if err != nil {
			return nil, err
		}
		images = append(images, image)
	}
	if !urlNative || (usesSub2APIEdit && model == util.ImageModelGPTOfficial && !allJSONRefsPublic) {
		delete(body, "official_public_image_urls")
		delete(body, "image_url")
		delete(body, "image_urls")
	}
	return images, nil
}

func (a *App) imageEditUsesSub2API(ctx context.Context, identity service.Identity) bool {
	_, ok := a.sub2APIBindingForMode(ctx, identity, "edit")
	return ok
}

func jsonImageEditUsesPublicReferenceURLs(model string) bool {
	switch model {
	case util.ImageModelGPTOfficial, util.ImageModelMidjourney, util.ImageModelGrokImagine:
		return true
	default:
		return false
	}
}

func publicJSONImageURLs(urls []string) []string {
	out := make([]string, 0, len(urls))
	for _, rawURL := range urls {
		if isPublicJSONImageURL(rawURL) {
			out = append(out, rawURL)
		}
	}
	return dedupe(out)
}

func isPublicJSONImageURL(rawURL string) bool {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		return false
	}
	switch strings.ToLower(parsed.Scheme) {
	case "http", "https":
		return parsed.Host != ""
	default:
		return false
	}
}

func jsonImageURLReferences(body map[string]any) ([]string, error) {
	var refs []string
	appendRef := func(value any) error {
		urlValue, err := jsonImageURLReference(value)
		if err != nil {
			return err
		}
		if urlValue != "" {
			refs = append(refs, urlValue)
		}
		return nil
	}
	if value, ok := body["image_url"]; ok {
		if err := appendRef(value); err != nil {
			return nil, err
		}
	}
	for _, value := range util.AsStringSlice(body["image_urls"]) {
		if err := appendRef(value); err != nil {
			return nil, err
		}
	}
	if value, ok := body["image"]; ok {
		if err := appendRef(value); err != nil {
			return nil, err
		}
	}
	switch values := body["images"].(type) {
	case []any:
		for _, value := range values {
			if err := appendRef(value); err != nil {
				return nil, err
			}
		}
	case []map[string]any:
		for _, value := range values {
			if err := appendRef(value); err != nil {
				return nil, err
			}
		}
	default:
		if values != nil {
			if err := appendRef(values); err != nil {
				return nil, err
			}
		}
	}
	return refs, nil
}

func jsonImageURLReference(value any) (string, error) {
	if value == nil {
		return "", nil
	}
	if raw := strings.TrimSpace(util.Clean(value)); raw != "" && raw != "<nil>" && !strings.HasPrefix(raw, "map[") {
		return raw, nil
	}
	m := util.StringMap(value)
	if len(m) == 0 {
		return "", nil
	}
	if util.Clean(m["file_id"]) != "" {
		return "", fmt.Errorf("file_id image references are not supported; use image_url or multipart image")
	}
	for _, key := range []string{"image_url", "url"} {
		nested := util.StringMap(m[key])
		if len(nested) > 0 {
			if util.Clean(nested["file_id"]) != "" {
				return "", fmt.Errorf("file_id image references are not supported; use image_url or multipart image")
			}
			if raw := strings.TrimSpace(firstNonEmpty(util.Clean(nested["url"]), util.Clean(nested["image_url"]))); raw != "" {
				return raw, nil
			}
		}
		if raw := strings.TrimSpace(util.Clean(m[key])); raw != "" {
			return raw, nil
		}
	}
	return "", nil
}

func uploadedImageFromJSONImageURL(ctx context.Context, rawURL string) (protocol.UploadedImage, error) {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return protocol.UploadedImage{}, nil
	}
	if strings.HasPrefix(strings.ToLower(rawURL), "data:") {
		return uploadedImageFromDataURL(rawURL)
	}
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return protocol.UploadedImage{}, fmt.Errorf("image_url must be a data URL or http/https URL")
	}
	switch strings.ToLower(parsed.Scheme) {
	case "http", "https":
	default:
		return protocol.UploadedImage{}, fmt.Errorf("image_url must be a data URL or http/https URL")
	}
	if err := validateJSONImageURLTarget(ctx, parsed); err != nil {
		return protocol.UploadedImage{}, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return protocol.UploadedImage{}, err
	}
	request.Header.Set("Accept", "image/*")
	request.Header.Set("User-Agent", "chatgpt2api-image-url-fetcher")
	client := http.Client{
		Timeout: 30 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= maxJSONImageURLRedirects {
				return fmt.Errorf("image_url redirected too many times")
			}
			req.Header.Set("Accept", "image/*")
			req.Header.Set("User-Agent", "chatgpt2api-image-url-fetcher")
			return validateJSONImageURLTarget(ctx, req.URL)
		},
	}
	resp, err := client.Do(request)
	if err != nil {
		return protocol.UploadedImage{}, fmt.Errorf("download image_url failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return protocol.UploadedImage{}, fmt.Errorf("download image_url failed with status %d", resp.StatusCode)
	}
	data, err := readLimitedImageURLBytes(resp.Body)
	if err != nil {
		return protocol.UploadedImage{}, err
	}
	contentType := uploadedImageContentTypeForJSON(data, resp.Header.Get("Content-Type"))
	if !strings.HasPrefix(contentType, "image/") {
		return protocol.UploadedImage{}, fmt.Errorf("image_url must point to an image")
	}
	filename := safeUploadStem(path.Base(parsed.Path))
	if filename == "" {
		filename = "image"
	}
	ext := extensionForContentType(contentType)
	if ext == "" {
		ext = strings.ToLower(filepath.Ext(parsed.Path))
	}
	if ext == "" {
		ext = ".png"
	}
	return protocol.UploadedImage{Data: data, Filename: filename + ext, ContentType: contentType}, nil
}

func validateJSONImageURLTarget(ctx context.Context, parsed *url.URL) error {
	if parsed == nil {
		return fmt.Errorf("image_url must be a data URL or http/https URL")
	}
	host := strings.TrimSpace(parsed.Hostname())
	if host == "" {
		return fmt.Errorf("image_url must be a data URL or http/https URL")
	}
	addrs, err := resolveJSONImageURLAddrs(ctx, host)
	if err != nil {
		return fmt.Errorf("image_url host lookup failed: %w", err)
	}
	if len(addrs) == 0 {
		return fmt.Errorf("image_url host lookup failed: no address found")
	}
	for _, addr := range addrs {
		if isBlockedJSONImageURLAddr(addr) {
			return fmt.Errorf("image_url must not target private or local network addresses")
		}
	}
	return nil
}

func resolveJSONImageURLAddrs(ctx context.Context, host string) ([]netip.Addr, error) {
	if ip := net.ParseIP(host); ip != nil {
		addr, ok := netip.AddrFromSlice(ip)
		if !ok {
			return nil, fmt.Errorf("invalid ip address")
		}
		return []netip.Addr{addr.Unmap()}, nil
	}
	ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return nil, err
	}
	out := make([]netip.Addr, 0, len(ips))
	for _, item := range ips {
		addr, ok := netip.AddrFromSlice(item.IP)
		if !ok {
			continue
		}
		out = append(out, addr.Unmap())
	}
	return out, nil
}

func isBlockedJSONImageURLAddr(addr netip.Addr) bool {
	addr = addr.Unmap()
	return addr.IsLoopback() ||
		addr.IsPrivate() ||
		addr.IsLinkLocalUnicast() ||
		addr.IsLinkLocalMulticast() ||
		addr.IsMulticast() ||
		addr.IsUnspecified()
}

func uploadedImageFromDataURL(value string) (protocol.UploadedImage, error) {
	header, dataPart, ok := strings.Cut(value, ",")
	if !ok {
		return protocol.UploadedImage{}, fmt.Errorf("invalid image_url data URL")
	}
	header = strings.TrimSpace(header)
	if !strings.HasPrefix(strings.ToLower(header), "data:image/") {
		return protocol.UploadedImage{}, fmt.Errorf("image_url data URL must be image/*")
	}
	if !strings.Contains(strings.ToLower(header), ";base64") {
		return protocol.UploadedImage{}, fmt.Errorf("image_url data URL must be base64 encoded")
	}
	data, err := base64.StdEncoding.DecodeString(strings.TrimSpace(dataPart))
	if err != nil {
		return protocol.UploadedImage{}, fmt.Errorf("invalid image_url data URL")
	}
	if len(data) == 0 {
		return protocol.UploadedImage{}, fmt.Errorf("image_url is empty")
	}
	if len(data) > maxJSONImageReferenceSize {
		return protocol.UploadedImage{}, fmt.Errorf("image_url exceeds %d bytes", maxJSONImageReferenceSize)
	}
	contentType := uploadedImageContentTypeForJSON(data, strings.TrimPrefix(strings.Split(header, ";")[0], "data:"))
	if !strings.HasPrefix(contentType, "image/") {
		return protocol.UploadedImage{}, fmt.Errorf("image_url data URL must be image/*")
	}
	return protocol.UploadedImage{Data: data, Filename: "image" + extensionForContentType(contentType), ContentType: contentType}, nil
}

func readLimitedImageURLBytes(reader io.Reader) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(reader, maxJSONImageReferenceSize+1))
	if err != nil {
		return nil, err
	}
	if len(data) > maxJSONImageReferenceSize {
		return nil, fmt.Errorf("image_url exceeds %d bytes", maxJSONImageReferenceSize)
	}
	if len(data) == 0 {
		return nil, fmt.Errorf("image_url is empty")
	}
	return data, nil
}

func uploadedImageContentTypeForJSON(data []byte, value string) string {
	value = strings.ToLower(strings.TrimSpace(strings.Split(value, ";")[0]))
	detected := strings.ToLower(strings.TrimSpace(strings.Split(http.DetectContentType(data), ";")[0]))
	if detected == "image/jpg" {
		detected = "image/jpeg"
	}
	if strings.HasPrefix(detected, "image/") {
		return detected
	}
	switch value {
	case "image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp":
		if value == "image/jpg" {
			return "image/jpeg"
		}
		return value
	}
	return http.DetectContentType(data)
}

func extensionForContentType(contentType string) string {
	switch strings.ToLower(strings.TrimSpace(contentType)) {
	case "image/jpeg", "image/jpg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	default:
		return ""
	}
}

func readMultipartImageBody(r *http.Request) (map[string]any, []protocol.UploadedImage, error) {
	if err := r.ParseMultipartForm(128 << 20); err != nil {
		return nil, nil, err
	}
	body := map[string]any{
		"client_task_id":           firstForm(r.MultipartForm, "client_task_id"),
		"prompt":                   firstForm(r.MultipartForm, "prompt"),
		"model":                    firstNonEmpty(firstForm(r.MultipartForm, "model"), util.ImageModelAuto),
		"n":                        util.ToInt(firstForm(r.MultipartForm, "n"), 1),
		"size":                     firstForm(r.MultipartForm, "size"),
		"image_resolution":         firstForm(r.MultipartForm, "image_resolution"),
		"quality":                  firstForm(r.MultipartForm, "quality"),
		"background":               firstForm(r.MultipartForm, "background"),
		"moderation":               firstForm(r.MultipartForm, "moderation"),
		"style":                    firstForm(r.MultipartForm, "style"),
		"partial_images":           firstForm(r.MultipartForm, "partial_images"),
		"official_fallback":        firstForm(r.MultipartForm, "official_fallback"),
		"input_image_mask":         firstForm(r.MultipartForm, "input_image_mask"),
		"mask_url":                 firstForm(r.MultipartForm, "mask_url"),
		"image_urls":               r.MultipartForm.Value["image_urls"],
		"output_format":            firstForm(r.MultipartForm, "output_format"),
		"output_compression":       firstForm(r.MultipartForm, "output_compression"),
		"professional_mode":        firstForm(r.MultipartForm, "professional_mode"),
		"share_prompt_parameters":  firstForm(r.MultipartForm, "share_prompt_parameters"),
		"share_reference_images":   firstForm(r.MultipartForm, "share_reference_images"),
		"frontend_conversation_id": firstForm(r.MultipartForm, "frontend_conversation_id"),
		"visibility":               firstForm(r.MultipartForm, "visibility"),
		"response_format":          firstNonEmpty(firstForm(r.MultipartForm, "response_format"), "b64_json"),
		"stream":                   util.ToBool(firstForm(r.MultipartForm, "stream")),
	}
	if rawMessages := strings.TrimSpace(firstForm(r.MultipartForm, "messages")); rawMessages != "" {
		var messages any
		if err := json.Unmarshal([]byte(rawMessages), &messages); err != nil {
			return nil, nil, fmt.Errorf("invalid messages")
		}
		body["messages"] = messages
	}
	if rawFallback := strings.TrimSpace(firstForm(r.MultipartForm, "fallback_reference_image")); rawFallback != "" {
		var fallback any
		if err := json.Unmarshal([]byte(rawFallback), &fallback); err != nil {
			return nil, nil, fmt.Errorf("invalid fallback_reference_image")
		}
		body["fallback_reference_image"] = fallback
	}
	if rawProStudio := strings.TrimSpace(firstForm(r.MultipartForm, "pro_studio")); rawProStudio != "" {
		var proStudio any
		if err := json.Unmarshal([]byte(rawProStudio), &proStudio); err != nil {
			return nil, nil, fmt.Errorf("invalid pro_studio")
		}
		body["pro_studio"] = proStudio
	}
	if rawSettings := strings.TrimSpace(firstForm(r.MultipartForm, "official_settings")); rawSettings != "" {
		var settings any
		if err := json.Unmarshal([]byte(rawSettings), &settings); err != nil {
			return nil, nil, fmt.Errorf("invalid official_settings")
		}
		body["official_settings"] = settings
	}
	if rawSettings := strings.TrimSpace(firstForm(r.MultipartForm, "midjourney_settings")); rawSettings != "" {
		var settings any
		if err := json.Unmarshal([]byte(rawSettings), &settings); err != nil {
			return nil, nil, fmt.Errorf("invalid midjourney_settings")
		}
		body["midjourney_settings"] = settings
	}
	var images []protocol.UploadedImage
	for _, field := range []string{"image", "image[]"} {
		for _, header := range r.MultipartForm.File[field] {
			image, err := readUpload(header)
			if err != nil {
				return nil, nil, err
			}
			if len(image.Data) == 0 {
				return nil, nil, fmt.Errorf("image file is empty")
			}
			images = append(images, image)
		}
	}
	return body, images, nil
}

func firstForm(form *multipart.Form, key string) string {
	if form == nil || len(form.Value[key]) == 0 {
		return ""
	}
	return form.Value[key][0]
}

func readUpload(header *multipart.FileHeader) (protocol.UploadedImage, error) {
	file, err := header.Open()
	if err != nil {
		return protocol.UploadedImage{}, err
	}
	defer file.Close()
	data, err := io.ReadAll(file)
	if err != nil {
		return protocol.UploadedImage{}, err
	}
	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "image/png"
	}
	contentType = uploadedImageContentTypeForJSON(data, contentType)
	filename := header.Filename
	if filename == "" {
		filename = "image" + extensionForContentType(contentType)
	}
	return protocol.UploadedImage{Data: data, Filename: filename, ContentType: contentType}, nil
}

func jsonString(v any) string {
	data, _ := json.Marshal(v)
	return string(data)
}

func openAIErrorForStream(err error) map[string]any {
	err = service.NormalizeImageRequestError(err)
	var policyErr service.ImageContentPolicyError
	if errors.As(err, &policyErr) {
		return util.LocalizeOpenAIErrorPayload(policyErr.OpenAIError())
	}
	var tooLargeErr service.ImageTooLargeError
	if errors.As(err, &tooLargeErr) {
		return util.LocalizeOpenAIErrorPayload(tooLargeErr.OpenAIError())
	}
	var billingErr service.BillingLimitError
	if errors.As(err, &billingErr) {
		return util.LocalizeOpenAIErrorPayload(billingErr.OpenAIError())
	}
	var imageErr *protocol.ImageGenerationError
	if errors.As(err, &imageErr) {
		return util.LocalizeOpenAIErrorPayload(imageErr.OpenAIError())
	}
	return map[string]any{"error": map[string]any{"message": util.LocalizeErrorMessage(err.Error()), "type": fmt.Sprintf("%T", err)}}
}

func (a *App) logCall(ctx context.Context, identity service.Identity, summary, method, endpoint, model string, started time.Time, outcome string, status int, errText string, urls []string, requestCapture auditRequestCapture) {
	method = strings.ToUpper(strings.TrimSpace(method))
	if status <= 0 {
		status = http.StatusOK
		if outcome == "failed" {
			status = http.StatusInternalServerError
		}
	}
	ended := time.Now()
	detail := map[string]any{
		"method":         method,
		"path":           endpoint,
		"endpoint":       endpoint,
		"module":         inferAuditModule(endpoint),
		"model":          model,
		"started_at":     started.Format("2006-01-02 15:04:05"),
		"ended_at":       ended.Format("2006-01-02 15:04:05"),
		"duration_ms":    ended.Sub(started).Milliseconds(),
		"status":         status,
		"outcome":        outcome,
		"operation_type": operationTypeForMethod(method),
		"log_level":      logLevelForStatus(status),
	}
	addIdentityLogDetail(detail, identity)
	if name := identityDisplayName(identity); name != "" {
		detail["username"] = name
	}
	if usedAccounts := protocol.AccountUsageFromContext(ctx); len(usedAccounts) > 0 {
		detail["upstream_accounts"] = usedAccounts
		if len(usedAccounts) == 1 {
			detail["upstream_account_id"] = usedAccounts[0]["account_id"]
			detail["upstream_token_preview"] = usedAccounts[0]["token_preview"]
		}
	}
	if errText != "" {
		detail["error"] = errText
	}
	if len(urls) > 0 {
		detail["urls"] = dedupe(urls)
	}
	addAuditRequestDetail(detail, requestCapture)
	suffix := "调用完成"
	if outcome == "failed" {
		suffix = "调用失败"
	}
	a.logs.Add(summary+suffix, detail)
}

func addIdentityLogDetail(detail map[string]any, identity service.Identity) {
	kind := util.Clean(identity.Kind)
	if kind != "" {
		detail["auth_kind"] = kind
	}
	credentialName := util.Clean(identity.CredentialName)
	if identity.Kind == service.AuthKindSession {
		if credentialName != "" {
			detail["session_name"] = credentialName
		}
	} else if name := util.Clean(firstNonEmpty(identity.CredentialName, identity.Name)); name != "" {
		detail["key_name"] = name
	}
	if role := util.Clean(identity.Role); role != "" {
		detail["key_role"] = role
	}
	if id := util.Clean(firstNonEmpty(identity.CredentialID, identity.ID)); id != "" {
		detail["key_id"] = id
	}
	if id := util.Clean(identity.ID); id != "" && id != util.Clean(identity.CredentialID) {
		detail["subject_id"] = id
	}
	if provider := util.Clean(identity.Provider); provider != "" {
		detail["provider"] = provider
	}
}

func payloadAuditCapture(payload map[string]any) auditRequestCapture {
	args := cleanAuditPayloadMap(payload)
	if len(args) == 0 {
		return auditRequestCapture{}
	}
	return auditRequestCapture{args: service.SanitizeLogValue(args)}
}

func cleanAuditPayloadMap(payload map[string]any) map[string]any {
	out := make(map[string]any, len(payload))
	for key, value := range payload {
		switch key {
		case "owner_id", "owner_name", "base_url", "api_key", "gateway_base_url", protocol.ImageOutputSequentialPayloadKey:
			continue
		}
		if isInternalPayloadValue(value) {
			continue
		}
		out[key] = cleanAuditPayloadValue(value)
	}
	return out
}

func cleanAuditPayloadValue(value any) any {
	switch x := value.(type) {
	case []protocol.UploadedImage:
		items := make([]map[string]any, 0, len(x))
		for _, image := range x {
			items = append(items, map[string]any{
				"filename":     image.Filename,
				"content_type": image.ContentType,
				"size_bytes":   len(image.Data),
			})
		}
		return items
	case protocol.UploadedImage:
		return map[string]any{
			"filename":     x.Filename,
			"content_type": x.ContentType,
			"size_bytes":   len(x.Data),
		}
	default:
		return value
	}
}

func isInternalPayloadValue(value any) bool {
	if value == nil {
		return false
	}
	switch value.(type) {
	case func(context.Context, int) (func(), error), func([]map[string]any):
		return true
	default:
		return false
	}
}

func identityScope(identity service.Identity) string {
	if owner := util.Clean(identity.OwnerID); owner != "" {
		return owner
	}
	if id := util.Clean(identity.ID); id != "" {
		return id
	}
	return "anonymous"
}

func identityDisplayName(identity service.Identity) string {
	return firstNonEmpty(util.Clean(identity.Name), util.Clean(identity.CredentialName))
}

func imageAccessScope(identity service.Identity) service.ImageAccessScope {
	if identity.Role == service.AuthRoleAdmin {
		return service.ImageAccessScope{All: true}
	}
	return service.ImageAccessScope{OwnerID: identityScope(identity)}
}

func (a *App) imageBytesForIdentity(value string, identity service.Identity) ([]byte, string, error) {
	scope := imageAccessScope(identity)
	data, mimeType, err := a.images.ImageBytes(value, scope)
	if err == nil {
		return data, mimeType, nil
	}
	if identity.Role == service.AuthRoleAdmin || a == nil || a.teams == nil {
		return nil, "", err
	}
	access, accessErr := a.images.ImageFileAccess(value, service.ImageAccessScope{All: true})
	if accessErr != nil || access.LibraryScope != service.ImageLibraryScopeTeam || util.Clean(access.TeamID) == "" {
		return nil, "", err
	}
	if _, teamErr := a.teams.ImageLibraryContext(identity, access.TeamID); teamErr != nil {
		return nil, "", err
	}
	return a.images.ImageBytes(value, service.ImageAccessScope{TeamID: access.TeamID})
}

func (a *App) attachFallbackReferenceImage(identity service.Identity, payload map[string]any) {
	if a == nil || a.images == nil || payload == nil || util.Clean(payload["fallback_reference_image_b64"]) != "" {
		return
	}
	fallback := util.StringMap(payload["fallback_reference_image"])
	if len(fallback) == 0 {
		return
	}
	if dataURL := fallbackReferenceDataURL(util.Clean(fallback["b64_json"])); dataURL != "" {
		payload["fallback_reference_image_b64"] = dataURL
		return
	}
	for _, key := range []string{"path", "url"} {
		value := util.Clean(fallback[key])
		if value == "" {
			continue
		}
		data, mimeType, err := a.imageBytesForIdentity(value, identity)
		if err != nil || len(data) == 0 {
			continue
		}
		payload["fallback_reference_image_b64"] = "data:" + mimeType + ";base64," + base64.StdEncoding.EncodeToString(data)
		return
	}
}

func fallbackReferenceDataURL(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	contentType := ""
	dataPart := value
	if strings.HasPrefix(value, "data:") {
		header, data, ok := strings.Cut(value, ",")
		if !ok {
			return ""
		}
		dataPart = data
		contentType = strings.TrimPrefix(strings.Split(header, ";")[0], "data:")
	}
	data, err := base64.StdEncoding.DecodeString(strings.TrimSpace(dataPart))
	if err != nil || len(data) == 0 {
		return ""
	}
	detected := http.DetectContentType(data)
	if !strings.HasPrefix(contentType, "image/") {
		contentType = detected
	}
	if !strings.HasPrefix(contentType, "image/") {
		return ""
	}
	return "data:" + contentType + ";base64," + base64.StdEncoding.EncodeToString(data)
}

func (a *App) imageListAccessScope(identity service.Identity, query url.Values) (service.ImageAccessScope, service.TeamImageLibraryContext, int, string) {
	value := strings.TrimSpace(query.Get("scope"))
	switch value {
	case "":
		return imageAccessScope(identity), service.TeamImageLibraryContext{}, 0, ""
	case "mine":
		return service.ImageAccessScope{OwnerID: identityScope(identity)}, service.TeamImageLibraryContext{}, 0, ""
	case "public":
		return service.ImageAccessScope{}, service.TeamImageLibraryContext{}, http.StatusBadRequest, "public image library is disabled"
	case "team":
		context, status, message := a.imageTeamContext(identity, query.Get("team_id"))
		if status != 0 {
			return service.ImageAccessScope{}, service.TeamImageLibraryContext{}, status, message
		}
		return service.ImageAccessScope{TeamID: context.TeamID}, context, 0, ""
	case "all":
		if identity.Role != service.AuthRoleAdmin {
			return service.ImageAccessScope{}, service.TeamImageLibraryContext{}, http.StatusForbidden, "admin permission required"
		}
		return service.ImageAccessScope{All: true}, service.TeamImageLibraryContext{}, 0, ""
	default:
		return service.ImageAccessScope{}, service.TeamImageLibraryContext{}, http.StatusBadRequest, "scope must be mine, team, or all"
	}
}

func (a *App) imageMutationAccessScope(identity service.Identity, scopeValue, teamID string) (service.ImageAccessScope, int, string) {
	scopeValue = strings.TrimSpace(scopeValue)
	if scopeValue == "" || scopeValue == "mine" {
		return imageAccessScope(identity), 0, ""
	}
	if scopeValue != "team" {
		return service.ImageAccessScope{}, http.StatusBadRequest, "scope must be mine or team"
	}
	context, status, message := a.imageTeamContext(identity, teamID)
	if status != 0 {
		return service.ImageAccessScope{}, status, message
	}
	if !service.TeamRoleCanManageImages(context.Role) {
		return service.ImageAccessScope{}, http.StatusForbidden, "team manager permission required"
	}
	return service.ImageAccessScope{TeamID: context.TeamID, TeamManager: true}, 0, ""
}

func (a *App) textAssetReadScope(identity service.Identity, query url.Values) (service.TextAssetAccessScope, int, string) {
	value := strings.TrimSpace(query.Get("scope"))
	switch value {
	case "", "mine":
		return service.TextAssetAccessScope{OwnerID: identityScope(identity), OwnerName: identityDisplayName(identity)}, 0, ""
	case "team":
		context, status, message := a.imageTeamContext(identity, query.Get("team_id"))
		if status != 0 {
			return service.TextAssetAccessScope{}, status, message
		}
		return service.TextAssetAccessScope{
			TeamID:      context.TeamID,
			TeamName:    context.TeamName,
			TeamManager: service.TeamRoleCanManageImages(context.Role),
		}, 0, ""
	default:
		return service.TextAssetAccessScope{}, http.StatusBadRequest, "scope must be mine or team"
	}
}

func (a *App) textAssetMutationScope(identity service.Identity, scopeValue, teamID string) (service.TextAssetAccessScope, int, string) {
	scopeValue = strings.TrimSpace(scopeValue)
	if scopeValue == "" || scopeValue == "mine" {
		return service.TextAssetAccessScope{OwnerID: identityScope(identity), OwnerName: identityDisplayName(identity)}, 0, ""
	}
	if scopeValue != "team" {
		return service.TextAssetAccessScope{}, http.StatusBadRequest, "scope must be mine or team"
	}
	context, status, message := a.imageTeamContext(identity, teamID)
	if status != 0 {
		return service.TextAssetAccessScope{}, status, message
	}
	if !service.TeamRoleCanManageImages(context.Role) {
		return service.TextAssetAccessScope{}, http.StatusForbidden, "team manager permission required"
	}
	return service.TextAssetAccessScope{TeamID: context.TeamID, TeamName: context.TeamName, TeamManager: true}, 0, ""
}

func (a *App) imageCollectionMutationScope(identity service.Identity, scopeValue, teamID string) (service.ImageAccessScope, service.TeamImageLibraryContext, int, string) {
	scopeValue = strings.TrimSpace(scopeValue)
	if scopeValue == "" || scopeValue == "mine" {
		return imageAccessScope(identity), service.TeamImageLibraryContext{}, 0, ""
	}
	if scopeValue != "team" {
		return service.ImageAccessScope{}, service.TeamImageLibraryContext{}, http.StatusBadRequest, "scope must be mine or team"
	}
	context, status, message := a.imageTeamContext(identity, teamID)
	if status != 0 {
		return service.ImageAccessScope{}, service.TeamImageLibraryContext{}, status, message
	}
	if !service.TeamRoleCanManageImages(context.Role) {
		return service.ImageAccessScope{}, service.TeamImageLibraryContext{}, http.StatusForbidden, "team manager permission required"
	}
	return service.ImageAccessScope{TeamID: context.TeamID, TeamManager: true}, context, 0, ""
}

func (a *App) imageTeamContext(identity service.Identity, teamID string) (service.TeamImageLibraryContext, int, string) {
	if a == nil || a.teams == nil {
		return service.TeamImageLibraryContext{}, http.StatusNotFound, "team not found"
	}
	context, err := a.teams.ImageLibraryContext(identity, teamID)
	if err != nil {
		status := http.StatusBadRequest
		if err.Error() == "team not found" {
			status = http.StatusNotFound
		}
		if err.Error() == "user session is required" {
			status = http.StatusUnauthorized
		}
		return service.TeamImageLibraryContext{}, status, err.Error()
	}
	return context, 0, ""
}

func imageTagsFromQuery(query url.Values) []string {
	raw := append([]string{}, query["tag"]...)
	raw = append(raw, query["tags"]...)
	if len(raw) == 0 {
		return nil
	}
	return service.NormalizeImageTags(strings.Join(raw, ","))
}

func (a *App) recordGeneratedImages(identity service.Identity, urls []string, visibility string) {
	if len(urls) == 0 || a.images == nil {
		return
	}
	ownerID := identityScope(identity)
	a.images.RecordGeneratedImages(urls, ownerID, identityDisplayName(identity), visibility)
	a.cleanupImageStorage()
}

func (a *App) recordProtocolGeneratedImages(identity service.Identity, urls []string, visibility string, payloads ...map[string]any) {
	if len(payloads) > 0 && payloads[0] != nil {
		a.recordGeneratedImagesForPayload(identity, urls, visibility, payloads[0])
		return
	}
	a.recordGeneratedImages(identity, urls, visibility)
}

func (a *App) recordGeneratedImagesForPayload(identity service.Identity, urls []string, visibility string, payload map[string]any) {
	if len(urls) == 0 || a.images == nil {
		return
	}
	ownerID := identityScope(identity)
	outputFormat := service.NormalizeImageOutputFormat(util.Clean(payload["output_format"]))
	outputCompression, hasOutputCompression := service.NormalizeImageOutputCompressionValue(payload["output_compression"])
	var outputCompressionPtr *int
	outputCompressionSupported := service.SupportsImageOutputCompression(outputFormat)
	if service.IsProStudioRequest(payload) {
		outputCompressionSupported = service.SupportsOfficialImageOutputCompression(outputFormat)
	}
	if hasOutputCompression && outputCompressionSupported {
		outputCompressionPtr = &outputCompression
	}
	var partialImagesPtr *int
	if partialImages := util.ToInt(payload["partial_images"], 0); partialImages > 0 {
		partialImagesPtr = &partialImages
	}
	sharePromptParams := util.ToBool(payload["share_prompt_parameters"])
	a.images.RecordGeneratedImages(urls, ownerID, identityDisplayName(identity), visibility, service.GeneratedImageMetadata{
		Prompt:            util.Clean(payload["prompt"]),
		Model:             firstNonEmpty(util.Clean(payload["model"]), util.ImageModelAuto),
		Quality:           util.Clean(payload["quality"]),
		ResolutionPreset:  util.Clean(payload["image_resolution"]),
		RequestedSize:     util.Clean(payload["size"]),
		OutputFormat:      outputFormat,
		OutputCompression: outputCompressionPtr,
		Background:        util.Clean(payload["background"]),
		Moderation:        util.Clean(payload["moderation"]),
		Style:             util.Clean(payload["style"]),
		PartialImages:     partialImagesPtr,
		InputImageMask:    util.Clean(payload["input_image_mask"]),
		ReferenceImages:   imageReferenceMetadataFromPayload(payload),
		ProfessionalMode:  service.IsProStudioRequest(payload),
		ProStudio:         proStudioMetadataFromPayload(payload),
		OfficialSettings:  officialSettingsMetadataFromPayload(payload),
		SharePromptParams: sharePromptParams,
		ShareReferences:   sharePromptParams && util.ToBool(payload["share_reference_images"]),
	})
	a.cleanupImageStorage()
}

func proStudioMetadataFromPayload(payload map[string]any) map[string]any {
	meta := util.StringMap(payload["pro_studio"])
	if len(meta) == 0 {
		return nil
	}
	return util.CopyMap(meta)
}

func officialSettingsMetadataFromPayload(payload map[string]any) map[string]any {
	settings := util.StringMap(payload["official_settings"])
	if len(settings) == 0 && service.IsProStudioRequest(payload) {
		settings = map[string]any{
			"model":         service.OfficialImageModel,
			"size":          util.Clean(payload["size"]),
			"resolution":    firstNonEmpty(util.Clean(payload["resolution"]), util.Clean(payload["image_resolution"])),
			"quality":       util.Clean(payload["quality"]),
			"output_format": service.NormalizeImageOutputFormat(util.Clean(payload["output_format"])),
			"background":    util.Clean(payload["background"]),
			"moderation":    util.Clean(payload["moderation"]),
			"n":             util.ToInt(payload["n"], 1),
		}
		if compression, ok := service.NormalizeImageOutputCompressionValue(payload["output_compression"]); ok && service.SupportsOfficialImageOutputCompression(util.Clean(settings["output_format"])) {
			settings["output_compression"] = compression
		}
	}
	if len(settings) == 0 {
		return nil
	}
	return util.CopyMap(settings)
}

func (a *App) cleanupImageStorage() {
	if a == nil || a.images == nil || a.config == nil {
		return
	}
	_, _ = a.images.CleanupStorage(service.ImageStorageCleanupOptions{
		RetentionDays:    a.config.ImageRetentionDays(),
		MaxBytes:         a.config.ImageStorageLimitBytes(),
		MaxImagesPerUser: a.config.ImageMaxSavedPerUser(),
	})
}

func imageReferenceMetadataFromPayload(payload map[string]any) []service.GeneratedImageReference {
	if payload == nil {
		return nil
	}
	images := uploadedImagesFromPayload(payload["images"])
	if len(images) == 0 {
		images = protocol.ExtractChatContextImages(payload)
	}
	if len(images) == 0 {
		return nil
	}
	refs := make([]service.GeneratedImageReference, 0, len(images))
	for _, image := range images {
		if len(image.Data) == 0 {
			continue
		}
		refs = append(refs, service.GeneratedImageReference{
			Filename:    image.Filename,
			ContentType: image.ContentType,
			Data:        append([]byte(nil), image.Data...),
		})
	}
	return refs
}

func uploadedImagesFromPayload(value any) []protocol.UploadedImage {
	switch images := value.(type) {
	case []protocol.UploadedImage:
		return images
	case protocol.UploadedImage:
		return []protocol.UploadedImage{images}
	default:
		return nil
	}
}

func (a *App) checkProtocolBilling(identity service.Identity, amount int) error {
	if amount <= 0 || a == nil || a.billing == nil || identity.Provider == service.AuthProviderSub2API {
		return nil
	}
	return a.billing.CheckAvailable(identity, amount)
}

func (a *App) protocolBillingReference(identity service.Identity, endpoint, model string) service.BillingReference {
	return service.BillingReference{
		Endpoint:       endpoint,
		Model:          model,
		RequestID:      "req_" + util.NewHex(18),
		CredentialID:   identity.CredentialID,
		CredentialName: identity.CredentialName,
	}
}

func (a *App) chargeProtocolBilling(identity service.Identity, consumed int, ref service.BillingReference) error {
	if a == nil || a.billing == nil || consumed <= 0 {
		return nil
	}
	return a.billing.Charge(identity, consumed, ref)
}

// attachProtocolBillingCharger sets the per-image-output inline charge hook on
// the request body. The hook atomically deducts the estimated image price before
// each image is persisted to disk, preventing gallery writes when balance/quota
// is insufficient. The chargeIndex counter ensures unique charge keys per output.
func (a *App) attachProtocolBillingCharger(body map[string]any, identity service.Identity, billingRef service.BillingReference, unitAmountValues ...int) {
	if a == nil || a.billing == nil || body == nil {
		return
	}
	if identity.Role != service.AuthRoleUser || identity.Provider == service.AuthProviderSub2API {
		return
	}
	unitAmount := 1
	if len(unitAmountValues) > 0 && unitAmountValues[0] > 0 {
		unitAmount = unitAmountValues[0]
	}
	var mu sync.Mutex
	chargeIndex := 0
	body[protocol.ImageOutputChargePayloadKey] = func(index int) error {
		mu.Lock()
		idx := chargeIndex
		chargeIndex++
		mu.Unlock()
		ref := protocolChargeReference(billingRef, "inline", idx)
		return a.billing.Charge(identity, unitAmount, ref)
	}
}

func protocolChargeReference(ref service.BillingReference, scope string, index int) service.BillingReference {
	if strings.TrimSpace(ref.ChargeKey) == "" && ref.Endpoint != "" {
		keyID := firstNonEmpty(ref.RequestID, ref.TaskID, util.NewHex(12))
		ref.ChargeKey = strings.Join([]string{"protocol", ref.Endpoint, keyID, scope, fmt.Sprint(index)}, ":")
	}
	ref.OutputIndex = index
	return ref
}

func (a *App) decorateImageList(payload map[string]any) {
	ownerNames := a.imageOwnerDisplayNames()
	for _, item := range util.AsMapSlice(payload["items"]) {
		a.decorateImageItem(item, ownerNames)
	}
}

func (a *App) decorateImageItem(item map[string]any, ownerNames map[string]string) {
	if item == nil || util.Clean(item["owner_name"]) != "" {
		return
	}
	ownerID := util.Clean(item["owner_id"])
	if ownerID == "" {
		item["owner_name"] = "未知用户"
		return
	}
	if name := ownerNames[ownerID]; name != "" {
		item["owner_name"] = name
		return
	}
	item["owner_name"] = "未知用户"
}

func (a *App) imageOwnerDisplayNames() map[string]string {
	names := map[string]string{"admin": "管理员"}
	for _, item := range a.auth.ListUsers() {
		name := util.Clean(item["name"])
		if name == "" {
			continue
		}
		if id := util.Clean(item["id"]); id != "" {
			names[id] = name
		}
		if ownerID := util.Clean(item["owner_id"]); ownerID != "" {
			names[ownerID] = name
		}
	}
	return names
}

func (a *App) runLoggedImageTask(ctx context.Context, identity service.Identity, payload map[string]any, endpoint, summary string, run func(context.Context, map[string]any) (map[string]any, error)) (map[string]any, error) {
	start := time.Now()
	requestCapture := payloadAuditCapture(payload)
	payload["owner_id"] = identityScope(identity)
	payload["owner_name"] = identityDisplayName(identity)
	a.attachFallbackReferenceImage(identity, payload)
	model := firstNonEmpty(util.Clean(payload["model"]), util.ImageModelAuto)
	result, err := run(ctx, payload)
	urls := collectURLs(result)
	a.recordGeneratedImagesForPayload(identity, collectImageRecordURLs(result), util.Clean(payload["visibility"]), payload)
	if err != nil {
		a.logCall(ctx, identity, summary, http.MethodPost, endpoint, model, start, "failed", protocolErrorHTTPStatus(err), err.Error(), urls, requestCapture)
		return result, err
	}
	if len(util.AsMapSlice(result["data"])) == 0 {
		message := firstNonEmpty(util.Clean(result["message"]), "image task returned no image data")
		a.logCall(ctx, identity, summary, http.MethodPost, endpoint, model, start, "failed", http.StatusBadGateway, message, urls, requestCapture)
		return result, nil
	}
	a.logCall(ctx, identity, summary, http.MethodPost, endpoint, model, start, "success", http.StatusOK, "", urls, requestCapture)
	return result, nil
}

func (a *App) attachCreationTaskLimiter(body map[string]any, identity service.Identity) {
	if a == nil || a.tasks == nil || body == nil {
		return
	}
	body[protocol.ImageOutputSlotAcquirerPayloadKey] = func(ctx context.Context, index int) (func(), error) {
		return a.tasks.AcquireCreationUnit(ctx, identity)
	}
}

func (a *App) runLoggedChatTask(ctx context.Context, identity service.Identity, payload map[string]any) (map[string]any, error) {
	ctx, _ = protocol.WithAccountUsageTracker(ctx)
	start := time.Now()
	requestCapture := payloadAuditCapture(payload)
	payload["owner_id"] = identityScope(identity)
	payload["owner_name"] = identityDisplayName(identity)
	payload["stream"] = false
	model := firstNonEmpty(util.Clean(payload["model"]), util.ImageModelAuto)
	result, stream, err := a.engine.HandleChatCompletions(ctx, payload)
	if stream != nil {
		err = errors.New("chat task streaming is not supported")
	}
	if err != nil {
		a.logCall(ctx, identity, "文本生成", http.MethodPost, "/api/creation-tasks/chat-completions", model, start, "failed", protocolErrorHTTPStatus(err), err.Error(), nil, requestCapture)
		return result, err
	}
	text := chatCompletionResultText(result)
	if text == "" {
		err = errors.New("模型没有返回文本内容")
		a.logCall(ctx, identity, "文本生成", http.MethodPost, "/api/creation-tasks/chat-completions", model, start, "failed", http.StatusBadGateway, err.Error(), nil, requestCapture)
		return result, err
	}
	a.logCall(ctx, identity, "文本生成", http.MethodPost, "/api/creation-tasks/chat-completions", model, start, "success", http.StatusOK, "", nil, requestCapture)
	taskResult := map[string]any{
		"created":     result["created"],
		"output_type": "text",
		"data":        []map[string]any{{"text_response": text}},
	}
	if usage := util.StringMap(result["usage"]); len(usage) > 0 {
		taskResult["usage"] = util.CopyMap(usage)
	}
	return taskResult, nil
}

func chatCompletionResultText(result map[string]any) string {
	for _, choice := range util.AsMapSlice(result["choices"]) {
		message := util.StringMap(choice["message"])
		if text := chatCompletionContentText(message["content"]); text != "" {
			return text
		}
	}
	return ""
}

func chatCompletionContentText(content any) string {
	if text, ok := content.(string); ok {
		return strings.TrimSpace(text)
	}
	var parts []string
	for _, item := range anyList(content) {
		block := util.StringMap(item)
		if text := util.Clean(block["text"]); text != "" {
			parts = append(parts, text)
		}
	}
	return strings.TrimSpace(strings.Join(parts, "\n"))
}

func collectURLs(v any) []string {
	switch x := v.(type) {
	case map[string]any:
		var urls []string
		for key, value := range x {
			if key == "url" {
				if u := util.Clean(value); u != "" {
					urls = append(urls, u)
				}
			} else if key == "urls" {
				for _, raw := range anyList(value) {
					if u := util.Clean(raw); u != "" {
						urls = append(urls, u)
					}
				}
			} else {
				urls = append(urls, collectURLs(value)...)
			}
		}
		return urls
	case []any:
		var urls []string
		for _, item := range x {
			urls = append(urls, collectURLs(item)...)
		}
		return urls
	case []map[string]any:
		var urls []string
		for _, item := range x {
			urls = append(urls, collectURLs(item)...)
		}
		return urls
	default:
		return nil
	}
}

func collectImageRecordURLs(v any) []string {
	switch x := v.(type) {
	case map[string]any:
		var urls []string
		if localURL := util.Clean(x["local_url"]); localURL != "" {
			urls = append(urls, localURL)
		} else if u := util.Clean(x["url"]); u != "" {
			urls = append(urls, u)
		}
		if rawURLs, ok := x["urls"]; ok {
			for _, raw := range anyList(rawURLs) {
				if u := util.Clean(raw); u != "" {
					urls = append(urls, u)
				}
			}
		}
		for key, value := range x {
			if key == "url" || key == "local_url" || key == "urls" {
				continue
			}
			urls = append(urls, collectImageRecordURLs(value)...)
		}
		return urls
	case []any:
		var urls []string
		for _, item := range x {
			urls = append(urls, collectImageRecordURLs(item)...)
		}
		return urls
	case []map[string]any:
		var urls []string
		for _, item := range x {
			urls = append(urls, collectImageRecordURLs(item)...)
		}
		return urls
	default:
		return nil
	}
}

func protocolBillableUnits(endpoint string, body map[string]any) int {
	switch endpoint {
	case "/v1/images/generations", "/v1/images/edits":
		return normalizedProtocolImageCount(body["n"])
	case "/v1/chat/completions":
		if protocol.IsImageChatRequest(body) {
			return normalizedProtocolImageCount(body["n"])
		}
	case "/v1/responses":
		if protocol.HasResponseImageGenerationTool(body) {
			return normalizedProtocolImageCount(body["n"])
		}
	}
	return 0
}

func normalizedProtocolImageCount(value any) int {
	n := util.ToInt(value, 1)
	if n < 1 {
		return 1
	}
	if n > 4 {
		return 4
	}
	return n
}

func protocolImageBillingUnitAmount(model string, body map[string]any) int {
	size := protocolBillingResolution("", body)
	if size == "" {
		size = util.Clean(body["requested_size"])
	}
	if size == "" {
		size = util.Clean(body["size"])
	}
	return service.EstimateImageBillingUnitAmount(model, size, util.Clean(body["quality"]))
}

func protocolBillingResolution(size string, body map[string]any) string {
	switch service.NormalizeImageResolutionPreset(util.Clean(body["image_resolution"])) {
	case "2k":
		return "2K"
	case "4k":
		return "4K"
	default:
		return size
	}
}

func billableProtocolOutputCount(endpoint string, result map[string]any) int {
	if len(result) == 0 {
		return 0
	}
	switch endpoint {
	case "/v1/images/generations", "/v1/images/edits":
		return billableImageDataCount(result["data"])
	case "/v1/chat/completions":
		return countChatCompletionImages(result)
	case "/v1/responses":
		return countResponseOutputImages(result)
	default:
		return billableURLCount(collectURLs(result))
	}
}

func billableProtocolStreamItemCount(endpoint string, item map[string]any) int {
	if len(item) == 0 {
		return 0
	}
	switch endpoint {
	case "/v1/images/generations", "/v1/images/edits":
		if util.Clean(item["object"]) == "image.generation.result" {
			return billableImageDataCount(item["data"])
		}
	case "/v1/chat/completions":
		for _, choice := range util.AsMapSlice(item["choices"]) {
			delta := util.StringMap(choice["delta"])
			if len(delta) == 0 {
				delta = util.StringMap(choice["message"])
			}
			if count := countImagesInChatContent(delta["content"]); count > 0 {
				return count
			}
		}
	case "/v1/responses":
		eventType := util.Clean(item["type"])
		switch eventType {
		case "response.output_item.done", "response.output_item.added":
			if count := countResponseOutputItemImages(util.StringMap(item["item"])); count > 0 {
				return count
			}
		}
	}
	return 0
}

func billableImageDataCount(value any) int {
	count := 0
	for _, item := range util.AsMapSlice(value) {
		if util.Clean(item["url"]) != "" || util.Clean(item["b64_json"]) != "" {
			count++
		}
	}
	return count
}

func countChatCompletionImages(result map[string]any) int {
	count := 0
	for _, choice := range util.AsMapSlice(result["choices"]) {
		message := util.StringMap(choice["message"])
		count += countImagesInChatContent(message["content"])
	}
	return count
}

func countImagesInChatContent(content any) int {
	switch value := content.(type) {
	case string:
		return strings.Count(value, "![")
	case []any:
		count := 0
		for _, raw := range value {
			item := util.StringMap(raw)
			if util.Clean(item["type"]) == "image_url" || util.Clean(item["image_url"]) != "" {
				count++
			}
			if util.Clean(item["type"]) == "text" {
				count += strings.Count(util.Clean(item["text"]), "![")
			}
		}
		return count
	default:
		return 0
	}
}

func countResponseOutputImages(result map[string]any) int {
	count := 0
	for _, item := range util.AsMapSlice(result["output"]) {
		count += countResponseOutputItemImages(item)
	}
	return count
}

func countResponseOutputItemImages(item map[string]any) int {
	if util.Clean(item["type"]) == "image_generation_call" && util.Clean(item["result"]) != "" {
		return 1
	}
	return 0
}

func billableURLCount(urls []string) int {
	return len(dedupe(urls))
}

func dedupe(items []string) []string {
	seen := map[string]struct{}{}
	var out []string
	for _, item := range items {
		if _, ok := seen[item]; ok {
			continue
		}
		seen[item] = struct{}{}
		out = append(out, item)
	}
	return out
}

func anyList(v any) []any {
	if list, ok := v.([]any); ok {
		return list
	}
	if list, ok := v.([]map[string]any); ok {
		out := make([]any, len(list))
		for i, item := range list {
			out[i] = item
		}
		return out
	}
	return nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func firstNonNil(values ...any) any {
	for _, value := range values {
		if value != nil {
			return value
		}
	}
	return nil
}

func (a *App) serveWeb(w http.ResponseWriter, r *http.Request) {
	if a.shouldRedirectIndependentWebRequest(r) {
		http.Redirect(w, r, "/login", http.StatusFound)
		return
	}
	frontend.Handler().ServeHTTP(w, r)
}

func (a *App) shouldRedirectIndependentWebRequest(r *http.Request) bool {
	if a == nil || r == nil || !a.luoyeIndependentMode() {
		return false
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		return false
	}
	path := strings.TrimSpace(r.URL.Path)
	if !isIndependentProtectedWebPath(path) {
		return false
	}
	token := requestAuthCookieToken(r)
	if token == "" {
		return true
	}
	return a.auth.Authenticate(token) == nil
}

func isIndependentProtectedWebPath(path string) bool {
	switch path {
	case "", "/":
		return true
	}
	for _, prefix := range []string{"/image", "/canvas", "/ecommerce-suite", "/social", "/image-manager", "/profile"} {
		if path == prefix || strings.HasPrefix(path, prefix+"/") {
			return true
		}
	}
	return false
}
