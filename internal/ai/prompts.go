package ai

// Prompts for each pipeline stage — kept SHORT to avoid gateway timeouts.
const SystemBase = `You are an editorial assistant for Content Loop. Respond in brief language (default ru). Be concise, factual.`

const PromptPlanTopic = `plan_topic: refine title, output JSON {"title":"...","reason":"..."}. Title <80 chars. JSON only.`

const PromptBuildBrief = `build_brief: create scaffold brief JSON. Output JSON only, no fence: {"goal":"...","audience":"...","claims":[{"text":"claim","source":"url or null"}],"sources":["url"],"outline":["H2","H2"]}. JSON only.`

const PromptDraftCanonical = `draft_canonical: write a short article in markdown, 500-800 words. Return JSON ONLY, no fence, no extra text: {"title":"...","excerpt":"1-2 sentences","body_markdown":"markdown 500-800 words with ## h2, lists, bold, [n] citations","claims":["claim"],"sources":["url"]}. Keep body_markdown concise — 500-800 words max. Respond ONLY with JSON.`

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
