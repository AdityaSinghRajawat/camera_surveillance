// Package control implements the worker's inbound HTTP control + signaling API
// (CONTRACTS §5), served on WORKER_HTTP_PORT using only the stdlib net/http
// router. Mutating routes (start/stop/webrtc-offer) are guarded by the
// X-Worker-Key header; /health is unguarded. The camera id is parsed from the
// path. Handlers translate requests into Manager calls and never block on the
// camera pipelines themselves.
package control

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/skylark/worker/internal/camera"
	"github.com/skylark/worker/pkg/logger"
)

// Server is the control HTTP server.
type Server struct {
	mgr    *camera.Manager
	apiKey string
	log    logger.Logger
	http   *http.Server
}

// New builds the control server bound to addr (e.g. ":8090").
func New(addr string, mgr *camera.Manager, apiKey string, log logger.Logger) *Server {
	s := &Server{
		mgr:    mgr,
		apiKey: apiKey,
		log:    log,
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/cameras/", s.routeCameras)

	s.http = &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	return s
}

// ListenAndServe starts serving and blocks until the server is closed.
func (s *Server) ListenAndServe() error {
	s.log.Info("control server listening", "addr", s.http.Addr)
	err := s.http.ListenAndServe()
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}

// Shutdown gracefully stops the HTTP server.
func (s *Server) Shutdown(ctx context.Context) error {
	return s.http.Shutdown(ctx)
}

// routeCameras dispatches /cameras/{id}/{action} requests. Stdlib mux gives us
// the prefix; we parse the id and action from the remaining path.
func (s *Server) routeCameras(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/cameras/")
	parts := strings.Split(strings.Trim(rest, "/"), "/")
	// Expected: {id}/start | {id}/stop | {id}/webrtc/offer
	if len(parts) < 2 || parts[0] == "" {
		http.NotFound(w, r)
		return
	}
	id := parts[0]
	action := strings.Join(parts[1:], "/")

	switch {
	case action == "start" && r.Method == http.MethodPost:
		s.guard(s.handleStart)(w, r, id)
	case action == "stop" && r.Method == http.MethodPost:
		s.guard(s.handleStop)(w, r, id)
	case action == "webrtc/offer" && r.Method == http.MethodPost:
		s.guard(s.handleOffer)(w, r, id)
	default:
		http.NotFound(w, r)
	}
}

// idHandler is a handler that has the parsed camera id available.
type idHandler func(w http.ResponseWriter, r *http.Request, id string)

// guard wraps an idHandler with X-Worker-Key authentication.
func (s *Server) guard(h idHandler) idHandler {
	return func(w http.ResponseWriter, r *http.Request, id string) {
		key := r.Header.Get("X-Worker-Key")
		if subtle.ConstantTimeCompare([]byte(key), []byte(s.apiKey)) != 1 {
			s.writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		h(w, r, id)
	}
}

// --- handlers ---

type startReq struct {
	CameraID string `json:"cameraId"`
	RTSPURL  string `json:"rtspUrl"`
}

func (s *Server) handleStart(w http.ResponseWriter, r *http.Request, id string) {
	var req startReq
	if err := decode(r, &req); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	camID := firstNonEmpty(req.CameraID, id)
	if req.RTSPURL == "" {
		s.writeError(w, http.StatusBadRequest, "rtspUrl required")
		return
	}
	if err := s.mgr.Start(camID, req.RTSPURL); err != nil {
		s.writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]string{"status": "starting"})
}

type stopReq struct {
	CameraID string `json:"cameraId"`
}

func (s *Server) handleStop(w http.ResponseWriter, r *http.Request, id string) {
	var req stopReq
	// Body is optional for stop; ignore decode errors on empty body.
	_ = decode(r, &req)
	camID := firstNonEmpty(req.CameraID, id)
	if err := s.mgr.Stop(camID); err != nil {
		s.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]string{"status": "stopped"})
}

type offerReq struct {
	SDP  string `json:"sdp"`
	Type string `json:"type"`
}

type offerResp struct {
	SDP  string `json:"sdp"`
	Type string `json:"type"`
}

func (s *Server) handleOffer(w http.ResponseWriter, r *http.Request, id string) {
	var req offerReq
	if err := decode(r, &req); err != nil || req.SDP == "" {
		s.writeError(w, http.StatusBadRequest, "invalid offer")
		return
	}
	answer, err := s.mgr.HandleOffer(id, req.SDP)
	if err != nil {
		if errors.Is(err, camera.ErrStreamNotReady) {
			s.writeError(w, http.StatusServiceUnavailable, "stream not ready")
			return
		}
		s.writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	s.writeJSON(w, http.StatusOK, offerResp{SDP: answer, Type: "answer"})
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.NotFound(w, r)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"cameras": s.mgr.Count(),
	})
}

// --- helpers ---

func decode(r *http.Request, v any) error {
	defer func() { _ = r.Body.Close() }()
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 1<<20))
	return dec.Decode(v)
}

func (s *Server) writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		s.log.Warn("write json failed", "error", err)
	}
}

func (s *Server) writeError(w http.ResponseWriter, status int, msg string) {
	s.writeJSON(w, status, map[string]any{
		"error": map[string]any{
			"code":    http.StatusText(status),
			"message": msg,
		},
	})
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
