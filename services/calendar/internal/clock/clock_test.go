package clock

import (
	"testing"
	"time"
)

func TestSettable(t *testing.T) {
	var c Settable
	target := time.Date(2026, 11, 2, 14, 0, 0, 0, time.UTC)
	c.Set(target)
	if d := c.Now().Sub(target); d < 0 || d > time.Second {
		t.Fatalf("reloj desviado %v", d)
	}
	c.Set(time.Time{})
	if d := time.Since(c.Now()); d > time.Second || d < -time.Second {
		t.Fatalf("no volvió al reloj real: %v", d)
	}
}
