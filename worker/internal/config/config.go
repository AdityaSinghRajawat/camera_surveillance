// Package config loads, validates and exposes the worker configuration. All
// values come from environment variables (see CONTRACTS §7 "Worker"). Required
// values are validated once at startup via Load; everything else falls back to
// the documented defaults. Access is through getters on the immutable Config
// value so the rest of the program never touches os.Getenv directly.
package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config is the validated, immutable worker configuration.
type Config struct {
	httpPort        int
	webrtcUDPPort   int
	webrtcPublicIP  string
	backendInternal string
	workerAPIKey    string

	detectionPrototxt   string
	detectionModel      string
	detectionConfidence float64
	detectionInterval   time.Duration

	alertDedupWindow time.Duration
	statsInterval    time.Duration

	logLevel string
}

// Load reads configuration from the environment, applies defaults and validates
// required fields. It returns an error listing every problem found so the
// operator can fix them all at once.
func Load() (*Config, error) {
	c := &Config{}
	var errs []string

	c.httpPort = getInt("WORKER_HTTP_PORT", 8090)
	c.webrtcUDPPort = getInt("WEBRTC_UDP_PORT", 8091)
	c.webrtcPublicIP = getStr("WEBRTC_PUBLIC_IP", "127.0.0.1")
	c.backendInternal = strings.TrimRight(getStr("BACKEND_INTERNAL_URL", "http://backend:8080/api/v1"), "/")
	c.workerAPIKey = getStr("WORKER_API_KEY", "")

	c.detectionPrototxt = getStr("DETECTION_PROTOTXT", "/models/MobileNetSSD_deploy.prototxt")
	c.detectionModel = getStr("DETECTION_MODEL", "/models/MobileNetSSD_deploy.caffemodel")
	c.detectionConfidence = getFloat("DETECTION_CONFIDENCE", 0.5)
	c.detectionInterval = time.Duration(getInt("DETECTION_INTERVAL_MS", 200)) * time.Millisecond

	c.alertDedupWindow = time.Duration(getInt("ALERT_DEDUP_WINDOW_MS", 5000)) * time.Millisecond
	c.statsInterval = time.Duration(getInt("STATS_INTERVAL_MS", 2000)) * time.Millisecond

	c.logLevel = getStr("LOG_LEVEL", "info")

	// Validation of required / sane values.
	if c.workerAPIKey == "" {
		errs = append(errs, "WORKER_API_KEY is required")
	}
	if c.httpPort <= 0 || c.httpPort > 65535 {
		errs = append(errs, fmt.Sprintf("WORKER_HTTP_PORT invalid: %d", c.httpPort))
	}
	if c.webrtcUDPPort <= 0 || c.webrtcUDPPort > 65535 {
		errs = append(errs, fmt.Sprintf("WEBRTC_UDP_PORT invalid: %d", c.webrtcUDPPort))
	}
	if c.webrtcPublicIP == "" {
		errs = append(errs, "WEBRTC_PUBLIC_IP is required")
	}
	if c.backendInternal == "" {
		errs = append(errs, "BACKEND_INTERNAL_URL is required")
	}
	if c.detectionConfidence < 0 || c.detectionConfidence > 1 {
		errs = append(errs, fmt.Sprintf("DETECTION_CONFIDENCE must be in [0,1]: %v", c.detectionConfidence))
	}
	if c.detectionInterval <= 0 {
		errs = append(errs, "DETECTION_INTERVAL_MS must be > 0")
	}
	if c.statsInterval <= 0 {
		errs = append(errs, "STATS_INTERVAL_MS must be > 0")
	}

	if len(errs) > 0 {
		return nil, errors.New("config validation failed: " + strings.Join(errs, "; "))
	}
	return c, nil
}

// HTTPPort is the control/signaling HTTP server port.
func (c *Config) HTTPPort() int { return c.httpPort }

// HTTPAddr is the listen address for the control server.
func (c *Config) HTTPAddr() string { return fmt.Sprintf(":%d", c.httpPort) }

// WebRTCUDPPort is the single UDP port the ICE mux binds to.
func (c *Config) WebRTCUDPPort() int { return c.webrtcUDPPort }

// WebRTCPublicIP is the NAT 1-to-1 host candidate IP advertised to browsers.
func (c *Config) WebRTCPublicIP() string { return c.webrtcPublicIP }

// BackendInternalURL is the backend base URL for internal worker→backend calls.
func (c *Config) BackendInternalURL() string { return c.backendInternal }

// WorkerAPIKey is the shared secret used in the X-Worker-Key header both ways.
func (c *Config) WorkerAPIKey() string { return c.workerAPIKey }

// DetectionPrototxt is the path to the MobileNet-SSD prototxt file.
func (c *Config) DetectionPrototxt() string { return c.detectionPrototxt }

// DetectionModel is the path to the MobileNet-SSD caffemodel file.
func (c *Config) DetectionModel() string { return c.detectionModel }

// DetectionConfidence is the minimum confidence to keep a detection.
func (c *Config) DetectionConfidence() float64 { return c.detectionConfidence }

// DetectionInterval is the minimum time between detection inferences per camera.
func (c *Config) DetectionInterval() time.Duration { return c.detectionInterval }

// AlertDedupWindow suppresses duplicate person alerts within this window.
func (c *Config) AlertDedupWindow() time.Duration { return c.alertDedupWindow }

// StatsInterval is how often per-camera stats are emitted.
func (c *Config) StatsInterval() time.Duration { return c.statsInterval }

// LogLevel is the configured log level string.
func (c *Config) LogLevel() string { return c.logLevel }

// --- env helpers ---

func getStr(key, def string) string {
	if v, ok := os.LookupEnv(key); ok && strings.TrimSpace(v) != "" {
		return strings.TrimSpace(v)
	}
	return def
}

func getInt(key string, def int) int {
	if v, ok := os.LookupEnv(key); ok {
		if n, err := strconv.Atoi(strings.TrimSpace(v)); err == nil {
			return n
		}
	}
	return def
}

func getFloat(key string, def float64) float64 {
	if v, ok := os.LookupEnv(key); ok {
		if f, err := strconv.ParseFloat(strings.TrimSpace(v), 64); err == nil {
			return f
		}
	}
	return def
}
