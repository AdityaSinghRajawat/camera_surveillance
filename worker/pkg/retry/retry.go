// Package retry implements a small, dependency-free exponential backoff helper
// that always honors context cancellation. It is used by the camera pipeline to
// auto-restart transient failures with capped backoff, and by the event
// publisher to retry failed HTTP POSTs without ever blocking forever.
package retry

import (
	"context"
	"math/rand"
	"time"
)

// Config controls the backoff schedule.
type Config struct {
	// MaxAttempts is the maximum number of attempts. Zero or negative means
	// unlimited (until the context is cancelled).
	MaxAttempts int
	// InitialDelay is the delay before the first retry.
	InitialDelay time.Duration
	// MaxDelay caps the per-attempt delay.
	MaxDelay time.Duration
	// Multiplier grows the delay each attempt (e.g. 2.0 for doubling).
	Multiplier float64
	// Jitter, when true, applies up to +/-20% random jitter to each delay to
	// avoid thundering-herd reconnects.
	Jitter bool
}

// DefaultConfig returns a sensible capped-backoff config for stream restarts.
func DefaultConfig() Config {
	return Config{
		MaxAttempts:  0, // unlimited; bounded by context cancellation
		InitialDelay: 500 * time.Millisecond,
		MaxDelay:     30 * time.Second,
		Multiplier:   2.0,
		Jitter:       true,
	}
}

// Op is a unit of retryable work. Returning nil means success; returning a
// non-nil error triggers another attempt (subject to limits).
type Op func() error

// Do runs op with exponential backoff until it succeeds, the attempt cap is
// reached, or ctx is cancelled. It returns the last error from op, or
// ctx.Err() if the context was cancelled while waiting.
func Do(ctx context.Context, cfg Config, op Op) error {
	delay := cfg.InitialDelay
	if delay <= 0 {
		delay = 100 * time.Millisecond
	}
	mult := cfg.Multiplier
	if mult <= 0 {
		mult = 2.0
	}

	var lastErr error
	for attempt := 1; ; attempt++ {
		if err := ctx.Err(); err != nil {
			return err
		}

		lastErr = op()
		if lastErr == nil {
			return nil
		}

		if cfg.MaxAttempts > 0 && attempt >= cfg.MaxAttempts {
			return lastErr
		}

		wait := delay
		if cfg.Jitter {
			wait = applyJitter(wait)
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(wait):
		}

		delay = nextDelay(delay, mult, cfg.MaxDelay)
	}
}

// nextDelay grows the delay geometrically, capped at maxDelay.
func nextDelay(cur time.Duration, mult float64, maxDelay time.Duration) time.Duration {
	next := time.Duration(float64(cur) * mult)
	if maxDelay > 0 && next > maxDelay {
		return maxDelay
	}
	return next
}

// applyJitter returns d perturbed by up to +/-20%.
func applyJitter(d time.Duration) time.Duration {
	if d <= 0 {
		return d
	}
	delta := float64(d) * 0.2
	// random in [-delta, +delta]
	j := (rand.Float64()*2 - 1) * delta
	out := time.Duration(float64(d) + j)
	if out < 0 {
		return 0
	}
	return out
}
