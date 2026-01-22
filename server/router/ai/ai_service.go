package ai

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"

	"github.com/labstack/echo/v4"
)

type AIService struct {
	apiKey string
}

func NewAIService(apiKey string) *AIService {
	return &AIService{
		apiKey: apiKey,
	}
}

type ChatCompletionMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatCompletionRequest struct {
	Model    string                  `json:"model"`
	Messages []ChatCompletionMessage `json:"messages"`
}

func (s *AIService) RegisterRoutes(g *echo.Group) {
	g.POST("/ai/chat_completion", s.ChatCompletion)
}

func (s *AIService) ChatCompletion(c echo.Context) error {
	// 1. Check if API Key is configured
	if s.apiKey == "" {
		// Fallback to Env if not passed in constructor (though constructor should handle it)
		s.apiKey = os.Getenv("MEMOS_OPENAI_API_KEY")
		if s.apiKey == "" {
			s.apiKey = os.Getenv("OPENAI_API_KEY")
		}
	}
	if s.apiKey == "" {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "AI Service not configured (missing API Key)")
	}

	// 2. Bind Request
	reqBody := new(ChatCompletionRequest)
	if err := c.Bind(reqBody); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "Invalid request body").SetInternal(err)
	}

	// 3. Prepare OpenAI/GitHub Models Request
	targetURL := os.Getenv("MEMOS_AI_BASE_URL")
	if targetURL == "" {
		targetURL = "https://models.github.ai/inference/chat/completions"
	}

	// Force model to openai/gpt-4o if not specified
	if reqBody.Model == "" || reqBody.Model == "gpt-4o" {
		reqBody.Model = "openai/gpt-4o"
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Failed to marshal request").SetInternal(err)
	}

	// 4. Send Request to Upstream
	// Debug: Print API key length and prefix
	if len(s.apiKey) > 10 {
		println("AI Service: Using API Key starting with:", s.apiKey[:10], "Length:", len(s.apiKey))
	} else {
		println("AI Service: API Key is likely invalid, length:", len(s.apiKey))
	}

	proxyReq, err := http.NewRequest("POST", targetURL, bytes.NewBuffer(jsonBody))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Failed to create proxy request").SetInternal(err)
	}

	proxyReq.Header.Set("Content-Type", "application/json")
	proxyReq.Header.Set("Authorization", "Bearer "+s.apiKey)

	client := &http.Client{}
	resp, err := client.Do(proxyReq)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "Failed to contact AI provider").SetInternal(err)
	}
	defer resp.Body.Close()

	// 5. Proxy Response Back
	// We read the body and return it directly.
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Failed to read upstream response").SetInternal(err)
	}

	if resp.StatusCode >= 400 {
		println("AI Service: Upstream Error:", resp.StatusCode, string(body))
		// Forward upstream error for debugging
		return c.JSONBlob(resp.StatusCode, body)
	}

	return c.JSONBlob(http.StatusOK, body)
}
