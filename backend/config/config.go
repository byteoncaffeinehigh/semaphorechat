package config

import (
	"log"
	"os"
)

type Config struct {
	DatabaseURL      string
	JWTSecret        string
	JWTRefreshSecret string
	Port             string
	FrontendURL      string
	VAPIDPublicKey   string
	VAPIDPrivateKey  string
	VAPIDEmail       string
	GoogleClientID   string
}

func Load() *Config {
	cfg := &Config{
		DatabaseURL:      getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/antares_chat?sslmode=disable"),
		JWTSecret:        mustEnv("JWT_SECRET"),
		JWTRefreshSecret: mustEnv("JWT_REFRESH_SECRET"),
		Port:             getEnv("PORT", "8080"),
		FrontendURL:      getEnv("FRONTEND_URL", "http://localhost:8080"),
		VAPIDPublicKey:   getEnv("VAPID_PUBLIC_KEY", ""),
		VAPIDPrivateKey:  getEnv("VAPID_PRIVATE_KEY", ""),
		VAPIDEmail:       getEnv("VAPID_EMAIL", "mailto:admin@example.com"),
		GoogleClientID:   getEnv("GOOGLE_CLIENT_ID", ""),
	}
	return cfg
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("required env var %s is not set", key)
	}
	return v
}
