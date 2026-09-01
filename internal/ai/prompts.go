package ai

import (
	"encoding/json"
	"regexp"
	"strings"
)

// SystemBase — detailed human-editor voice: коротко, живо, без штампов AI, как носитель.
const SystemBase = `You are a senior human editor and native Russian copywriter for Content Loop.
Voice: коротко, живо, без штампов AI, как носитель языка. Пиши конкретно, фактами, без воды.
- Абзацы короткие: 2-3 предложения, одна мысль = один абзац.
- Без канцелярита и клише AI: не используй "в современном мире", "в эпоху цифровизации", "раскроем секреты", "погрузимся", "delve", "tapestry", "unlock the potential", "embark", "ever-evolving", "cutting-edge".
- Никаких "как искусственный интеллект" / "as an AI". Пиши как человек.
- Приоритет: конкретика > общие слова. Примеры, цифры, кейсы.
- Тон: уверенный, дружелюбный, без пафоса. Короткие предложения.
Respond in natural language (default ru unless topic requires en). Be concise, factual, human.`

const PromptPlanTopic = `plan_topic: refine title, output JSON {"title":"...","reason":"..."}. Title <80 chars. JSON only.`

const PromptBuildBrief = `build_brief: create scaffold brief JSON. Output JSON only, no fence: {"goal":"...","audience":"...","claims":[{"text":"claim","source":"url or null"}],"sources":["url"],"outline":["H2","H2"]}. JSON only.`

const PromptDraftCanonical = `draft_canonical: write a short article in markdown (500-800 words) — ЖИВОЙ человеческий стиль.
Requirements:
- Стиль: коротко, живо, как носитель. Короткие абзацы по 2-3 предложения, без воды.
- Структура обязательна: ## заголовки H2, списки (- или 1.), цитата > где уместно, **жирный** для акцентов, [n] citations для claims.
- Конкретика: примеры, цифры, мини-кейсы. Каждый тезис подкрепляй примером или фактом.
- CTA в конце: один чёткий призыв к действию.
- ЗАПРЕТ AI-штампов: не используй "в современном мире", "в современном быстро меняющемся мире", "в заключение", "погрузимся", "раскроем", "delve", "tapestry", "dive into", "unlock", "embark", "ever-evolving", "in conclusion", "it's important to note", "as an AI".
- Тон бери из policy.tone если передан, иначе дружелюбно-профессиональный.
- Banned phrases из policy.banned_phrases — строго не использовать.
- Примеры стиля из policy.examples — ориентируйся на них.
Return JSON ONLY, no fence, no extra text: {"title":"...","excerpt":"1-2 sentences","body_markdown":"markdown 500-800 words with ## h2, lists, bold, [n] citations","claims":["claim"],"sources":["url"]}. Keep body_markdown concise — 500-800 words max. Respond ONLY with JSON.`

const PromptRenderTelegram = `Adapt to Telegram: 4096 chars max, no tables, *bold* _italic_, short paras, CTA. Plain text, <3500 chars.`

const PromptRenderFamilyOS = `Adapt to FamilyOS markdown: keep headings/lists/links, add title. Output markdown, <3000 chars.`

func trunc(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

func UserPlanTopic(title, existingTitles string) string {
	return "plan_topic input:\ntitle: " + trunc(title, 100) + "\nexisting: " + trunc(existingTitles, 300) + "\n" + PromptPlanTopic
}
func UserBuildBrief(title, projectJSON, briefHint string) string {
	return "build_brief input:\ntitle: " + trunc(title, 100) + "\nproject: " + trunc(projectJSON, 400) + "\nbrief_hint: " + trunc(briefHint, 500) + "\n" + PromptBuildBrief
}
func UserDraftCanonical(title, briefJSON string) string {
	return "draft_canonical input:\ntitle: " + trunc(title, 100) + "\nbrief: " + trunc(briefJSON, 2000) + "\n" + PromptDraftCanonical
}
func UserRenderTelegram(canonicalBody string) string {
	return "render telegram input:\n" + trunc(canonicalBody, 2000) + "\n" + PromptRenderTelegram
}
func UserRenderFamilyOS(canonicalBody string) string {
	return "render familyos input:\n" + trunc(canonicalBody, 2000) + "\n" + PromptRenderFamilyOS
}

// HumanSystemPrompt returns SystemBase adapted to a specific tone.
// If tone is empty, returns SystemBase unchanged.
func HumanSystemPrompt(tone string) string {
	tone = strings.TrimSpace(tone)
	if tone == "" {
		return SystemBase
	}
	return SystemBase + "\n\nАктуальный тон для этого материала: " + tone + ". Пиши строго в этом тоне, сохраняя живость и краткость."
}

// aiPhrases — clichés to strip (case-insensitive, EN+RU).
var aiPhrases = []string{
	"в современном мире",
	"в современном быстро меняющемся мире",
	"в эпоху цифровизации",
	"в эпоху цифровой трансформации",
	"раскроем секреты",
	"погрузимся",
	"погрузимся в мир",
	"давайте погрузимся",
	"в заключение",
	"в заключении",
	"важно отметить",
	"стоит отметить",
	"как искусственный интеллект",
	"as an ai",
	"i am an ai",
	"delve",
	"tapestry",
	"dive into",
	"unlock the potential",
	"unlock",
	"embark",
	"ever-evolving",
	"cutting-edge",
	"in conclusion",
	"it's important to note",
	"it is important to note",
}

// AiPhrases exported for API
var AiPhrases = aiPhrases

var aiPhrasesRe []*regexp.Regexp

func init() {
	for _, p := range aiPhrases {
		re := regexp.MustCompile(`(?i)` + regexp.QuoteMeta(p))
		aiPhrasesRe = append(aiPhrasesRe, re)
	}
}

// CleanAIisms removes common AI clichés (case-insensitive) and tidies whitespace.
func CleanAIisms(s string) string {
	for i, re := range aiPhrasesRe {
		_ = i
		s = re.ReplaceAllString(s, "")
	}
	// also handle banned phrases that may leave double spaces / empty lines
	s = regexp.MustCompile(`[ \t]{2,}`).ReplaceAllString(s, " ")
	s = regexp.MustCompile(`\n{3,}`).ReplaceAllString(s, "\n\n")
	// remove lines that became empty with only punctuation left like ", ,"
	s = strings.TrimSpace(s)
	return s
}

// BuildDraftPromptWithPolicy builds a draft prompt enriched with policyJSON.
// policyJSON is expected to be JSON (e.g. project.policy or full project JSON).
// It extracts tone / banned_phrases / examples if present and injects them.
func BuildDraftPromptWithPolicy(title, briefJSON, policyJSON string) string {
	title = trunc(strings.TrimSpace(title), 100)
	briefJSON = trunc(strings.TrimSpace(briefJSON), 2000)

	var tone string
	var banned []string
	var examples []string

	if strings.TrimSpace(policyJSON) != "" {
		var raw map[string]any
		if err := json.Unmarshal([]byte(policyJSON), &raw); err == nil {
			// support both flat policy and nested {policy: {...}} or {project: {...}}
			src := raw
			if nested, ok := raw["policy"].(map[string]any); ok {
				src = nested
			} else if p, ok := raw["project"].(map[string]any); ok {
				if pp, ok := p["policy"].(map[string]any); ok {
					src = pp
				}
			}
			// also if raw itself has policy string (json-encoded string)
			if s, ok := raw["policy"].(string); ok && s != "" {
				var psrc map[string]any
				if err2 := json.Unmarshal([]byte(s), &psrc); err2 == nil {
					src = psrc
				}
			}
			if v, ok := src["tone"].(string); ok {
				tone = v
			} else if v, ok := raw["tone"].(string); ok {
				tone = v
			}
			if v, ok := src["voice"].(string); ok && tone == "" {
				tone = v
			}
			// banned_phrases
			if v, ok := src["banned_phrases"].([]any); ok {
				for _, x := range v {
					if s, ok := x.(string); ok && s != "" {
						banned = append(banned, s)
					}
				}
			} else if v, ok := raw["banned_phrases"].([]any); ok {
				for _, x := range v {
					if s, ok := x.(string); ok && s != "" {
						banned = append(banned, s)
					}
				}
			}
			// examples
			if v, ok := src["examples"].([]any); ok {
				for _, x := range v {
					if s, ok := x.(string); ok && s != "" {
						examples = append(examples, s)
					}
				}
			} else if v, ok := src["examples"].(string); ok && v != "" {
				examples = append(examples, v)
			} else if v, ok := raw["examples"].([]any); ok {
				for _, x := range v {
					if s, ok := x.(string); ok {
						examples = append(examples, s)
					}
				}
			}
		}
	}

	var b strings.Builder
	b.WriteString("draft_canonical input:\ntitle: ")
	b.WriteString(title)
	b.WriteString("\nbrief: ")
	b.WriteString(briefJSON)
	if tone != "" {
		b.WriteString("\npolicy_tone: ")
		b.WriteString(trunc(tone, 200))
	}
	if len(banned) > 0 {
		b.WriteString("\nbanned_phrases: ")
		b.WriteString(trunc(strings.Join(banned, "; "), 500))
	}
	if len(examples) > 0 {
		b.WriteString("\nexamples: ")
		b.WriteString(trunc(strings.Join(examples, " | "), 800))
	}
	// also include raw policy snippet for model context (truncated)
	if strings.TrimSpace(policyJSON) != "" {
		// avoid duplicating if already injected fine-grained fields and policyJSON is huge
		rawSnippet := trunc(policyJSON, 800)
		// only append raw if not already fully represented
		if len(banned) == 0 && len(examples) == 0 && tone == "" {
			b.WriteString("\npolicy: ")
			b.WriteString(rawSnippet)
		}
	}
	b.WriteString("\n")
	b.WriteString(PromptDraftCanonical)
	if tone != "" {
		b.WriteString("\nTone: ")
		b.WriteString(trunc(tone, 200))
		b.WriteString(".")
	}
	return b.String()
}
