package main

import "testing"

func TestGetEnvironment(t *testing.T) {
	t.Setenv("ENVIRONMENT", "")
	if got := getEnvironment(); got != "development" {
		t.Fatalf("expected development, got %q", got)
	}

	t.Setenv("ENVIRONMENT", "production")
	if got := getEnvironment(); got != "production" {
		t.Fatalf("expected production, got %q", got)
	}
}

func TestGetEnvInt(t *testing.T) {
	const key = "TEST_INT_ENV"
	const defaultValue = 17

	t.Setenv(key, "")
	if got := getEnvInt(key, defaultValue); got != defaultValue {
		t.Fatalf("empty value should return default %d, got %d", defaultValue, got)
	}

	t.Setenv(key, "abc")
	if got := getEnvInt(key, defaultValue); got != defaultValue {
		t.Fatalf("invalid value should return default %d, got %d", defaultValue, got)
	}

	t.Setenv(key, "-5")
	if got := getEnvInt(key, defaultValue); got != defaultValue {
		t.Fatalf("negative value should return default %d, got %d", defaultValue, got)
	}

	t.Setenv(key, "42")
	if got := getEnvInt(key, defaultValue); got != 42 {
		t.Fatalf("expected parsed value 42, got %d", got)
	}
}
