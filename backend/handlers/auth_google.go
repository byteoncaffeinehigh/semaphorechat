package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
)

type googleTokenInfo struct {
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified string `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
	Aud           string `json:"aud"`
	Error         string `json:"error"`
}

// POST /api/auth/google
// Body: { "idToken": "<Google ID token>" }
func (h *AuthHandler) Google(c *gin.Context) {
	var body struct {
		IDToken string `json:"idToken" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify token with Google
	info, err := verifyGoogleToken(body.IDToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid Google token"})
		return
	}

	// Check audience matches our client ID
	if h.cfg.GoogleClientID != "" && info.Aud != h.cfg.GoogleClientID {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "token audience mismatch"})
		return
	}

	if info.Email == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "no email in token"})
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

func verifyGoogleToken(idToken string) (*googleTokenInfo, error) {
	resp, err := http.Get("https://oauth2.googleapis.com/tokeninfo?id_token=" + idToken)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var info googleTokenInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, err
	}
	if info.Error != "" {
		return nil, fmt.Errorf("google: %s", info.Error)
	}
	return &info, nil
}
