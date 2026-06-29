package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/skylark/worker/internal/camera"
	"github.com/skylark/worker/internal/config"
	"github.com/skylark/worker/internal/control"
	"github.com/skylark/worker/internal/detection"
	"github.com/skylark/worker/internal/eventbus"
	"github.com/skylark/worker/internal/httpclient"
	wrtc "github.com/skylark/worker/internal/webrtc"
	"github.com/skylark/worker/pkg/logger"
)

// run is the full application wiring: it loads config, builds the logger, the
// outbound HTTP client, the event publisher, the shared WebRTC engine, the
// camera manager and the control HTTP server, then blocks until SIGINT/SIGTERM
// and performs a graceful shutdown of every camera and server. It returns a
// process exit code.
func run() int {
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintln(os.Stderr, "config error:", err)
		return 2
	}

	log := logger.New(cfg.LogLevel())
	log.Info("starting skylark worker",
		"httpPort", cfg.HTTPPort(),
		"webrtcUdpPort", cfg.WebRTCUDPPort(),
		"backend", cfg.BackendInternalURL(),
	)

	// Root context cancelled on shutdown signal; all cameras derive from it.
	rootCtx, cancelRoot := context.WithCancel(context.Background())
	defer cancelRoot()

	// Outbound client + publisher.
	client := httpclient.New(cfg.BackendInternalURL(), cfg.WorkerAPIKey())
	pub := eventbus.New(client, log, cfg.AlertDedupWindow())

	// Shared WebRTC engine (single UDP mux + NAT 1-to-1).
	engine, err := wrtc.NewEngine(cfg.WebRTCUDPPort(), cfg.WebRTCPublicIP(), log)
	if err != nil {
		log.Error("failed to init webrtc engine", "error", err)
		return 1
	}
	defer func() { _ = engine.Close() }()

	// Detector factory: cmd is the single place wiring the gocv-backed detector
	// into the OpenCV-free camera package (one net per camera for isolation).
	newDetector := func() (camera.Detector, error) {
		return detection.NewDetector(
			cfg.DetectionPrototxt(),
			cfg.DetectionModel(),
			cfg.DetectionConfidence(),
		)
	}

	// Camera manager + control server.
	mgr := camera.NewManager(rootCtx, cfg, log, pub, engine, newDetector)
	srv := control.New(cfg.HTTPAddr(), mgr, cfg.WorkerAPIKey(), log)

	serveErr := make(chan error, 1)
	go func() {
		serveErr <- srv.ListenAndServe()
	}()

	// Wait for a shutdown signal or a fatal server error.
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case s := <-sigCh:
		log.Info("shutdown signal received", "signal", s.String())
	case err := <-serveErr:
		if err != nil {
			log.Error("control server failed", "error", err)
			return 1
		}
	}

	// Graceful shutdown: stop accepting requests, stop all cameras, cancel root.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Warn("control server shutdown error", "error", err)
	}

	// Cancel root so any in-flight pipelines unwind, then stop cameras cleanly.
	cancelRoot()
	mgr.StopAll()

	log.Info("worker stopped cleanly")
	return 0
}
