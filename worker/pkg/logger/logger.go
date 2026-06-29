// Package logger provides a small structured logging wrapper around the
// standard library's log/slog. It exposes a leveled, JSON-or-text logger that
// the rest of the worker shares. Sub-loggers (e.g. per camera) are created with
// With so every line carries the relevant context.
package logger

import (
	"log/slog"
	"os"
	"strings"
)

// Logger is the structured logger type used across the worker. It is an alias
// for *slog.Logger so callers get the full slog API (Info, Error, With, ...).
type Logger = *slog.Logger

// New builds a leveled slog logger writing JSON to stderr. The level string is
// case-insensitive and accepts: debug, info, warn, error. Unknown values fall
// back to info.
func New(level string) Logger {
	lvl := parseLevel(level)
	handler := slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{
		Level: lvl,
	})
	return slog.New(handler)
}

// parseLevel maps a textual level to an slog.Level.
func parseLevel(level string) slog.Level {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
