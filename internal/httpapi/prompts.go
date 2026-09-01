package httpapi

import (
	"net/http"

	"github.com/ai-synthetix/content-loop/internal/ai"
)

func (s *Server) handleListPrompts(w http.ResponseWriter, r *http.Request) {
	// expose hardcoded prompts for observability / future admin editing
	writeJSON(w, http.StatusOK, map[string]any{
		"prompts": []map[string]string{
			{"key": "SystemBase", "label": "System — human editor voice", "prompt": ai.SystemBase},
			{"key": "PromptPlanTopic", "label": "plan_topic", "prompt": ai.PromptPlanTopic},
			{"key": "PromptBuildBrief", "label": "build_brief", "prompt": ai.PromptBuildBrief},
			{"key": "PromptDraftCanonical", "label": "draft_canonical (human style)", "prompt": ai.PromptDraftCanonical},
			{"key": "PromptRenderTelegram", "label": "render — Telegram", "prompt": ai.PromptRenderTelegram},
			{"key": "PromptRenderFamilyOS", "label": "render — FamilyOS", "prompt": ai.PromptRenderFamilyOS},
		},
		"ai_phrases": ai.AiPhrases,
		"note": "Read-only preview. Future admin will allow per-project overrides (policy.tone / banned_phrases / examples).",
	})
}
