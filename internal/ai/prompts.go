package ai

// Prompts for each pipeline stage.
// Keep them short and deterministic; model = kimi-k2.5 via opencode-go.

const SystemBase = `You are an editorial assistant for Content Loop. Respond in the language of the user's brief (default ru). Be concise, factual, cite sources with [n].`

const PromptPlanTopic = `plan_topic: Given a content_item title and project policy, propose a refined topic title. Check for duplication hint will be provided. Output JSON: {"title":"...","reason":"..."}. Keep title under 80 chars.`

const PromptBuildBrief = `build_brief: Given title, project channels/languages/policy, create a scaffold brief JSON. Output JSON only, no markdown fence: {"goal":"...","audience":"...","claims":[{"text":"claim","source":"url or null"}],"sources":["url"],"outline":["H2","H2"]}. If no real sources, use https://example.com placeholders but mark as placeholder.`

const PromptDraftCanonical = `draft_canonical: You are drafting the canonical markdown body for a content item. Given brief JSON and title, produce JSON ONLY. Respond ONLY with JSON object, no surrounding text, no markdown fences: {"title":"...","excerpt":"1-2 sentences","body_markdown":"markdown 800-3000 chars with h2/h3, lists, bold, links","claims":["claim strings"],"sources":["urls"]}. Claims must appear in body as [n] citations. Body must be valid markdown. Respond ONLY with JSON.`

const PromptRenderTelegram = `render_variant telegram: Adapt canonical body_markdown to Telegram channel. Telegram limit 4096 chars, no markdown tables, use *bold* and _italic_ where needed, keep links as https URLs, short paragraphs, CTA at end. Output plain text ready to send. Keep under 3500 chars.`

const PromptRenderFamilyOS = `render_variant familyos: Adapt canonical body_markdown to FamilyOS (PattayaDom) channel. Produce markdown suitable for FamilyOS API: keep headings, lists, links, add frontmatter-like title, preserve claims. Output markdown.`

// Helpers to build user messages
func UserPlanTopic(title, existingTitles string) string {
	return "plan_topic input:\ntitle: " + title + "\nexisting_titles_like: " + existingTitles + "\n" + PromptPlanTopic
}
func UserBuildBrief(title, projectJSON, briefHint string) string {
	return "build_brief input:\ntitle: " + title + "\nproject: " + projectJSON + "\nbrief_hint: " + briefHint + "\n" + PromptBuildBrief
}
func UserDraftCanonical(title, briefJSON string) string {
	return "draft_canonical input:\ntitle: " + title + "\nbrief: " + briefJSON + "\n" + PromptDraftCanonical + "\nIMPORTANT: Respond ONLY with JSON {\"title\",\"excerpt\",\"body_markdown\",\"claims\",\"sources\"} — no fence, no extra text."
}
func UserRenderTelegram(canonicalBody string) string {
	return "render_variant telegram input:\ncanonical_body:\n" + canonicalBody + "\n" + PromptRenderTelegram
}
func UserRenderFamilyOS(canonicalBody string) string {
	return "render_variant familyos input:\ncanonical_body:\n" + canonicalBody + "\n" + PromptRenderFamilyOS
}
