package main

import (
	"fmt"
	"log"
	"net/http"

	"antares-chat/backend/config"
	"antares-chat/backend/db"
	"antares-chat/backend/handlers"
	"antares-chat/backend/middleware"
	wsHub "antares-chat/backend/ws"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	// Load .env if present (ignored in production where env vars are set externally)
	godotenv.Load()

	cfg := config.Load()

	store, err := db.Init(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db init: %v", err)
	}
	defer store.Close()

	hub := wsHub.NewHub()
	go hub.Run()

	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowAllOrigins: true,
		AllowMethods:    []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:    []string{"Authorization", "Content-Type", "ngrok-skip-browser-warning"},
	}))

	// ── Frontend static files ───────────────────────────────────────────────
	r.Static("/js",  "../frontend/js")
	r.StaticFile("/style.css",  "../frontend/style.css")
	r.StaticFile("/sw.js",      "../frontend/sw.js")
	r.StaticFile("/icon.svg",   "../frontend/icon.svg")
	r.StaticFile("/",           "../frontend/index.html")

	// Config injection — exposes server-side env vars to the browser
	r.GET("/config.js", func(c *gin.Context) {
		js := fmt.Sprintf("window.VAPID_PUBLIC_KEY=%q;\n", cfg.VAPIDPublicKey)
		c.Data(http.StatusOK, "application/javascript; charset=utf-8", []byte(js))
	})

	// ── Public routes ──────────────────────────────────────────────────────
	authH := handlers.NewAuthHandler(store, cfg)
	r.POST("/api/auth/register", authH.Register)
	r.POST("/api/auth/login", authH.Login)
	r.POST("/api/auth/refresh", authH.Refresh)

	// WebSocket (authenticates via ?token= query param)
	wsH := handlers.NewWSHandler(store, hub, cfg.JWTSecret)
	r.GET("/ws", wsH.Handle)

	// ── Protected routes ───────────────────────────────────────────────────
	api := r.Group("/api", middleware.Auth(cfg.JWTSecret))

	usersH := handlers.NewUserHandler(store, hub)
	api.GET("/me", usersH.GetMe)
	api.PUT("/me", usersH.UpdateMe)
	api.GET("/users", usersH.FindByEmail)
	api.POST("/users/presence", usersH.SetPresence)

	chatsH := handlers.NewChatHandler(store, hub)
	api.GET("/chats", chatsH.List)
	api.POST("/chats", chatsH.Create)
	api.GET("/chats/:id", chatsH.Get)

	msgsH := handlers.NewMessageHandler(store, hub)
	api.GET("/chats/:id/messages", msgsH.List)
	api.POST("/chats/:id/messages", msgsH.Send)
	api.PUT("/chats/:id/read", msgsH.MarkRead)

	callsH := handlers.NewCallHandler(store, hub)
	api.POST("/calls/:chatId", callsH.Initiate)
	api.PUT("/calls/:chatId", callsH.Update)
	api.GET("/calls/:chatId", callsH.Get)
	api.POST("/calls/:chatId/candidates", callsH.AddCandidate)

	pushH := handlers.NewPushHandler(store, cfg)
	api.POST("/push/subscribe", pushH.Subscribe)
	api.POST("/push/expo-token", pushH.ExpoSubscribe)
	api.POST("/notify", pushH.Notify)

	// health
	r.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"ok": true}) })

	log.Printf("listening on :%s (frontend: %s)", cfg.Port, cfg.FrontendURL)
	log.Fatal(http.ListenAndServe(":"+cfg.Port, r))
}
