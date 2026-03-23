package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"antares-chat/backend/config"
	"antares-chat/backend/db"
	"antares-chat/backend/middleware"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct {
	store *db.Store
	cfg   *config.Config
}

func NewAuthHandler(store *db.Store, cfg *config.Config) *AuthHandler {
	return &AuthHandler{store: store, cfg: cfg}
}

// POST /api/auth/register
func (h *AuthHandler) Register(c *gin.Context) {
	var body struct {
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required,min=6"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server error"})
		return
	}

	user, err := h.store.CreateUser(c, body.Email, string(hash), "", "", "")
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "email already in use"})
		return
	}

	accessToken, refreshToken, err := h.issueTokens(user.ID, user.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server error"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{
		"user":         user,
		"accessToken":  accessToken,
		"refreshToken": refreshToken,
	})
}

// POST /api/auth/login
func (h *AuthHandler) Login(c *gin.Context) {
	var body struct {
		Email    string `json:"email" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, hash, err := h.store.GetPasswordHash(c, body.Email)
	if err == pgx.ErrNoRows || hash == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server error"})
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(body.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	user, err := h.store.GetUserByID(c, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server error"})
		return
	}

	accessToken, refreshToken, err := h.issueTokens(user.ID, user.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server error"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"user":         user,
		"accessToken":  accessToken,
		"refreshToken": refreshToken,
	})
}

// POST /api/auth/google
// Body: { idToken: string }  (Google credential JWT from frontend GSI)
func (h *AuthHandler) GoogleLogin(c *gin.Context) {
	var body struct {
		IDToken string `json:"idToken" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	info, err := verifyGoogleToken(c, body.IDToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid Google token"})
		return
	}

	user, err := h.store.CreateUser(c, info.Email, "", info.Sub, info.Name, info.Picture)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server error"})
		return
	}

	accessToken, refreshToken, err := h.issueTokens(user.ID, user.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server error"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"user":         user,
		"accessToken":  accessToken,
		"refreshToken": refreshToken,
	})
}

// POST /api/auth/refresh
func (h *AuthHandler) Refresh(c *gin.Context) {
	var body struct {
		RefreshToken string `json:"refreshToken" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	claims := &middleware.Claims{}
	token, err := jwt.ParseWithClaims(body.RefreshToken, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(h.cfg.JWTRefreshSecret), nil
	})
	if err != nil || !token.Valid {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid refresh token"})
		return
	}

	accessToken, _, err := h.issueTokens(claims.UserID, claims.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server error"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"accessToken": accessToken})
}

func (h *AuthHandler) issueTokens(userID, email string) (string, string, error) {
	now := time.Now()
	access := jwt.NewWithClaims(jwt.SigningMethodHS256, &middleware.Claims{
		UserID: userID,
		Email:  email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(15 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	})
	refresh := jwt.NewWithClaims(jwt.SigningMethodHS256, &middleware.Claims{
		UserID: userID,
		Email:  email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(30 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	})

	at, err := access.SignedString([]byte(h.cfg.JWTSecret))
	if err != nil {
		return "", "", err
	}
	rt, err := refresh.SignedString([]byte(h.cfg.JWTRefreshSecret))
	if err != nil {
		return "", "", err
	}
	return at, rt, nil
}

// verifyGoogleToken calls Google's tokeninfo endpoint to validate the ID token.
type googleTokenInfo struct {
	Sub     string `json:"sub"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
}

func verifyGoogleToken(ctx context.Context, idToken string) (*googleTokenInfo, error) {
	url := "https://oauth2.googleapis.com/tokeninfo?id_token=" + idToken
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("google tokeninfo status %d", resp.StatusCode)
	}
	var info googleTokenInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, err
	}
	if info.Email == "" {
		return nil, fmt.Errorf("no email in google token")
	}
	return &info, nil
}
