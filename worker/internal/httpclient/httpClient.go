// Package httpclient is the thin outbound HTTP client used for all
// worker→backend internal calls. Every request carries the shared
// X-Worker-Key header (CONTRACTS §4.5 / §5) and targets paths relative to
// BACKEND_INTERNAL_URL. It exposes a single PostJSON helper that the event
// publisher uses for /internal/alerts, /internal/stats and
// /internal/camera-state.
package httpclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client wraps an *http.Client with the backend base URL and shared key.
type Client struct {
	baseURL string
	apiKey  string
	hc      *http.Client
}

// New builds a Client. baseURL should be the backend internal base (already
// without a trailing slash, e.g. http://backend:8080/api/v1). apiKey is the
// shared WORKER_API_KEY sent as X-Worker-Key.
func New(baseURL, apiKey string) *Client {
	return &Client{
		baseURL: baseURL,
		apiKey:  apiKey,
		hc: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// PostJSON marshals body to JSON and POSTs it to baseURL+path with the
// X-Worker-Key header. It returns an error for transport failures or any
// non-2xx status (so callers can retry). The response body is fully read and
// discarded to allow connection reuse.
func (c *Client) PostJSON(ctx context.Context, path string, body any) error {
	buf, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("marshal body: %w", err)
	}

	url := c.baseURL + path
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(buf))
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Worker-Key", c.apiKey)

	resp, err := c.hc.Do(req)
	if err != nil {
		return fmt.Errorf("post %s: %w", path, err)
	}
	defer func() {
		_, _ = io.Copy(io.Discard, resp.Body)
		_ = resp.Body.Close()
	}()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("post %s: status %d: %s", path, resp.StatusCode, string(snippet))
	}
	return nil
}
