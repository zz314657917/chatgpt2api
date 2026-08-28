package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

const beadProjectRequestMaxBytes = service.BeadProjectMaxJSONBytes

type beadProjectWriteRequest struct {
	Revision int                         `json:"revision"`
	Item     service.BeadProjectDocument `json:"item"`
}

type beadProjectRenameRequest struct {
	Revision int    `json:"revision"`
	Name     string `json:"name"`
}

func (a *App) handleBeadProjects(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	if a.beadProjects == nil {
		util.WriteError(w, http.StatusServiceUnavailable, "bead project service is unavailable")
		return
	}
	parts := splitPath(r.URL.Path)
	if r.URL.Path == "/api/bead-projects" {
		switch r.Method {
		case http.MethodGet:
			items, err := a.beadProjects.List(identity)
			if err != nil {
				writeBeadProjectError(w, err)
				return
			}
			util.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
		case http.MethodPost:
			var request struct {
				Item *service.BeadProjectDocument `json:"item"`
			}
			if err := decodeBeadProjectJSON(w, r, &request); err != nil {
				writeBeadProjectDecodeError(w, err)
				return
			}
			item, err := a.beadProjects.Create(identity, request.Item)
			if err != nil {
				writeBeadProjectError(w, err)
				return
			}
			util.WriteJSON(w, http.StatusCreated, map[string]any{"item": item})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}
	if len(parts) < 3 || len(parts) > 4 || parts[0] != "api" || parts[1] != "bead-projects" {
		http.NotFound(w, r)
		return
	}
	id := parts[2]
	if len(parts) == 4 {
		if parts[3] != "copies" || r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		item, err := a.beadProjects.Copy(identity, id)
		if err != nil {
			writeBeadProjectError(w, err)
			return
		}
		util.WriteJSON(w, http.StatusCreated, map[string]any{"item": item})
		return
	}
	switch r.Method {
	case http.MethodGet:
		item, err := a.beadProjects.Get(identity, id)
		if err != nil {
			writeBeadProjectError(w, err)
			return
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{"item": item})
	case http.MethodPut:
		var request beadProjectWriteRequest
		if err := decodeBeadProjectJSON(w, r, &request); err != nil {
			writeBeadProjectDecodeError(w, err)
			return
		}
		item, err := a.beadProjects.Update(identity, id, request.Revision, request.Item)
		if err != nil {
			writeBeadProjectError(w, err)
			return
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{"item": item})
	case http.MethodPatch:
		var request beadProjectRenameRequest
		if err := decodeBeadProjectJSON(w, r, &request); err != nil {
			writeBeadProjectDecodeError(w, err)
			return
		}
		item, err := a.beadProjects.Rename(identity, id, request.Revision, request.Name)
		if err != nil {
			writeBeadProjectError(w, err)
			return
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{"item": item})
	case http.MethodDelete:
		if err := a.beadProjects.Delete(identity, id); err != nil {
			writeBeadProjectError(w, err)
			return
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{"deleted": true, "id": id})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func decodeBeadProjectJSON(w http.ResponseWriter, r *http.Request, output any) error {
	r.Body = http.MaxBytesReader(w, r.Body, beadProjectRequestMaxBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(output); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		if err == nil {
			return fmt.Errorf("invalid trailing JSON data")
		}
		return err
	}
	return nil
}

func writeBeadProjectDecodeError(w http.ResponseWriter, err error) {
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		util.WriteError(w, http.StatusRequestEntityTooLarge, "拼豆工程 JSON 不能超过 5 MiB")
		return
	}
	util.WriteError(w, http.StatusBadRequest, "invalid bead project json: "+err.Error())
}

func writeBeadProjectError(w http.ResponseWriter, err error) {
	if errors.Is(err, service.ErrBeadProjectNotFound) {
		util.WriteError(w, http.StatusNotFound, service.ErrBeadProjectNotFound.Error())
		return
	}
	var conflict *service.BeadProjectConflictError
	if errors.As(err, &conflict) {
		util.WriteJSON(w, http.StatusConflict, map[string]any{
			"detail": map[string]any{
				"error":           conflict.Error(),
				"latest_revision": conflict.LatestRevision,
			},
			"latest_revision": conflict.LatestRevision,
		})
		return
	}
	if strings.Contains(err.Error(), "5 MiB") {
		util.WriteError(w, http.StatusRequestEntityTooLarge, err.Error())
		return
	}
	if isBeadProjectValidationError(err) {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	util.WriteError(w, http.StatusInternalServerError, err.Error())
}

func isBeadProjectValidationError(err error) bool {
	message := err.Error()
	for _, marker := range []string{
		"schema_version", "工程名称", "画布宽高", "格子", "图层", "active_brand", "palette_version", "引用无效", "最多只能创建",
	} {
		if strings.Contains(message, marker) {
			return true
		}
	}
	return false
}
